/**
 * Translates a VRM 0.0 ArrayBuffer into a VRM 1.0 ArrayBuffer.
 * This script intercepts the GLB, modifies the JSON chunk, and repackages it.
 */

function gammaEOTF(e) {
  return Math.pow(e, 2.2);
}

function migrateMaterials(json) {
  const v0VRM = json.extensions && json.extensions.VRM;
  if (!v0VRM || !v0VRM.materialProperties) return;

  const renderQueuesTransparent = new Set();
  const renderQueuesTransparentZWrite = new Set();
  const rqMapTransparent = new Map();
  const rqMapTransparentZWrite = new Map();

  // Populate queue sets
  v0VRM.materialProperties.forEach((mat) => {
    const isTransZWrite = mat.shader === 'VRM/UnlitTransparentZWrite';
    const isTrans = (mat.keywordMap && mat.keywordMap['_ALPHABLEND_ON']) ||
                    mat.shader === 'VRM/UnlitTransparent' || isTransZWrite;
    const enabledZWrite = (mat.floatProperties && mat.floatProperties['_ZWrite'] === 1) || isTransZWrite;
    
    if (isTrans && mat.renderQueue !== undefined) {
      if (enabledZWrite) renderQueuesTransparentZWrite.add(mat.renderQueue);
      else renderQueuesTransparent.add(mat.renderQueue);
    }
  });

  Array.from(renderQueuesTransparent).sort((a,b)=>a-b).forEach((q, i) => {
    rqMapTransparent.set(q, Math.min(Math.max(i - renderQueuesTransparent.size + 1, -9), 0));
  });
  Array.from(renderQueuesTransparentZWrite).sort((a,b)=>a-b).forEach((q, i) => {
    rqMapTransparentZWrite.set(q, Math.min(Math.max(i, 0), 9));
  });

  const getRQOffset = (mat) => {
    const isTransZWrite = mat.shader === 'VRM/UnlitTransparentZWrite';
    const isTrans = (mat.keywordMap && mat.keywordMap['_ALPHABLEND_ON']) ||
                    mat.shader === 'VRM/UnlitTransparent' || isTransZWrite;
    const enabledZWrite = (mat.floatProperties && mat.floatProperties['_ZWrite'] === 1) || isTransZWrite;
    
    if (isTrans && mat.renderQueue !== undefined) {
      let offset = enabledZWrite ? rqMapTransparentZWrite.get(mat.renderQueue) : rqMapTransparent.get(mat.renderQueue);
      return offset || 0;
    }
    return 0;
  };

  const getTextureTransform = (mat) => {
    const tt = mat.vectorProperties && mat.vectorProperties['_MainTex'];
    if (!tt) return {};
    const offset = [tt[0] || 0.0, tt[1] || 0.0];
    const scale = [tt[2] || 1.0, tt[3] || 1.0];
    offset[1] = 1.0 - scale[1] - offset[1];
    return { KHR_texture_transform: { offset, scale } };
  };

  json.materials = json.materials || [];
  
  v0VRM.materialProperties.forEach((matProps, idx) => {
    let schemaMat = json.materials[idx] || { name: matProps.name || `Material_${idx}` };
    
    if (matProps.shader === 'VRM/MToon') {
      const isTrans = matProps.keywordMap && matProps.keywordMap['_ALPHABLEND_ON'];
      const enabledZWrite = matProps.floatProperties && matProps.floatProperties['_ZWrite'] === 1;
      const transparentWithZWrite = enabledZWrite && isTrans;
      const isCutoff = matProps.keywordMap && matProps.keywordMap['_ALPHATEST_ON'];
      
      const alphaMode = isTrans ? 'BLEND' : isCutoff ? 'MASK' : 'OPAQUE';
      const alphaCutoff = isCutoff ? (matProps.floatProperties && matProps.floatProperties['_Cutoff'] !== undefined ? matProps.floatProperties['_Cutoff'] : 0.5) : undefined;
      const cullMode = matProps.floatProperties && matProps.floatProperties['_CullMode'] !== undefined ? matProps.floatProperties['_CullMode'] : 2;
      const doubleSided = cullMode === 0;
      
      const ttExt = getTextureTransform(matProps);
      
      const vColor = matProps.vectorProperties && matProps.vectorProperties['_Color'] ? matProps.vectorProperties['_Color'] : [1,1,1,1];
      const baseColorFactor = [gammaEOTF(vColor[0]), gammaEOTF(vColor[1]), gammaEOTF(vColor[2]), vColor[3]];
      
      const baseColorTextureIndex = matProps.textureProperties && matProps.textureProperties['_MainTex'];
      const baseColorTexture = baseColorTextureIndex !== undefined ? { index: baseColorTextureIndex, extensions: { ...ttExt } } : undefined;
      
      const bumpScale = matProps.floatProperties && matProps.floatProperties['_BumpScale'] !== undefined ? matProps.floatProperties['_BumpScale'] : 1.0;
      const bumpIndex = matProps.textureProperties && matProps.textureProperties['_BumpMap'];
      const normalTexture = bumpIndex !== undefined ? { index: bumpIndex, scale: bumpScale, extensions: { ...ttExt } } : undefined;
      
      const vEmission = matProps.vectorProperties && matProps.vectorProperties['_EmissionColor'] ? matProps.vectorProperties['_EmissionColor'] : [0,0,0,1];
      const emissiveFactor = [gammaEOTF(vEmission[0]), gammaEOTF(vEmission[1]), gammaEOTF(vEmission[2])];
      const emissiveTextureIndex = matProps.textureProperties && matProps.textureProperties['_EmissionMap'];
      const emissiveTexture = emissiveTextureIndex !== undefined ? { index: emissiveTextureIndex, extensions: { ...ttExt } } : undefined;
      
      const vShade = matProps.vectorProperties && matProps.vectorProperties['_ShadeColor'] ? matProps.vectorProperties['_ShadeColor'] : [0.97, 0.81, 0.86, 1.0];
      const shadeColorFactor = [gammaEOTF(vShade[0]), gammaEOTF(vShade[1]), gammaEOTF(vShade[2])];
      const shadeMultiplyTextureIndex = matProps.textureProperties && matProps.textureProperties['_ShadeTexture'];
      const shadeMultiplyTexture = shadeMultiplyTextureIndex !== undefined ? { index: shadeMultiplyTextureIndex, extensions: { ...ttExt } } : undefined;
      
      let shadingShiftFactor = matProps.floatProperties && matProps.floatProperties['_ShadeShift'] !== undefined ? matProps.floatProperties['_ShadeShift'] : 0.0;
      let shadingToonyFactor = matProps.floatProperties && matProps.floatProperties['_ShadeToony'] !== undefined ? matProps.floatProperties['_ShadeToony'] : 0.9;
      const lerp = (x, y, t) => x + (y - x) * t;
      shadingToonyFactor = lerp(shadingToonyFactor, 1.0, 0.5 + 0.5 * shadingShiftFactor);
      shadingShiftFactor = -shadingShiftFactor - (1.0 - shadingToonyFactor);
      
      const gi = matProps.floatProperties && matProps.floatProperties['_IndirectLightIntensity'] !== undefined ? matProps.floatProperties['_IndirectLightIntensity'] : 0.1;
      const giEqualizationFactor = gi ? 1.0 - gi : undefined;
      
      const matcapTextureIndex = matProps.textureProperties && matProps.textureProperties['_SphereAdd'];
      const matcapFactor = matcapTextureIndex !== undefined ? [1,1,1] : undefined;
      const matcapTexture = matcapTextureIndex !== undefined ? { index: matcapTextureIndex } : undefined;
      
      const rimLightingMixFactor = matProps.floatProperties && matProps.floatProperties['_RimLightingMix'] !== undefined ? matProps.floatProperties['_RimLightingMix'] : 0.0;
      const rimTextureIndex = matProps.textureProperties && matProps.textureProperties['_RimTexture'];
      const rimMultiplyTexture = rimTextureIndex !== undefined ? { index: rimTextureIndex, extensions: { ...ttExt } } : undefined;
      
      const vRimColor = matProps.vectorProperties && matProps.vectorProperties['_RimColor'] ? matProps.vectorProperties['_RimColor'] : [0,0,0,1];
      const parametricRimColorFactor = [gammaEOTF(vRimColor[0]), gammaEOTF(vRimColor[1]), gammaEOTF(vRimColor[2])];
      const parametricRimFresnelPowerFactor = matProps.floatProperties && matProps.floatProperties['_RimFresnelPower'] !== undefined ? matProps.floatProperties['_RimFresnelPower'] : 1.0;
      const parametricRimLiftFactor = matProps.floatProperties && matProps.floatProperties['_RimLift'] !== undefined ? matProps.floatProperties['_RimLift'] : 0.0;
      
      const outlineModeRaw = matProps.floatProperties && matProps.floatProperties['_OutlineWidthMode'] !== undefined ? matProps.floatProperties['_OutlineWidthMode'] : 0;
      const outlineWidthMode = ['none', 'worldCoordinates', 'screenCoordinates'][outlineModeRaw] || 'none';
      let outlineWidthFactor = matProps.floatProperties && matProps.floatProperties['_OutlineWidth'] !== undefined ? matProps.floatProperties['_OutlineWidth'] : 0.0;
      outlineWidthFactor *= 0.01;
      
      const outlineTexIndex = matProps.textureProperties && matProps.textureProperties['_OutlineWidthTexture'];
      const outlineWidthMultiplyTexture = outlineTexIndex !== undefined ? { index: outlineTexIndex, extensions: { ...ttExt } } : undefined;
      
      const vOutlineColor = matProps.vectorProperties && matProps.vectorProperties['_OutlineColor'] ? matProps.vectorProperties['_OutlineColor'] : [0,0,0];
      const outlineColorFactor = [gammaEOTF(vOutlineColor[0]), gammaEOTF(vOutlineColor[1]), gammaEOTF(vOutlineColor[2])];
      const outlineColorMode = matProps.floatProperties && matProps.floatProperties['_OutlineColorMode'] !== undefined ? matProps.floatProperties['_OutlineColorMode'] : 0;
      const outlineLightingMixFactor = outlineColorMode === 1 ? (matProps.floatProperties && matProps.floatProperties['_OutlineLightingMix'] !== undefined ? matProps.floatProperties['_OutlineLightingMix'] : 1.0) : 0.0;
      
      const uvAnimMaskIndex = matProps.textureProperties && matProps.textureProperties['_UvAnimMaskTexture'];
      const uvAnimationMaskTexture = uvAnimMaskIndex !== undefined ? { index: uvAnimMaskIndex, extensions: { ...ttExt } } : undefined;
      
      const uvX = matProps.floatProperties && matProps.floatProperties['_UvAnimScrollX'] !== undefined ? matProps.floatProperties['_UvAnimScrollX'] : 0.0;
      let uvY = matProps.floatProperties && matProps.floatProperties['_UvAnimScrollY'] !== undefined ? matProps.floatProperties['_UvAnimScrollY'] : 0.0;
      uvY = -uvY;
      const uvRot = matProps.floatProperties && matProps.floatProperties['_UvAnimRotation'] !== undefined ? matProps.floatProperties['_UvAnimRotation'] : 0.0;

      const mtoonExt = {
        specVersion: '1.0',
        transparentWithZWrite,
        renderQueueOffsetNumber: getRQOffset(matProps),
        shadeColorFactor,
        shadeMultiplyTexture,
        shadingShiftFactor,
        shadingToonyFactor,
        giEqualizationFactor,
        matcapFactor,
        matcapTexture,
        rimLightingMixFactor,
        rimMultiplyTexture,
        parametricRimColorFactor,
        parametricRimFresnelPowerFactor,
        parametricRimLiftFactor,
        outlineWidthMode,
        outlineWidthFactor,
        outlineWidthMultiplyTexture,
        outlineColorFactor,
        outlineLightingMixFactor,
        uvAnimationMaskTexture,
        uvAnimationScrollXSpeedFactor: uvX,
        uvAnimationScrollYSpeedFactor: uvY,
        uvAnimationRotationSpeedFactor: uvRot,
      };

      Object.keys(mtoonExt).forEach(key => mtoonExt[key] === undefined && delete mtoonExt[key]);

      schemaMat.pbrMetallicRoughness = schemaMat.pbrMetallicRoughness || {};
      schemaMat.pbrMetallicRoughness.baseColorFactor = baseColorFactor;
      if (baseColorTexture) {
        schemaMat.pbrMetallicRoughness.baseColorTexture = baseColorTexture;
      } else {
        delete schemaMat.pbrMetallicRoughness.baseColorTexture;
      }
      
      // VRM 1.0 explicit fallbacks for MToon
      schemaMat.pbrMetallicRoughness.metallicFactor = 0.0;
      schemaMat.pbrMetallicRoughness.roughnessFactor = 0.9;
      
      if (normalTexture) schemaMat.normalTexture = normalTexture;
      if (emissiveTexture) schemaMat.emissiveTexture = emissiveTexture;
      if (emissiveFactor && (emissiveFactor[0] > 0 || emissiveFactor[1] > 0 || emissiveFactor[2] > 0)) schemaMat.emissiveFactor = emissiveFactor;
      schemaMat.alphaMode = alphaMode;
      if (alphaCutoff !== undefined) schemaMat.alphaCutoff = alphaCutoff;
      schemaMat.doubleSided = doubleSided;
      
      schemaMat.extensions = schemaMat.extensions || {};
      schemaMat.extensions.VRMC_materials_mtoon = mtoonExt;
      
      // VRM 1.0 Spec: MToon is PBR compliant, so it MUST NOT use the Unlit extension.
      // VRM 0.0 commonly generated KHR_materials_unlit, we must scrub it to prevent 
      // strict 1.0 parsers from preferring Unlit over the PBR fallback.
      if (schemaMat.extensions.KHR_materials_unlit) {
        delete schemaMat.extensions.KHR_materials_unlit;
      }

    } else if (matProps.shader && matProps.shader.startsWith('VRM/Unlit')) {
      const isTransZWrite = matProps.shader === 'VRM/UnlitTransparentZWrite';
      const isTrans = matProps.shader === 'VRM/UnlitTransparent' || isTransZWrite;
      const isCutoff = matProps.shader === 'VRM/UnlitCutout';
      
      const alphaMode = isTrans ? 'BLEND' : isCutoff ? 'MASK' : 'OPAQUE';
      const alphaCutoff = isCutoff ? (matProps.floatProperties && matProps.floatProperties['_Cutoff'] !== undefined ? matProps.floatProperties['_Cutoff'] : 0.5) : undefined;
      
      const ttExt = getTextureTransform(matProps);
      
      const vColor = matProps.vectorProperties && matProps.vectorProperties['_Color'] ? matProps.vectorProperties['_Color'] : [1,1,1,1];
      const baseColorFactor = [gammaEOTF(vColor[0]), gammaEOTF(vColor[1]), gammaEOTF(vColor[2]), vColor[3]];
      
      const baseColorTextureIndex = matProps.textureProperties && matProps.textureProperties['_MainTex'];
      const baseColorTexture = baseColorTextureIndex !== undefined ? { index: baseColorTextureIndex, extensions: { ...ttExt } } : undefined;
      
      const mtoonExt = {
        specVersion: '1.0',
        transparentWithZWrite: isTransZWrite,
        renderQueueOffsetNumber: getRQOffset(matProps),
        shadeColorFactor: [baseColorFactor[0], baseColorFactor[1], baseColorFactor[2]],
        shadeMultiplyTexture: baseColorTexture
      };
      Object.keys(mtoonExt).forEach(key => mtoonExt[key] === undefined && delete mtoonExt[key]);

      schemaMat.pbrMetallicRoughness = schemaMat.pbrMetallicRoughness || {};
      schemaMat.pbrMetallicRoughness.baseColorFactor = baseColorFactor;
      if (baseColorTexture) {
        schemaMat.pbrMetallicRoughness.baseColorTexture = baseColorTexture;
      } else {
        delete schemaMat.pbrMetallicRoughness.baseColorTexture;
      }
      
      // VRM 1.0 explicit fallbacks for MToon
      schemaMat.pbrMetallicRoughness.metallicFactor = 0.0;
      schemaMat.pbrMetallicRoughness.roughnessFactor = 0.9;

      schemaMat.alphaMode = alphaMode;
      if (alphaCutoff !== undefined) schemaMat.alphaCutoff = alphaCutoff;
      
      schemaMat.extensions = schemaMat.extensions || {};
      schemaMat.extensions.VRMC_materials_mtoon = mtoonExt;
      
      if (schemaMat.extensions.KHR_materials_unlit) {
        delete schemaMat.extensions.KHR_materials_unlit;
      }
    }
    
    json.materials[idx] = schemaMat;
  });

  json.extensionsUsed = json.extensionsUsed || [];
  if (!json.extensionsUsed.includes('KHR_texture_transform')) {
    json.extensionsUsed.push('KHR_texture_transform');
  }
}

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

    if (vrm0.meta.texture !== undefined && json.textures && json.textures[vrm0.meta.texture]) {
      vrm1.meta.thumbnailImage = json.textures[vrm0.meta.texture].source;
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
      surprised: "surprised",
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

      let materialColorBinds = [];
      let textureTransformBinds = [];
      
      if (group.materialValues && json.materials) {
        group.materialValues.forEach(mv => {
          const matIdx = json.materials.findIndex(m => m.name === mv.materialName);
          if (matIdx === -1) return;
          
          if (mv.propertyName === "_MainTex_ST" || mv.propertyName === "_MainTex_ST_S" || mv.propertyName === "_MainTex_ST_T") {
            const scale = mv.targetValue.length >= 2 ? [mv.targetValue[0], mv.targetValue[1]] : [1, 1];
            const offset = mv.targetValue.length >= 4 ? [mv.targetValue[2], mv.targetValue[3]] : [0, 0];
            
            // UniVRM has specific vertical flip offset logic, but for direct translation mapping we can rely on spec values.
            // VRM 0.0 offsets are typically standard. If UniGLTF does VerticalFlipScaleOffset, it flips Y.
            // But VRM 1.0 KHR_texture_transform is standard glTF space (top-left origin).
            
            let scaleY = scale[1];
            let offsetY = offset[1];
            
            if (mv.propertyName === "_MainTex_ST_S") {
               scaleY = 1.0;
               offsetY = 0.0;
            } else if (mv.propertyName === "_MainTex_ST_T") {
               scale[0] = 1.0;
               offset[0] = 0.0;
            }
            
            // Spec conversion: ST -> KHR_texture_transform
            // offset.y = 1.0 - scale.y - ST_Offset.y  (Assuming base is Unity bottom-left to glTF top-left)
            offsetY = 1.0 - scaleY - offsetY;
            
            if (!textureTransformBinds.find(b => b.material === matIdx)) {
              textureTransformBinds.push({
                material: matIdx,
                scale: [scale[0], scaleY],
                offset: [offset[0], offsetY]
              });
            }
          } else {
            const propTypeMap = {
              "_Color": "color",
              "_EmissionColor": "emissionColor",
              "_RimColor": "rimColor",
              "_OutlineColor": "outlineColor",
              "_ShadeColor": "shadeColor"
            };
            
            const type = propTypeMap[mv.propertyName];
            if (type) {
              const targetValue = [
                mv.targetValue[0] || 0,
                mv.targetValue[1] || 0,
                mv.targetValue[2] || 0,
                mv.targetValue[3] !== undefined ? mv.targetValue[3] : 1
              ];
              
              materialColorBinds.push({
                material: matIdx,
                type: type,
                targetValue: targetValue
              });
            }
          }
        });
      }

      let expData = {
        isBinary: group.isBinary || false,
        overrideBlink: "none",
        overrideLookAt: "none",
        overrideMouth: "none",
        morphTargetBinds: morphTargetBinds.length > 0 ? morphTargetBinds : undefined,
        materialColorBinds: materialColorBinds.length > 0 ? materialColorBinds : undefined,
        textureTransformBinds: textureTransformBinds.length > 0 ? textureTransformBinds : undefined
      };

      if (presetName && presetMap[presetName.toLowerCase()]) {
        vrm1.expressions.preset[presetMap[presetName.toLowerCase()]] = expData;
      } else {
        // VRM 0.0 quirks: If presetName is "unknown" but name matches a preset (like "joy"), fallback 
        if (presetName && presetName.toLowerCase() === "unknown" && name && presetMap[name.toLowerCase()]) {
           vrm1.expressions.preset[presetMap[name.toLowerCase()]] = expData;
        } else {
           vrm1.expressions.custom[name] = expData;
        }
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
        // VRM 1.0 requires an explicit joint array containing all descendants, plus an artificial tail of 7cm for the leaf nodes.
        const createJointsRecursive = (nodeIdx, level, currentSpring) => {
          if (!currentSpring && level > 0) {
            currentSpring = {
              name: (bg.comment || `Spring_${idx}`),
              joints: [],
              colliderGroups: bg.colliderGroups || []
            };
            vrmcSpringBone.springs.push(currentSpring);
          }
          
          if (currentSpring) {
            currentSpring.joints.push({
              node: nodeIdx,
              stiffness: bg.stiffiness || 1.0,
              gravityPower: bg.gravityPower || 0,
              gravityDir: bg.gravityDir ? [bg.gravityDir.x || 0, bg.gravityDir.y || -1, bg.gravityDir.z || 0] : [0, -1, 0],
              dragForce: bg.dragForce || 0.4,
              hitRadius: bg.hitRadius || 0.02
            });
          }
          
          const gltfNode = json.nodes[nodeIdx];
          if (gltfNode && gltfNode.children && gltfNode.children.length > 0) {
            for (let i = 0; i < gltfNode.children.length; ++i) {
              const childIdx = gltfNode.children[i];
              // First child continues on the same spring chain. Subsequent children branch into new chains.
              if (i === 0) {
                createJointsRecursive(childIdx, level + 1, currentSpring);
              } else {
                createJointsRecursive(childIdx, 0, null);
              }
            }
          } else {
            // Leaf node. Append a 7cm tail to simulate VRM 0.0 physics.
            if (currentSpring && currentSpring.joints.length > 0) {
              const leafNode = json.nodes[nodeIdx];
              const leafName = leafNode.name || "tail";
              
              // Calculate 7cm delta based on node's local translation if available, otherwise default to -0.07 on Y.
              let tx = 0, ty = -0.07, tz = 0;
              if (leafNode.translation) {
                const vx = leafNode.translation[0] || 0;
                const vy = leafNode.translation[1] || 0;
                const vz = leafNode.translation[2] || 0;
                const len = Math.sqrt(vx*vx + vy*vy + vz*vz);
                if (len > 0.0001) {
                  tx = (vx / len) * 0.07;
                  ty = (vy / len) * 0.07;
                  tz = (vz / len) * 0.07;
                }
              }

              const tailNode = {
                name: leafName + "_end",
                translation: [tx, ty, tz]
              };
              
              const tailIdx = json.nodes.length;
              json.nodes.push(tailNode);
              
              // Add children array to original leaf node so it links to the tail.
              leafNode.children = [tailIdx];
              
              // Tail joints in VRM 1.0 SpringBones only contain the node reference.
              currentSpring.joints.push({
                node: tailIdx
              });
            }
          }
        };

        bg.bones.forEach((boneNodeIdx, bIdx) => {
          const spring = {
            name: (bg.comment || `Spring_${idx}`) + (bg.bones.length > 1 ? `_${bIdx}` : ''),
            joints: [],
            colliderGroups: bg.colliderGroups || []
          };
          vrmcSpringBone.springs.push(spring);
          createJointsRecursive(boneNodeIdx, 1, spring);
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
  migrateMaterials(json);
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
