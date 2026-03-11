/**
 * Translates a VRM 0.0 ArrayBuffer into a VRM 1.0 ArrayBuffer.
 * This script intercepts the GLB, modifies the JSON chunk, and repackages it.
 */

export async function migrateVRM(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);
  
  // 1. Validate GLB Header
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546C67) { // 'glTF'
    return arrayBuffer; // Not a GLB, let the normal loader handle it
  }

  const version = dataView.getUint32(4, true);
  if (version !== 2) {
    return arrayBuffer;
  }

  // 2. Parse Chunk 0 (JSON)
  let jsonChunkLength = dataView.getUint32(12, true);
  let jsonChunkType = dataView.getUint32(16, true);
  
  if (jsonChunkType !== 0x4E4F534A) { // 'JSON'
    return arrayBuffer; // No JSON chunk where expected
  }

  const jsonChunkOffset = 20;
  const jsonBuffer = new Uint8Array(arrayBuffer, jsonChunkOffset, jsonChunkLength);
  const textDecoder = new TextDecoder('utf-8');
  const jsonString = textDecoder.decode(jsonBuffer);
  let json;
  try {
    json = JSON.parse(jsonString);
  } catch (e) {
    return arrayBuffer;
  }

  // 3. Check if it's a VRM 0.0 file
  if (!json.extensions || !json.extensions.VRM) {
    return arrayBuffer; // Not VRM 0.0
  }

  console.log("VRM 0.0 detected. Migrating to VRM 1.0 format...");
  
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
    }
  };

  // 4a. Map Meta
  if (vrm0.meta) {
    vrm1.meta = {
      name: vrm0.meta.title || "Unknown",
      version: vrm0.meta.version || "1.0",
      authors: vrm0.meta.author ? [vrm0.meta.author] : [],
      copyrightInformation: "",
      contactInformation: vrm0.meta.contactInformation || "",
      references: vrm0.meta.reference ? [vrm0.meta.reference] : [],
      commercialUsage: vrm0.meta.commercialUssageName === "Allow" ? "personalProfit" : "personalNonProfit", 
      creditNotation: vrm0.meta.creditNaming === "Unnecessary" ? "unnecessary" : "required",
      modification: vrm0.meta.modificationName === "Allow" ? "allowModification" : "prohibited",
      avatarPermission: "everyone", // Default fallback
      allowExcessivelyViolentUsage: vrm0.meta.violentUssageName === "Allow",
      allowExcessivelySexualUsage: vrm0.meta.sexualUssageName === "Allow",
      allowPoliticalOrReligiousUsage: false,
      allowAntisocialOrHateUsage: false,
      licenseUrl: "https://vrm.dev/licenses/1.0/"
    };
    
    if (vrm0.meta.otherLicenseUrl) {
        vrm1.meta.otherLicenseUrl = vrm0.meta.otherLicenseUrl;
    }
    
    // Map avatar permission
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
        // In VRM 1.0, bone names must strictly match. Usually they do, but some camelCase adjustments might be needed.
        vrm1.humanoid.humanBones[boneName] = { node: bone.node };
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
      
      let binds = [];
      if (group.binds) {
        binds = group.binds.map(b => ({
          node: b.mesh,  // In 0.0 it's mesh index, in 1.0 it's node index. BUT VRM0 used mesh indices here. 
                         // VRM 1.0 requires node indices. This is tricky.
                         // Fallback heuristic: Try to find a node that has this mesh.
                         // We will fix this in a second pass.
          index: b.index,
          weight: (b.weight !== undefined ? b.weight : 100) / 100.0 // 0-100 to 0.0-1.0
        }));
      }

      let expData = {
        isBinary: group.isBinary || false,
        overrideBlink: "none",
        overrideLookAt: "none",
        overrideMouth: "none",
        morphTargetBinds: binds
      };

      if (presetName && presetMap[presetName.toLowerCase()]) {
        vrm1.expressions.preset[presetMap[presetName.toLowerCase()]] = expData;
      } else {
        vrm1.expressions.custom[name] = expData;
      }
    }
  }

  // Second pass: Fix morphTargetBinds mesh index to node index
  if (json.nodes) {
    const meshToNode = {};
    for (let i = 0; i < json.nodes.length; i++) {
       if (json.nodes[i].mesh !== undefined) {
         meshToNode[json.nodes[i].mesh] = i;
       }
    }

    const fixBinds = (expDictionary) => {
      for (const expName in expDictionary) {
        const exp = expDictionary[expName];
        if (exp.morphTargetBinds) {
           for (const bind of exp.morphTargetBinds) {
             if (meshToNode[bind.node] !== undefined) {
               bind.node = meshToNode[bind.node];
             }
           }
        }
      }
    };
    fixBinds(vrm1.expressions.preset);
    fixBinds(vrm1.expressions.custom);
  }

  // 5. Apply the 180 degree rotation around Y axis to root nodes
  if (json.scenes && json.scenes[json.scene] && json.scenes[json.scene].nodes) {
    const rootNodes = json.scenes[json.scene].nodes;
    for (const nodeId of rootNodes) {
      const node = json.nodes[nodeId];
      if (node) {
        if (!node.rotation) {
          node.rotation = [0, 0, 0, 1]; // x, y, z, w
        }
        
        // Quaternion multiplication: node.rotation * [0, 1, 0, 0] (180 deg around Y)
        const x1 = node.rotation[0], y1 = node.rotation[1], z1 = node.rotation[2], w1 = node.rotation[3];
        const x2 = 0, y2 = 1, z2 = 0, w2 = 0; // 180 deg around Y
        
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

  if (json.extensionsUsed) {
    json.extensionsUsed = json.extensionsUsed.filter(e => e !== 'VRM');
    if (!json.extensionsUsed.includes('VRMC_vrm')) json.extensionsUsed.push('VRMC_vrm');
  } else {
    json.extensionsUsed = ['VRMC_vrm'];
  }

  // 7. Serialize back
  const textEncoder = new TextEncoder();
  const newJsonString = JSON.stringify(json);
  let newJsonBuffer = textEncoder.encode(newJsonString);

  // Pad to 4 bytes align for JSON chunk
  const paddingLength = (4 - (newJsonBuffer.length % 4)) % 4;
  if (paddingLength > 0) {
    const paddedBuffer = new Uint8Array(newJsonBuffer.length + paddingLength);
    paddedBuffer.set(newJsonBuffer);
    for (let i = 0; i < paddingLength; i++) {
      paddedBuffer[newJsonBuffer.length + i] = 0x20; // Space padding
    }
    newJsonBuffer = paddedBuffer;
  }

  const newJsonChunkLength = newJsonBuffer.length;
  const chunkLengthDiff = newJsonChunkLength - jsonChunkLength;
  
  // 8. Rebuild ArrayBuffer
  const newArrayBuffer = new ArrayBuffer(arrayBuffer.byteLength + chunkLengthDiff);
  const newDataView = new DataView(newArrayBuffer);
  const newUint8Array = new Uint8Array(newArrayBuffer);
  const oldUint8Array = new Uint8Array(arrayBuffer);

  // Copy header (12 bytes) + JSON Chunk Header (8 bytes)
  newUint8Array.set(oldUint8Array.subarray(0, 20), 0);
  
  // Update overall length
  newDataView.setUint32(8, arrayBuffer.byteLength + chunkLengthDiff, true);
  
  // Update JSON chunk length
  newDataView.setUint32(12, newJsonChunkLength, true);
  
  // Write new JSON
  newUint8Array.set(newJsonBuffer, 20);
  
  // Write the rest of the file (BIN chunk, etc.)
  newUint8Array.set(oldUint8Array.subarray(20 + jsonChunkLength), 20 + newJsonChunkLength);

  console.log("Migration complete.");
  return newArrayBuffer;
}
