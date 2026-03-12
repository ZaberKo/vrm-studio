/**
 * Translates a VRM 0.0 ArrayBuffer into a VRM 1.0 ArrayBuffer.
 * This script intercepts the GLB, modifies the JSON chunk, and repackages it.
 */

export async function migrateVRM(arrayBuffer, onMigrate) {
  const dataView = new DataView(arrayBuffer);
  
  // 1. Validate GLB Header
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546C67) { // 'glTF'
    return { buffer: arrayBuffer, migrated: false }; // Not a GLB, let the normal loader handle it
  }

  const version = dataView.getUint32(4, true);
  if (version !== 2) {
    return { buffer: arrayBuffer, migrated: false };
  }

  // 2. Parse Chunk 0 (JSON)
  let jsonChunkLength = dataView.getUint32(12, true);
  let jsonChunkType = dataView.getUint32(16, true);
  
  if (jsonChunkType !== 0x4E4F534A) { // 'JSON'
    return { buffer: arrayBuffer, migrated: false }; // No JSON chunk where expected
  }

  const jsonChunkOffset = 20;
  const jsonBuffer = new Uint8Array(arrayBuffer, jsonChunkOffset, jsonChunkLength);
  const textDecoder = new TextDecoder('utf-8');
  const jsonString = textDecoder.decode(jsonBuffer);
  let json;
  try {
    json = JSON.parse(jsonString);
  } catch (e) {
    return { buffer: arrayBuffer, migrated: false };
  }

  // 3. Check if it's a VRM 0.0 file
  if (!json.extensions || !json.extensions.VRM) {
    return { buffer: arrayBuffer, migrated: false }; // Not VRM 0.0
  }

  console.log("VRM 0.0 detected. Migrating to VRM 1.0 format...");
  if (onMigrate) {
    onMigrate();
    // Yield to the browser so it can render the updated text
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  const vrm0 = json.extensions.VRM;
  
  // 4. Create VRMC_vrm structure
  const vrm1 = {
    specVersion: "1.0",
    meta: {},
    humanoid: {
      humanBones: {}
    },
    expressions: {
      preset: {},
      custom: {}
    },
    firstPerson: {
      meshAnnotations: []
    },
    lookAt: {
      offsetFromHeadBone: [0, 0.06, 0],
      type: "expression",
      rangeMapHorizontalInner: { inputMaxValue: 90, outputScalingTerm: 10 },
      rangeMapHorizontalOuter: { inputMaxValue: 90, outputScalingTerm: 10 },
      rangeMapVerticalDown: { inputMaxValue: 90, outputScalingTerm: 10 },
      rangeMapVerticalUp: { inputMaxValue: 90, outputScalingTerm: 10 }
    }
  };

  // 4a. Map Meta
  if (vrm0.meta) {
    vrm1.meta = {
      name: vrm0.meta.title || "Unknown",
      version: vrm0.meta.version || "1.0",
      authors: vrm0.meta.author ? [vrm0.meta.author] : ["Unknown"],
      copyrightInformation: "",
      contactInformation: vrm0.meta.contactInformation || "",
      references: vrm0.meta.reference ? [vrm0.meta.reference] : [],
      commercialUsage: vrm0.meta.commercialUssageName === "Allow" ? "personalProfit" : "personalNonProfit", 
      creditNotation: vrm0.meta.creditNaming === "Unnecessary" ? "unnecessary" : "required",
      modification: vrm0.meta.modificationName === "Allow" ? "allowModification" : "prohibited",
      avatarPermission: "everyone",
      allowExcessivelyViolentUsage: vrm0.meta.violentUssageName === "Allow",
      allowExcessivelySexualUsage: vrm0.meta.sexualUssageName === "Allow",
      allowPoliticalOrReligiousUsage: false,
      allowAntisocialOrHateUsage: false,
      licenseUrl: "https://vrm.dev/licenses/1.0/"
    };
    
    if (vrm0.meta.otherLicenseUrl) {
        vrm1.meta.otherLicenseUrl = vrm0.meta.otherLicenseUrl;
    }

    if (vrm0.meta.otherPermissionUrl) {
        vrm1.meta.thirdPartyLicenses = vrm0.meta.otherPermissionUrl;
    }
    
    if (vrm0.meta.allowedUserName === "OnlyAuthor") {
      vrm1.meta.avatarPermission = "onlyAuthor";
    } else if (vrm0.meta.allowedUserName === "ExplicitlyLicensedPerson") {
      vrm1.meta.avatarPermission = "onlySeparatelyLicensedPerson";
    }

    if (vrm0.meta.texture !== undefined) {
      vrm1.meta.thumbnailImage = vrm0.meta.texture;
    }
  }

  // 4b. Map Humanoid Bones
  if (vrm0.humanoid && vrm0.humanoid.humanBones) {
    for (const bone of vrm0.humanoid.humanBones) {
      if (bone.node !== undefined && bone.bone) {
        let boneName = bone.bone;
        const mappedName = boneName.charAt(0).toLowerCase() + boneName.slice(1);
        vrm1.humanoid.humanBones[mappedName] = { node: bone.node };
      }
    }
  }

  // 4c. Map Expressions (BlendShapes)
  if (vrm0.blendShapeMaster && vrm0.blendShapeMaster.blendShapeGroups) {
    const presetMap = {
      joy: "happy",
      angry: "angry",
      sorrow: "sad",
      fun: "relaxed",
      a: "aa",
      i: "ih",
      u: "ou",
      e: "ee",
      o: "oh",
      neutral: "neutral",
      blink: "blink",
      blink_l: "blinkLeft",
      blink_r: "blinkRight",
      lookup: "lookUp",
      lookdown: "lookDown",
      lookleft: "lookLeft",
      lookright: "lookRight",
    };

    for (const group of vrm0.blendShapeMaster.blendShapeGroups) {
      const name = group.name;
      const presetName = group.presetName;
      
      let morphTargetBinds = [];
      if (group.binds) {
        morphTargetBinds = group.binds.map(b => ({
          node: b.mesh, 
          index: b.index,
          weight: (b.weight !== undefined ? b.weight : 100) / 100.0
        }));
      }

      let expData = {
        isBinary: group.isBinary || false,
        overrideBlink: "none",
        overrideLookAt: "none",
        overrideMouth: "none",
        morphTargetBinds: morphTargetBinds.length > 0 ? morphTargetBinds : undefined
      };

      if (presetName && presetMap[presetName.toLowerCase()]) {
        vrm1.expressions.preset[presetMap[presetName.toLowerCase()]] = expData;
      } else {
        vrm1.expressions.custom[name] = expData;
      }
    }
  }

  // 4d. Map FirstPerson and LookAt
  if (vrm0.firstPerson) {
    if (vrm0.firstPerson.firstPersonBoneOffset) {
      const offset = vrm0.firstPerson.firstPersonBoneOffset;
      vrm1.lookAt.offsetFromHeadBone = [offset.x || 0, offset.y || 0.06, offset.z || 0];
    }
    if (vrm0.firstPerson.lookAtTypeName) {
      vrm1.lookAt.type = vrm0.firstPerson.lookAtTypeName.toLowerCase() === "bone" ? "bone" : "expression";
    }
    if (vrm0.firstPerson.meshAnnotations) {
      vrm1.firstPerson.meshAnnotations = vrm0.firstPerson.meshAnnotations.map(a => ({
        node: a.mesh || 0,
        type: a.firstPersonFlag === "FirstPersonOnly" ? "firstPersonOnly" : 
              a.firstPersonFlag === "ThirdPersonOnly" ? "thirdPersonOnly" : 
              a.firstPersonFlag === "AutoMobile" ? "autoMobile" : "both"
      }));
    }
    
    const mapRange = (src) => {
      if (!src) return undefined;
      return {
        inputMaxValue: src.curve && src.curve.length > 0 ? (src.curve[src.curve.length-1].x || 90) : 90,
        outputScalingTerm: src.xRange || 10
      };
    };
    
    if (vrm0.firstPerson.lookAtHorizontalInner) vrm1.lookAt.rangeMapHorizontalInner = mapRange(vrm0.firstPerson.lookAtHorizontalInner);
    if (vrm0.firstPerson.lookAtHorizontalOuter) vrm1.lookAt.rangeMapHorizontalOuter = mapRange(vrm0.firstPerson.lookAtHorizontalOuter);
    if (vrm0.firstPerson.lookAtVerticalDown) vrm1.lookAt.rangeMapVerticalDown = mapRange(vrm0.firstPerson.lookAtVerticalDown);
    if (vrm0.firstPerson.lookAtVerticalUp) vrm1.lookAt.rangeMapVerticalUp = mapRange(vrm0.firstPerson.lookAtVerticalUp);
  }

  // 4e. Map SpringBone
  let vrmcSpringBone = null;
  if (vrm0.secondaryAnimation) {
    vrmcSpringBone = {
      specVersion: "1.0",
      colliders: [],
      colliderGroups: [],
      springs: []
    };
    
    if (vrm0.secondaryAnimation.colliderGroups) {
      vrm0.secondaryAnimation.colliderGroups.forEach((cg, idx) => {
        const colliderIndices = [];
        if (cg.colliders) {
          cg.colliders.forEach(c => {
            const colliderIdx = vrmcSpringBone.colliders.length;
            vrmcSpringBone.colliders.push({
              node: cg.node,
              shape: {
                sphere: {
                  offset: [c.offset.x || 0, c.offset.y || 0, c.offset.z || 0],
                  radius: c.radius || 0.1
                }
              }
            });
            colliderIndices.push(colliderIdx);
          });
        }
        vrmcSpringBone.colliderGroups.push({
          name: `ColliderGroup_${idx}`,
          colliders: colliderIndices
        });
      });
    }
    
    if (vrm0.secondaryAnimation.boneGroups) {
      vrm0.secondaryAnimation.boneGroups.forEach((bg, idx) => {
        if (!bg.bones || bg.bones.length === 0) return;
        
        // VRM 0.0 "bones" were root joints. Split each root into a separate 1.0 "spring".
        bg.bones.forEach((boneNodeIdx, bIdx) => {
          vrmcSpringBone.springs.push({
            name: (bg.comment || `Spring_${idx}`) + (bg.bones.length > 1 ? `_${bIdx}` : ''),
            joints: [{
              node: boneNodeIdx,
              stiffness: bg.stiffiness || 1.0,
              gravityPower: bg.gravityPower || 0,
              gravityDir: bg.gravityDir ? [bg.gravityDir.x || 0, bg.gravityDir.y || -1, bg.gravityDir.z || 0] : [0, -1, 0],
              dragForce: bg.dragForce || 0.4,
              hitRadius: bg.hitRadius || 0.02
            }],
            colliderGroups: bg.colliderGroups || []
          });
        });
      });
    }
  }

  if (json.nodes) {
    const meshToNode = {};
    for (let i = 0; i < json.nodes.length; i++) {
       if (json.nodes[i].mesh !== undefined) {
         meshToNode[json.nodes[i].mesh] = i;
       }
    }

    const fixExpDictionary = (expDict) => {
      for (const key in expDict) {
        const exp = expDict[key];
        if (exp.morphTargetBinds) {
          exp.morphTargetBinds.forEach(bind => {
            if (meshToNode[bind.node] !== undefined) bind.node = meshToNode[bind.node];
          });
        }
      }
    };
    fixExpDictionary(vrm1.expressions.preset);
    fixExpDictionary(vrm1.expressions.custom);
    
    if (vrm1.firstPerson.meshAnnotations) {
      vrm1.firstPerson.meshAnnotations.forEach(a => {
        if (meshToNode[a.node] !== undefined) a.node = meshToNode[a.node];
      });
    }
  }

  // 5. Apply the 180 degree rotation around Y axis to root nodes
  if (json.scenes && json.scenes[json.scene] && json.scenes[json.scene].nodes) {
    const rootNodes = json.scenes[json.scene].nodes;
    for (const nodeId of rootNodes) {
      const node = json.nodes[nodeId];
      if (node) {
        if (!node.rotation) {
          node.rotation = [0, 0, 0, 1];
        }
        const x1 = node.rotation[0], y1 = node.rotation[1], z1 = node.rotation[2], w1 = node.rotation[3];
        const x2 = 0, y2 = 1, z2 = 0, w2 = 0;
        node.rotation[0] = x1 * w2 + y1 * z2 - z1 * y2 + w1 * x2;
        node.rotation[1] = -x1 * z2 + y1 * w2 + z1 * x2 + w1 * y2;
        node.rotation[2] = x1 * y2 - y1 * x2 + z1 * w2 + w1 * z2;
        node.rotation[3] = -x1 * x2 - y1 * y2 - z1 * z2 + w1 * w2;
      }
    }
  }

  // 6. Replace Extensions
  delete json.extensions.VRM;
  
  if (!json.extensions) json.extensions = {};
  json.extensions.VRMC_vrm = vrm1;
  if (vrmcSpringBone) json.extensions.VRMC_springBone = vrmcSpringBone;

  if (json.extensionsUsed) {
    json.extensionsUsed = json.extensionsUsed.filter(e => e !== 'VRM');
    if (!json.extensionsUsed.includes('VRMC_vrm')) json.extensionsUsed.push('VRMC_vrm');
    if (vrmcSpringBone && !json.extensionsUsed.includes('VRMC_springBone')) json.extensionsUsed.push('VRMC_springBone');
  } else {
    json.extensionsUsed = ['VRMC_vrm'];
    if (vrmcSpringBone) json.extensionsUsed.push('VRMC_springBone');
  }

  // 7. Serialize back
  const textEncoder = new TextEncoder();
  const newJsonString = JSON.stringify(json);
  let newJsonBuffer = textEncoder.encode(newJsonString);

  const paddingLength = (4 - (newJsonBuffer.length % 4)) % 4;
  if (paddingLength > 0) {
    const paddedBuffer = new Uint8Array(newJsonBuffer.length + paddingLength);
    paddedBuffer.set(newJsonBuffer);
    for (let i = 0; i < paddingLength; i++) paddedBuffer[newJsonBuffer.length + i] = 0x20;
    newJsonBuffer = paddedBuffer;
  }

  const newJsonChunkLength = newJsonBuffer.length;
  const chunkLengthDiff = newJsonChunkLength - jsonChunkLength;
  
  // 8. Rebuild ArrayBuffer
  const newArrayBuffer = new ArrayBuffer(arrayBuffer.byteLength + chunkLengthDiff);
  const newDataView = new DataView(newArrayBuffer);
  const newUint8Array = new Uint8Array(newArrayBuffer);
  const oldUint8Array = new Uint8Array(arrayBuffer);

  newUint8Array.set(oldUint8Array.subarray(0, 20), 0);
  newDataView.setUint32(8, arrayBuffer.byteLength + chunkLengthDiff, true);
  newDataView.setUint32(12, newJsonChunkLength, true);
  newUint8Array.set(newJsonBuffer, 20);
  newUint8Array.set(oldUint8Array.subarray(20 + jsonChunkLength), 20 + newJsonChunkLength);

  console.log("Migration complete.");
  return { buffer: newArrayBuffer, migrated: true };
}
