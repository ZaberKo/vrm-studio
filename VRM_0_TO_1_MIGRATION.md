# VRM 0.0 to VRM 1.0 Migration Guide

This document details the exact technical mappings and logic executed by the `vrm_migrator.js` module in VRM Studio when upgrading legacy VRM 0.0 avatar formats to the modern VRM 1.0 specification.

The migration occurs silently and autonomously at the `ArrayBuffer` and `JSON chunk` level inside the `.glb` container before the 3D viewer parses the model.

## 1. Metadata and License Mapping 
VRM 1.0 restructured the metadata extension (`VRMC_vrm.meta`) to be more concise, splitting old, intertwined permission properties into separate logical axes and array types.

### String to Array Conversion
- **`vrm0.meta.author`** → **`vrm1.meta.authors`** (`[string]`)
- **`vrm0.meta.reference`** → **`vrm1.meta.references`** (`[string]`)

### Deprecated License Parsing & Conversion
VRM 0.0 relied on a single `licenseName` string (such as `CC_BY_NC`, `Redistribution_Prohibited`, `CC0`) to configure rights. VRM 1.0 removed this structure and introduced three isolated fields: `allowRedistribution`, `modification`, and `creditNotation`. The migrator algorithm calculates these flags safely based on the old `licenseName`:

- `Redistribution_Prohibited`: Sets `allowRedistribution: false` and `modification: "prohibited"`.
- `CC0`: Sets `allowRedistribution: true`, `modification: "allowModificationRedistribution"`, and `creditNotation: "unnecessary"`.
- `CC_BY` / `CC_BY_SA`: Sets `allowRedistribution: true`, `modification: "allowModificationRedistribution"`, and `creditNotation: "required"`.
- `CC_BY_NC` / `CC_BY_NC_SA`: Inherits `CC_BY` properties, but forcibly upgrades `commercialUsage` to `"personalNonProfit"` to ensure non-commercial constraints are respected.
- `CC_BY_ND` / `CC_BY_NC_ND`: Enforces `modification: "prohibited"`.

### Uniform URL Merging
VRM 0.0 had both `otherPermissionUrl` and `otherLicenseUrl`. VRM 1.0 merged them into a single `otherLicenseUrl`. If a legacy model uses both concurrently with distinct URLs, the tool gracefully merges them via a Line Break (`\n`) to preserve author intent.

### Additional 1.0 Constraints
VRM 1.0 guarantees additional behavioral flags which were non-existent in 0.0. The migrator defaults these to safe states:
- `allowPoliticalOrReligiousUsage` → `false`
- `allowAntisocialOrHateUsage` → `false`

## 2. Expressions (formerly BlendShapes)
VRM 1.0 re-categorized Facial BlendShapes as "Expressions" and unified their naming conventions:
- **Emotions**: `joy` → `happy` | `fun` → `relaxed` | `sorrow` → `sad` | `angry` → `angry` | `surprised` (new in 1.0)
- **Lip-Sync**: `a/i/u/e/o` → `aa/ih/ou/ee/oh`

Custom expressions not matching official VRM 1.0 presets are safely pushed under `vrm1.expressions.custom`. Material color binds and texture transformations (uv offset/scale mapped to standard `KHR_texture_transform`) from legacy expressions are successfully transcribed over.

## 3. SpringBones (Physics & Secondary Animation)
The physics topology underwent heavy structural changes between 0.0 and 1.0.

Instead of nested lists under `secondaryAnimation`, VRM 1.0 delegates physics to the `VRMC_springBone` extension definition.
1. **7cm Tail Fallback (Crucial)**: In VRM 0.0, bone physics applied an implicit distance buffer to terminal leaf joints. In VRM 1.0, leaf nodes strictly require an explicit endpoint object mathematically bound into the array. To maintain 1:1 identical cloth/hair motion, the migrator automatically injects an invisible 7-centimeter offset node (`tailNode`) tracking the final local tangent vector.
2. Group colliders and parameters (stiffness, drag force, hit radius) have been safely decoupled and translated into their new struct properties.

## 4. MToon Shader & PBR Compatibility
VRM 1.0 enforces strict `glTF 2.0 PBR` compliance for toon shading, dropping legacy custom shader variables.
1. **Gamma to Linear Space**: VRM 0.0 natively handled vertex and base colors inside Gamma space. The migrator aggressively normalizes vectors and emissions applying a Standard Gamma-to-Linear conversion `(value ^ 2.2)`.
2. **Scrubbing KHR_materials_unlit**: Legacy pipelines wrongly embedded `KHR_materials_unlit` extensions inside MToon objects. Because 1.0 MToon shaders rely strictly on PBR light-responses, this archaic extension is scrubbed from the JSON so the Three.js GLTFLoader evaluates PBR accurately.
3. **Smooth Stepping**: Translates native Unity `_ShadeToony` dual-variables to accurate threshold boundaries (`shadingShiftFactor`) natively supported by modern WebGPUs.

## 5. Coordinate Space Resolution
- **Issue**: VRM 0.0 models face the `-Z` axis (Z- Forward). VRM 1.0 forces avatars to face `+Z` (Z+ Forward).
- **Web-optimized Migration Solution**: Rather than utilizing heavily unoptimized mesh-baking calculations (such as parsing the full array buffer to flip every vertex/normal geometry map via matrix inversion, like traditional native software does), our migrator isolates the overarching `Root Node` found in the target scene and injects a 180-Degree Quaternion rotation matrix on the Y-Axis (`[0, 1, 0, 0]`). This achieves complete spatial parity seamlessly inside the web hierarchy with exactly zero performance overhead or vertex cache duplication.
