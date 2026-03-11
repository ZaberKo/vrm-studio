---
trigger: always_on
---

# VRM Specification Rules

## Context & Overview
VRM is a file format for handling 3D humanoid avatar data, strictly based on the **glTF 2.0** binary (`.glb`) specification. It uses custom JSON extensions inside the glTF container to define humanoid skeletons, toon materials, secondary animations (physics), and avatar metadata. 

When generating code to parse, modify, or export `.vrm` files, **always verify the version first**. VRM 0.0 and VRM 1.0 are structurally incompatible in several key areas.

## 1. Extension Schema Differences
The way VRM data is injected into the glTF `extensions` object changed significantly between versions.

* **VRM 0.0 (Legacy):** Uses a single, monolithic extension block named `VRM`.
* **VRM 1.0 (Current Standard):** Uses modularized extension blocks prefixed with `VRMC_`.
    * `VRMC_vrm`: Core humanoid, meta, and expression data.
    * `VRMC_materials_mtoon`: Cel-shading/Toon material properties.
    * `VRMC_springBone`: Secondary animation physics (hair, clothes, accessories).
    * `VRMC_node_constraint`: Procedural bone constraints.

## 2. Coordinate System & Orientations
This is the most common source of bugs when migrating between versions. Ensure any spatial math, rig generation, or procedural animation accounts for this:

* **VRM 0.0:** The model faces **-Z** (Z- Forward).
* **VRM 1.0:** The model faces **+Z** (Z+ Forward). While some general restrictions have been relaxed, a strict T-Pose is now explicitly required.

## 3. Facial Expressions (BlendShapes)
* **VRM 0.0:** Handled under the `blendShapeMaster` property. 
* **VRM 1.0:** Handled under the `expressions` property. The standard presets have been updated (e.g., `surprised` was added to the base emotional presets of joy, anger, sorrow, and fun). 
    * *Code Gen Directive:* If writing Unity/C# scripts, map legacy `VRMBlendShapeProxy.ImmediatelySetValue` to the new `Vrm10Instance.Runtime.Expression.SetWeight`.

## 4. Materials & Shaders (MToon)
* **VRM 0.0:** Material properties are nested inside the monolithic `VRM` extension (`json.extensions.VRM.materialProperties`). Emission is handled by older custom MToon specs.
* **VRM 1.0:** Strictly enforces standard glTF 2.0 PBR rules where applicable. Uses the `VRMC_materials_mtoon` extension for toon-specific data. It relies on the standard glTF 2.0 emission strength factor rather than custom VRM 0.0 emission hacks.

## 5. Metadata & Licensing
If you are generating scripts that read/write avatar metadata, note the schema changes to avoid license invalidation:
* **VRM 0.0:** Commercial usage is split into `corporate_commercial_use` and `personal_commercial_use`.
* **VRM 1.0:** Uses a unified `commercialUsage` property. It also introduces new granular flags for political, religious, and antisocial usage which **must** be respected in the UI/UX.

## Agent Action Directives
1. **Identify Version:** Always read the root `extensions` object of the glTF JSON first. Branch your parsing logic based on the presence of `VRMC_vrm` (1.0) vs `VRM` (0.0).
2. **Preserve Extensions:** When modifying and re-exporting a VRM file, do not aggressively prune unrecognized glTF extensions, as this will destroy the VRM functionality.
3. **Handle VRMA (Animations):** If asked to handle VRM animations, look for the `.vrma` extension (`VRMC_vrm_animation`), which maps glTF animations to humanoid bones regardless of the base model's specific proportions.