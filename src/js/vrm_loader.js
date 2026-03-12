import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  MToonMaterialLoaderPlugin,
  VRMLoaderPlugin,
  VRMUtils,
  VRMSpringBoneJointHelper,
  VRMSpringBoneColliderHelper,
} from "@pixiv/three-vrm";
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from "@pixiv/three-vrm-animation";
import { migrateVRM } from "./vrm_migrator.js";

export async function loadVRM(url, scene, globals, filename = null) {
  const loadingOverlay = document.getElementById("loading-overlay");
  const loadingBar = document.getElementById("loading-bar");
  const loadingText = document.getElementById("loading-text");

  loadingOverlay.classList.remove("hidden");
  loadingText.innerText = "LOADING VRM MODEL";

  if (globals.currentVRM) {
    scene.remove(globals.currentVRM.scene);
    VRMUtils.deepDispose(globals.currentVRM.scene);
    if (globals.mixer) {
      globals.mixer.stopAllAction();
      globals.mixer = null;
    }
    globals.currentAction = null;
    globals.currentVRM = null;
  }

  const loader = new GLTFLoader();
  loader.crossOrigin = "anonymous";

  loader.register((parser) => {
    const mtoonMaterialPlugin = new MToonMaterialLoaderPlugin(parser, {
      materialType: MToonNodeMaterial,
    });
    return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin });
  });

  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  try {
    loadingText.innerText = "FETCHING ASSETS...";
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    
    const { buffer: migratedBuffer, migrated } = await migrateVRM(arrayBuffer, () => {
      loadingText.innerText = "CONVERTING VRM 0.0 TO 1.0...";
    });

    // Cache the migrated buffer for download if it was converted
    const downloadBtn = document.getElementById("download-vrm-btn");
    globals.lastMigratedBuffer = migrated ? migratedBuffer : null;
    
    // Derive name: prioritize passed filename, then URL, fallback to default
    const originalName = filename || (url.includes('blob:') ? 'model.vrm' : url.split('/').pop());
    globals.lastMigratedName = migrated ? originalName.replace('.vrm', '_v1.vrm') : null;
    
    if (migrated && downloadBtn) {
       downloadBtn.classList.remove("hidden");
    } else if (downloadBtn) {
       downloadBtn.classList.add("hidden");
    }

    loadingText.innerText = "PARSING MODEL...";
    const gltf = await loader.parseAsync(migratedBuffer, "");

    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error("File does not contain VRM user data.");

    globals.currentVRM = vrm;

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);

    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });

    // Connect the persistent LookAt Object3D to the newly loaded VRM
    if (vrm.lookAt) {
      vrm.lookAt.target = globals.lookAtTarget;
    }

    scene.add(vrm.scene);

    // Map bones
    globals.boneMap = {};
    vrm.scene.traverse((node) => {
      if (node.isBone) globals.boneMap[node.name] = node;
    });

    if (
      globals.springBoneVisualizerRoots &&
      globals.springBoneVisualizerRoots.length > 0
    ) {
      globals.springBoneVisualizerRoots.forEach((r) => scene.remove(r));
    }
    globals.springBoneVisualizerRoots = [];

    if (vrm.springBoneManager) {
      const helperRoot = new THREE.Group();
      helperRoot.visible =
        document.getElementById("sb-vis-toggle")?.checked || false;

      vrm.springBoneManager.colliders.forEach((collider) => {
        helperRoot.add(new VRMSpringBoneColliderHelper(collider));
      });
      vrm.springBoneManager.joints.forEach((joint) => {
        helperRoot.add(new VRMSpringBoneJointHelper(joint));
      });

      scene.add(helperRoot);
      globals.springBoneVisualizerRoots.push(helperRoot);
    }

    if (globals.skeletonHelper) scene.remove(globals.skeletonHelper);
    globals.skeletonHelper = new THREE.SkeletonHelper(vrm.scene);
    globals.skeletonHelper.visible =
      document.getElementById("skeleton-toggle").checked;
    scene.add(globals.skeletonHelper);

    document
      .getElementById("status-dot")
      .classList.replace("bg-red-500", "bg-green-500");
    document.getElementById("status-text").innerText =
      vrm.meta?.name || "Loaded";

    globals.updateExpressions(vrm);
    globals.updateMetadata(vrm.meta);
    globals.updateHierarchy(vrm.scene);
    globals.initPhysics(vrm);
    globals.log(`Model Ready: ${vrm.meta?.name || "Unknown"}`, "green");

    // Setup autoblink
    import("./vrm_blink.js").then((m) => {
      globals.autoBlink = new m.AutoBlink(vrm.expressionManager);
    });
  } catch (e) {
    console.error(e);
    globals.log("Failed to load VRM: " + e.message, "red");
  } finally {
    loadingOverlay.classList.add("hidden");
  }
}

export async function loadVRMA(url, globals) {
  if (!globals.currentVRM) {
    globals.log("Load a VRM model first!", "red");
    return;
  }

  const loadingOverlay = document.getElementById("loading-overlay");
  loadingOverlay.classList.remove("hidden");
  document.getElementById("loading-text").innerText = "LOADING ANIMATION";

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  try {
    const gltf = await loader.loadAsync(url);
    const vrmAnimations = gltf.userData.vrmAnimations;

    if (vrmAnimations && vrmAnimations.length > 0) {
      if (globals.mixer) globals.mixer.stopAllAction();
      globals.mixer = new THREE.AnimationMixer(globals.currentVRM.scene);

      const clip = createVRMAnimationClip(vrmAnimations[0], globals.currentVRM);
      globals.currentAction = globals.mixer.clipAction(clip);
      globals.currentAction.play();

      document.getElementById("anim-name").innerText =
        url.split("/").pop() || "Loaded Animation";
      document.getElementById("anim-time").innerText =
        "0.0s / " + clip.duration.toFixed(1) + "s";
      globals.log(`Animation loaded: ${clip.duration.toFixed(1)}s`, "blue");
    } else {
      globals.log("No VRMAnimation data found.", "yellow");
    }
  } catch (err) {
    console.error(err);
    globals.log("Animation load failed: " + err.message, "red");
  } finally {
    loadingOverlay.classList.add("hidden");
  }
}
