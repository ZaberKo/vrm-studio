import * as THREE from "three/webgpu";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { CCDIKSolver } from "three/addons/animation/CCDIKSolver.js";

export class VRMControl {
  constructor(globals) {
    this.globals = globals;
    this.scene = globals.scene;
    this.camera = globals.camera;
    this.renderer = globals.renderer;
    this.orbitControls = globals.controls;

    this.mode = "OFF"; // 'OFF', 'IK', 'FK'
    this.selectedBone = null;
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.helperCache = []; // Array to store bone helper meshes
    this.ikTargets = []; // Array to store generated IK Target Object3Ds
    this.ikSolver = null;

    this.transformControls.setSpace("local");
    this.transformControls.size = 0.5;

    // Attach event listeners to transform controls to prevent orbit camera fighting
    this.transformControls.addEventListener("dragging-changed", (event) => {
      this.orbitControls.enabled = !event.value;
    });

    const helper = this.transformControls.getHelper ? this.transformControls.getHelper() : this.transformControls;
    this.scene.add(helper);

    // Event listeners for selecting bones
    this.onClick = this.onClick.bind(this);
    this.renderer.domElement.addEventListener("click", this.onClick);
  }

  // Backwards compatibility for tree view selection logic
  get isActive() {
    return this.mode !== "OFF";
  }

  setMode(mode) {
    this.mode = mode; // 'OFF', 'IK', 'FK'
    this.deselectBone();
    this.clearHelpers();

    if (this.mode === "OFF") {
      this.transformControls.enabled = false;
      const helper = this.transformControls.getHelper ? this.transformControls.getHelper() : this.transformControls;
      helper.visible = false;
      this.globals.log("Kinematics disabled", "gray");
      return;
    }

    this.transformControls.enabled = true;

    if (this.mode === "IK") {
      this.transformControls.setMode("translate");
      this.globals.log("IK Mode enabled (Translating IK targets)", "blue");
      this.setupIK();
    } else {
      this.transformControls.setMode("rotate");
      this.globals.log("FK Mode enabled (Rotating individual bones)", "blue");
    }

    this.generateHelpers();
  }

  update() {
    if (this.mode === "IK" && this.ikSolver) {
      this.ikSolver.update();
    }
  }

  clearIK() {
    this.ikTargets.forEach(target => {
      if (target.parent) target.parent.remove(target);
    });
    this.ikTargets = [];
    this.ikSolver = null;
  }

  clearHelpers() {
    this.helperCache.forEach((h) => {
      if (h.parent) h.parent.remove(h);
      if (h.material) h.material.dispose();
      if (h.geometry) h.geometry.dispose();
    });
    this.helperCache = [];
    this.clearIK();
  }

  setupIK() {
    if (!this.globals.currentVRM || !this.globals.currentVRM.humanoid) return;
    
    const humanoid = this.globals.currentVRM.humanoid;
    const humanBones = humanoid.humanBones;
    
    // Create a flat array of 'normalized' bones to act as a skeleton for CCDIKSolver
    const bones = [];
    const nameToIndex = {};
    Object.keys(humanBones).forEach((name) => {
      const node = humanoid.getNormalizedBoneNode(name);
      if (node) {
        nameToIndex[name] = bones.length;
        bones.push(node);
      }
    });

    const iks = [];
    this.ikTargets = [];

    // Provide Euler angle limits to prevent backwards-bending of joints (Elbows, Knees)
    // Normalized VRM Bones resting pose is T-Pose:
    // +X is Left, -X is Right. +Z is Front, -Z is Back. +Y is Up.
    const getLimits = (boneName) => {
      const PI = Math.PI;
      const limits = {
        // VRM T-pose palms face down.
        // Left elbow hinge brings forearm forward/inward, which is negative Y rotation.
        // Allow some X and Z roll but restrict Y to bend forward.
        leftLowerArm: {
          min: new THREE.Vector3(-1.5, -PI * 0.9, -1.5),
          max: new THREE.Vector3(1.5, 0.1, 1.5)
        },
        // Right elbow hinge brings forearm forward/inward = positive Y rotation.
        rightLowerArm: {
          min: new THREE.Vector3(-1.5, -0.1, -1.5),
          max: new THREE.Vector3(1.5, PI * 0.9, 1.5)
        },
        // Knees: the previous test showed positive X bent like a flamingo. Use negative X for backward bend.
        // Lock Y and Z twists tighter for the knee hinge.
        leftLowerLeg: {
          min: new THREE.Vector3(-PI * 0.9, -0.1, -0.1),
          max: new THREE.Vector3(0.05, 0.1, 0.1)
        },
        rightLowerLeg: {
          min: new THREE.Vector3(-PI * 0.9, -0.1, -0.1),
          max: new THREE.Vector3(0.05, 0.1, 0.1)
        }
      };
      return limits[boneName];
    };

    const addIKChain = (effectorName, linkNames) => {
      if (nameToIndex[effectorName] === undefined) return;
      
      const effectorNode = bones[nameToIndex[effectorName]];
      
      const targetNode = new THREE.Object3D();
      targetNode.name = `${effectorName}_IKTarget`;
      
      // Target must start exactly at the effector's current world position
      effectorNode.getWorldPosition(targetNode.position);
      this.scene.add(targetNode);
      this.ikTargets.push(targetNode);

      const targetIndex = bones.length;
      bones.push(targetNode);

      const links = linkNames
        .filter((n) => nameToIndex[n] !== undefined)
        .map((n) => {
          const cfg = { index: nameToIndex[n] };
          const limit = getLimits(n);
          if (limit) {
            if (limit.min) cfg.rotationMin = limit.min;
            if (limit.max) cfg.rotationMax = limit.max;
          }
          return cfg;
        });

      iks.push({
        target: targetIndex,
        effector: nameToIndex[effectorName],
        links: links,
      });
    };

    addIKChain("leftHand", ["leftLowerArm", "leftUpperArm", "leftShoulder"]);
    addIKChain("rightHand", ["rightLowerArm", "rightUpperArm", "rightShoulder"]);
    addIKChain("leftFoot", ["leftLowerLeg", "leftUpperLeg"]);
    addIKChain("rightFoot", ["rightLowerLeg", "rightUpperLeg"]);

    const dummyMesh = new THREE.Object3D();
    dummyMesh.skeleton = { bones: bones };
    
    this.ikSolver = new CCDIKSolver(dummyMesh, iks);
  }

  generateHelpers() {
    if (!this.globals.currentVRM || !this.globals.currentVRM.humanoid) return;

    const humanoid = this.globals.currentVRM.humanoid;
    const humanBones = humanoid.humanBones;
    // Visually distinct helper: small semi-transparent sphere
    const material = new THREE.MeshBasicMaterial({
      color: this.mode === "IK" ? 0xffaa00 : 0x00ffaa,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.3,
    });
    const geometry = new THREE.SphereGeometry(0.015, 16, 16);

    for (const key in humanBones) {
      const vrmBone = humanBones[key];
      // Note: we fetch the normalized bone node, not the raw bone!
      const bone = humanoid.getNormalizedBoneNode(key);

      if (vrmBone && bone) {
        // IK mode generally only operates on limbs/extremities as effectors
        if (this.mode === "IK") {
          const ikBones = ["leftHand", "rightHand", "leftFoot", "rightFoot"];
          if (!ikBones.includes(key)) continue;
          
          // In IK mode, the visual helper acts as a proxy to select the IK target
          const ikTarget = this.ikTargets.find(t => t.name === `${key}_IKTarget`);
          if (ikTarget) {
              const helper = new THREE.Mesh(geometry, material.clone());
              helper.userData.isBoneHelper = true;
              helper.userData.bone = ikTarget; // Selecting the helper attaches TransformControls to the IK Target!
              helper.renderOrder = 999;
              
              // IK Targets live in world space, we just attach the helper to it
              ikTarget.add(helper);
              this.helperCache.push(helper);
          }
        } else {
           // FK mode
           const helper = new THREE.Mesh(geometry, material.clone());
           helper.userData.isBoneHelper = true;
           helper.userData.bone = bone; // Attached to the normalized bone directly
           helper.renderOrder = 999;

           bone.add(helper);
           this.helperCache.push(helper);
        }
      }
    }
  }

  deselectBone() {
    this.transformControls.detach();
    if (this.selectedBone) {
      // Revert helper color
      const helper = this.helperCache.find((h) => h.userData.bone === this.selectedBone);
      if (helper) helper.material.color.setHex(this.mode === "IK" ? 0xffaa00 : 0x00ffaa);
    }
    this.selectedBone = null;
  }

  onClick(event) {
    if (this.mode === "OFF" || !this.globals.currentVRM) return;

    // Calculate mouse position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Raycast exactly against our explicit bone helpers
    const helpers = this.helperCache || [];
    const intersects = this.raycaster.intersectObjects(helpers, false);

    if (intersects.length > 0) {
      const hitHelper = intersects[0].object;
      const targetBone = hitHelper.userData.bone;
      if (targetBone) {
        this.selectBone(targetBone, hitHelper);
        return;
      }
    } else {
        // Deselect if we clicked completely off the helpers and are not hovering/dragging the gizmo.
        // TransformControls uses 'axis' to track if an axis is hovered.
        if (this.transformControls && !this.transformControls.dragging && !this.transformControls.axis) {
           this.deselectBone();
        }
    }
  }

  selectBone(bone, optionalHelperHit = null) {
    if (this.mode === "OFF") return;
    this.deselectBone();

    this.selectedBone = bone;
    this.transformControls.attach(bone);

    // Optional visual highlight for the helper
    const helper = optionalHelperHit || this.helperCache.find((h) => h.userData.bone === bone);
    if (helper) {
      helper.material.color.setHex(0xffffff); // Highlight selected
    }

    this.globals.log(`Selected bone: ${bone.name}`, "blue");
  }

  dispose() {
    this.renderer.domElement.removeEventListener("click", this.onClick);
    this.transformControls.dispose();
    this.clearHelpers();
  }
}
