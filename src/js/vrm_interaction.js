import * as THREE from "three/webgpu";
import { VRMUtils } from "@pixiv/three-vrm";

export function setupUIHandlers(globals) {
  // Tabs
  const setupTabs = (tabRoot, contentRoot) => {
    const btns = document.getElementById(tabRoot).querySelectorAll("button");
    const contents = document.getElementById(contentRoot).children;
    btns.forEach((btn) => {
      btn.onclick = () => {
        btns.forEach((b) => b.classList.remove("tab-active"));
        btn.classList.add("tab-active");
        Array.from(contents).forEach((c) => c.classList.add("hidden"));
        const target = document.getElementById(`tab-${btn.dataset.tab}`);
        if (target) target.classList.remove("hidden");
      };
    });
  };
  setupTabs("left-tabs", "left-content");
  setupTabs("right-tabs", "right-content");

  setupDraggableStats();

  // Console Toggle
  const consoleBtn = document.getElementById("console-toggle-btn");
  const consolePanel = document.getElementById("console-panel");
  const consoleLogs = document.getElementById("console-logs");
  const consoleIcon = document.getElementById("console-icon");
  let consoleOpen = false;

  if (consoleBtn) {
    consoleBtn.addEventListener("click", () => {
      consoleOpen = !consoleOpen;
      if (consoleOpen) {
        consolePanel.style.height = "144px"; // 24px header + 120px body
        consoleLogs.classList.remove("hidden");
        consoleIcon.style.transform = "rotate(-180deg)";
        consoleBtn.querySelector("span").innerText = "隐藏面板";
      } else {
        consolePanel.style.height = "24px";
        consoleLogs.classList.add("hidden");
        consoleIcon.style.transform = "rotate(0deg)";
        consoleBtn.querySelector("span").innerText = "打开面板";
      }
    });
  }

  // Drag and Drop
  const dropZone = document.getElementById("drop-zone");
  const vp = document.getElementById("viewport-container");

  vp.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.remove("hidden");
    dropZone.classList.add("flex");
  });

  vp.addEventListener("dragleave", (e) => {
    e.preventDefault();
    if (
      e.relatedTarget &&
      !dropZone.contains(e.relatedTarget) &&
      e.relatedTarget !== dropZone
    ) {
      dropZone.classList.add("hidden");
      dropZone.classList.remove("flex");
    }
  });

  vp.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.add("hidden");
    dropZone.classList.remove("flex");

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const url = URL.createObjectURL(file);
      const ext = file.name.split(".").pop().toLowerCase();

      if (ext === "vrm") {
        import("./vrm_loader.js").then((m) =>
          m.loadVRM(url, globals.scene, globals),
        );
      } else if (ext === "vrma" || ext === "glb" || ext === "gltf") {
        import("./vrm_loader.js").then((m) => m.loadVRMA(url, globals));
      } else {
        globals.log("Unsupported file type: " + ext, "red");
      }
    }
  });

  // File Input
  document.getElementById("import-btn").onclick = () =>
    document.getElementById("file-input").click();
  document.getElementById("file-input").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "vrm")
      import("./vrm_loader.js").then((m) =>
        m.loadVRM(url, globals.scene, globals),
      );
    else if (ext === "vrma" || ext === "glb" || ext === "gltf")
      import("./vrm_loader.js").then((m) => m.loadVRMA(url, globals));
  };

  // Camera Views
  document.querySelectorAll("[data-cam]").forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.cam;
      if (mode === "front") {
        globals.camera.position.set(0, 1.4, 3);
        globals.controls.target.set(0, 1.1, 0);
      } else if (mode === "side") {
        globals.camera.position.set(2, 1.4, 0);
        globals.controls.target.set(0, 1.1, 0);
      } else if (mode === "face") {
        globals.camera.position.set(0, 1.5, 0.7);
        globals.controls.target.set(0, 1.45, 0);
      } else if (mode === "top") {
        globals.camera.position.set(0, 3, 0.01);
        globals.controls.target.set(0, 0, 0);
      }
      globals.log(`Camera switched to: ${mode}`, "gray");
    };
  });

  const gizmoT = document.getElementById("gizmo-t");
  if (gizmoT)
    gizmoT.onclick = () => {
      globals.transformControls.setMode("translate");
      globals.log("Gizmo: Translate", "yellow");
    };
  const gizmoR = document.getElementById("gizmo-r");
  if (gizmoR)
    gizmoR.onclick = () => {
      globals.transformControls.setMode("rotate");
      globals.log("Gizmo: Rotate", "yellow");
    };
  const gizmoS = document.getElementById("gizmo-s");
  if (gizmoS)
    gizmoS.onclick = () => {
      globals.transformControls.setMode("scale");
      globals.log("Gizmo: Scale", "yellow");
    };

  // Env toggles
  document.getElementById("grid-toggle").onchange = (e) => {
    if (globals.gridHelper) globals.gridHelper.visible = e.target.checked;
  };
  document.getElementById("axes-toggle").onchange = (e) => {
    if (globals.axesHelper) globals.axesHelper.visible = e.target.checked;
  };
  document.getElementById("skeleton-toggle").onchange = (e) => {
    if (globals.skeletonHelper)
      globals.skeletonHelper.visible = e.target.checked;
  };

  // Background colors
  document.querySelectorAll("[data-bg]").forEach((btn) => {
    btn.onclick = () => {
      const color = btn.dataset.bg;
      if (color === "transparent") {
        globals.renderer.setClearColor(0x000000, 0);
        globals.scene.background = null;
      } else {
        globals.renderer.setClearColor(color, 1);
        globals.scene.background = new THREE.Color(color);
      }
    };
  });

  // Lighting
  document.getElementById("env-amb").oninput = (e) => {
    const v = parseFloat(e.target.value);
    globals.ambientLight.intensity = v;
    document.getElementById("env-amb-v").innerText = v.toFixed(2);
  };
  document.getElementById("env-dir").oninput = (e) => {
    const v = parseFloat(e.target.value);
    globals.dirLight.intensity = v;
    document.getElementById("env-dir-v").innerText = v.toFixed(2);
  };

  // Screenshots
  document.getElementById("screenshot-btn").onclick = () => {
    const link = document.createElement("a");
    link.download = `vrm_capture_${Date.now()}.png`;
    link.href = globals.renderer.domElement.toDataURL("image/png");
    link.click();
    globals.log("Screenshot generated.", "green");
  };

  // FK Controls update object rotation
  ["x", "y", "z"].forEach((axis) => {
    document.getElementById(`fk-${axis}`).oninput = (e) => {
      if (
        globals.transformControls.object &&
        globals.transformControls.object.isBone
      ) {
        const v = (parseFloat(e.target.value) * Math.PI) / 180;
        globals.transformControls.object.rotation[axis] = v;
        document.getElementById(`fk-${axis}-val`).innerText = (
          (v * 180) /
          Math.PI
        ).toFixed(1);
      }
    };
  });

  const resetBtn = document.getElementById("reset-pose");
  if (resetBtn)
    resetBtn.onclick = () => {
      if (globals.currentVRM) {
        globals.currentVRM.humanoid.resetNormalizedPose();
        globals.log("Reset to strict T-Pose.", "yellow");
      }
    };

  // Animation Controls
  const presetSelect = document.getElementById("anim-preset-select");
  if (presetSelect) {
    const animFiles = import.meta.glob("../../public/animations/**/*.vrma", {
      query: "?url",
      import: "default",
      eager: true,
    });
    for (const path in animFiles) {
      const url = animFiles[path];
      // Only get filename without extension
      const name = path.split("/").pop().replace(".vrma", "");
      const option = document.createElement("option");
      option.value = url;
      option.textContent = name;
      presetSelect.appendChild(option);
    }

    presetSelect.onchange = (e) => {
      const url = e.target.value;
      if (url) {
        import("./vrm_loader.js").then((m) => {
          m.loadVRMA(url, globals).then(() => {
            // After loading, it auto-plays.
            // User requested: Status is Playing -> Play Icon
            const playIcon = document
              .getElementById("anim-play")
              .querySelector("i");
            if (playIcon) {
              playIcon.setAttribute("data-lucide", "play");
              lucide.createIcons();
            }
          });
        });
      }
    };
  }

  const playBtn = document.getElementById("anim-play");
  if (playBtn) {
    playBtn.onclick = () => {
      if (globals.currentAction) {
        const isPaused = globals.currentAction.paused;
        if (globals.currentAction.enabled === false) {
          globals.currentAction.enabled = true;
          globals.currentAction.play();
          globals.currentAction.paused = false;
        } else {
          globals.currentAction.paused = !isPaused;
        }

        const icon = playBtn.querySelector("i");
        if (icon) {
          // User requested: Status is Paused -> Pause Icon; Status is Playing -> Play Icon
          icon.setAttribute(
            "data-lucide",
            globals.currentAction.paused ? "pause" : "play",
          );
          lucide.createIcons();
        }

        globals.log(
          globals.currentAction.paused
            ? "Animation paused"
            : "Animation playing",
        );
      } else {
        globals.log("No animation loaded to play.", "yellow");
      }
    };
  }
  const progressRange = document.getElementById("anim-progress");
  if (progressRange) {
    progressRange.onmousedown = () => {
      globals.isSeeking = true;
    };
    progressRange.onmouseup = () => {
      globals.isSeeking = false;
    };
    progressRange.oninput = (e) => {
      if (globals.currentAction) {
        const clip = globals.currentAction.getClip();
        if (clip) {
          const ratio = parseFloat(e.target.value) / 100;
          globals.currentAction.time = ratio * clip.duration;
          // Refresh time display immediately
          document.getElementById("anim-time").innerText =
            globals.currentAction.time.toFixed(1) +
            "s / " +
            clip.duration.toFixed(1) +
            "s";
        }
      }
    };
  }
  document.getElementById("anim-speed").onchange = (e) => {
    if (globals.mixer) globals.mixer.timeScale = parseFloat(e.target.value);
  };

  // Export Pose Configuration
  document.getElementById("export-json-btn").onclick = () => {
    if (!globals.currentVRM) {
      globals.log("No VRM loaded to export pose from.", "red");
      return;
    }

    const humanoid = globals.currentVRM.humanoid;
    const poseData = {
      name: `pose_${Date.now()}`,
      vrmVersion: "0",
      data: {},
    };

    // Export only normalized bone nodes that have non-zero rotation relative to rest pose
    // For standard VRM 0.0 format, all bones are dumped.
    for (const boneName in humanoid.humanBones) {
      const boneArray = humanoid.humanBones[boneName];
      if (boneArray && boneArray.length > 0) {
        // VRM humanoid bone mapping typically returns an array, usually 1 bone inside
        const boneNode = boneArray[0].node;
        if (boneNode) {
          poseData.data[boneName] = {
            rotation: [
              boneNode.quaternion.x,
              boneNode.quaternion.y,
              boneNode.quaternion.z,
              boneNode.quaternion.w,
            ],
          };
        }
      }
    }

    const blob = new Blob([JSON.stringify(poseData)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vrm_pose_${Date.now()}.json`;
    link.click();
    globals.log("Current pose exported to JSON.", "green");
  };

  // LookAt setup
  document.getElementById("lookat-toggle").onchange = (e) => {
    globals.isLookAtEnabled = e.target.checked;
    globals.log(
      `Mouse LookAt Tracking: ${e.target.checked ? "ON" : "OFF"}`,
      "blue",
    );
  };

  window.addEventListener("mousemove", (e) => {
    if (
      globals.isLookAtEnabled &&
      globals.currentVRM &&
      globals.currentVRM.lookAt
    ) {
      // Map mouse to a rough 3D coordinate space in front of the avatar
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      // Avatar is at (0,0,0) usually. Target X, Y mapped, Z is positive distance
      globals.lookAtTarget.set(x * 2.0, y * 2.0 + 1.2, 2.0);
      globals.currentVRM.lookAt.lookAt(globals.lookAtTarget);
    }
  });

  // Posing Presets
  const loadPose = async (url) => {
    if (!globals.currentVRM) {
      globals.log("Load a VRM model first!", "red");
      return;
    }
    try {
      const resp = await fetch(url);
      const poseData = await resp.json();
      const humanoid = globals.currentVRM.humanoid;

      // Reset first
      humanoid.resetNormalizedPose();

      // Safeguard for Desktop Posing formats
      if (poseData.muscles !== undefined && !poseData.data) {
        globals.log(
          "暂不支持解析包含 muscles 阵列的旧版 Desktop 格式，请通过原软件导出 VRMA 格式。",
          "yellow",
        );
        return;
      }

      // Apply rotations from JSON
      const data = poseData.data;
      if (!data) {
        globals.log("未识别的姿势数据文件结构。", "red");
        return;
      }
      for (const boneName in data) {
        const bone = humanoid.getNormalizedBoneNode(boneName);
        if (bone && data[boneName].rotation) {
          const r = data[boneName].rotation; // [x, y, z, w]
          bone.quaternion.set(r[0], r[1], r[2], r[3]);
        }
      }
      humanoid.update();
      globals.log(
        `Pose applied: ${poseData.name || url.split("/").pop()}`,
        "blue",
      );
    } catch (e) {
      console.error(e);
      globals.log("Failed to load pose: " + e.message, "red");
    }
  };

  const poseContainer = document.getElementById("pose-preset-container");
  const advancedPoseSelect = document.getElementById("pose-advanced-select");

  if (poseContainer) {
    const poseFiles = import.meta.glob("../../public/pose/**/*.json", {
      query: "?url",
      import: "default",
      eager: true,
    });

    // For grouping advanced poses
    const advancedGroups = {
      female: [],
      male: [],
    };

    for (const path in poseFiles) {
      const url = poseFiles[path];
      const filename = path.split("/").pop().replace(".json", "");

      // Check if it's in the subfolder Free_VRM
      if (path.includes("Free_VRM")) {
        if (path.includes("female") || path.includes("女性向け")) {
          advancedGroups.female.push({ name: filename, url });
        } else if (path.includes("male") || path.includes("男性向け")) {
          advancedGroups.male.push({ name: filename, url });
        }
      } else {
        // Basic top-level poses go to buttons
        const btn = document.createElement("button");
        btn.className =
          "pose-preset bg-zinc-800 hover:bg-zinc-700 border border-white/5 p-2 rounded-md text-[9px] text-zinc-300 transition-all font-medium uppercase";
        btn.dataset.pose = url;
        btn.textContent = filename;
        poseContainer.appendChild(btn);
      }
    }

    // Populate advanced select box
    if (advancedPoseSelect) {
      const createOptGroup = (label, items) => {
        if (items.length === 0) return;
        const group = document.createElement("optgroup");
        group.label = label;
        items
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true }),
          )
          .forEach((item) => {
            const opt = document.createElement("option");
            opt.value = item.url;
            opt.textContent = item.name;
            group.appendChild(opt);
          });
        advancedPoseSelect.appendChild(group);
      };

      createOptGroup("Female / 女性", advancedGroups.female);
      createOptGroup("Male / 男性", advancedGroups.male);

      advancedPoseSelect.onchange = (e) => {
        const url = e.target.value;
        if (url) {
          loadPose(url);
          // Optional reset select back to default after trigger if desired,
          // but leaving it shows current selected pose
        }
      };
    }
  }

  document.querySelectorAll(".pose-preset").forEach((btn) => {
    btn.onclick = () => {
      const posePath = btn.dataset.pose;
      if (posePath === "t-pose" || !posePath) {
        if (globals.currentVRM) {
          globals.currentVRM.humanoid.resetNormalizedPose();
          globals.log("Set to standard T-Pose.", "yellow");
        }
      } else {
        loadPose(posePath);
      }
    };
  });

  setupIK(globals);
  setupPhysicsHandlers(globals);
}

function setupDraggableStats() {
  const el = document.getElementById("stats-container");
  const handle = document.getElementById("stats-drag-handle");
  if (!el || !handle) return;

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  handle.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const parentRect = el.parentElement.getBoundingClientRect();

    // Lock CSS from right relative to left absolute to prevent flex bugs
    initialLeft = rect.left - parentRect.left;
    initialTop = rect.top - parentRect.top;

    el.style.right = "auto";
    el.style.left = `${initialLeft}px`;
    el.style.top = `${initialTop}px`;
    el.style.transition = "none"; // disable smooth transition while dragging
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    el.style.left = `${initialLeft + dx}px`;
    el.style.top = `${initialTop + dy}px`;
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      el.style.transition = ""; // restore transition
    }
  });
}

function setupIK(globals) {
  globals.ikTargets = {};
  const names = ["leftHand", "rightHand", "leftFoot", "rightFoot"];
  const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];

  const ikGroup = new THREE.Group();
  globals.scene.add(ikGroup);

  names.forEach((name, i) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({
        color: colors[i],
        wireframe: true,
        depthTest: false,
      }),
    );
    mesh.visible = false;
    mesh.name = "IKTarget_" + name;
    ikGroup.add(mesh);
    globals.ikTargets[name] = mesh;
  });

  const ikToggle = document.getElementById("ik-toggle");
  if (ikToggle) {
    ikToggle.onchange = (e) => {
      globals.isIKEnabled = e.target.checked;
      Object.values(globals.ikTargets).forEach(
        (t) => (t.visible = globals.isIKEnabled),
      );
      globals.log(`IK Handlers: ${globals.isIKEnabled ? "ON" : "OFF"}`, "blue");

      if (globals.isIKEnabled && globals.currentVRM) {
        names.forEach((n) => {
          const bone = globals.currentVRM.humanoid.getNormalizedBoneNode(n);
          if (bone) bone.getWorldPosition(globals.ikTargets[n].position);
        });
      }
    };
  }

  // Bind transform controls logic to easily grab targets
  let ikRaycaster = new THREE.Raycaster();
  let mouse = new THREE.Vector2();
  const cEl = globals.renderer.domElement;
  cEl.addEventListener("dblclick", (e) => {
    if (!globals.isIKEnabled) return;
    const rect = cEl.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ikRaycaster.setFromCamera(mouse, globals.camera);
    const intersects = ikRaycaster.intersectObjects(
      Object.values(globals.ikTargets),
    );
    if (intersects.length > 0) {
      globals.transformControls.attach(intersects[0].object);
      globals.log(`Attached IK Handle: ${intersects[0].object.name}`, "blue");
    }
  });

  window.updateIK = function (vrm) {
    if (!vrm || !globals.isIKEnabled) return;

    const solve2BoneIK = (upperName, lowerName, effectorName, target) => {
      const upper = vrm.humanoid.getNormalizedBoneNode(upperName);
      const lower = vrm.humanoid.getNormalizedBoneNode(lowerName);
      const effector = vrm.humanoid.getNormalizedBoneNode(effectorName);
      if (!upper || !lower || !effector || !target) return;

      const bones = [lower, upper];
      for (let iter = 0; iter < 3; iter++) {
        for (const bone of bones) {
          upper.updateMatrixWorld(true);
          const ePos = new THREE.Vector3().setFromMatrixPosition(
            effector.matrixWorld,
          );
          const tPos = new THREE.Vector3().setFromMatrixPosition(
            target.matrixWorld,
          );
          const bPos = new THREE.Vector3().setFromMatrixPosition(
            bone.matrixWorld,
          );

          const eDir = ePos.clone().sub(bPos).normalize();
          const tDir = tPos.clone().sub(bPos).normalize();

          const dot = eDir.dot(tDir);
          if (dot < 1.0) {
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (angle > 0.001) {
              const axis = new THREE.Vector3()
                .crossVectors(eDir, tDir)
                .normalize();
              const qWorld = new THREE.Quaternion().setFromAxisAngle(
                axis,
                angle * 0.5,
              );

              const parentWorldQ = new THREE.Quaternion();
              if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQ);
              const qLocal = parentWorldQ
                .invert()
                .multiply(qWorld)
                .multiply(parentWorldQ);

              bone.quaternion.premultiply(qLocal);
              bone.updateMatrixWorld(true);
            }
          }
        }
      }
    };

    solve2BoneIK(
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      globals.ikTargets.leftHand,
    );
    solve2BoneIK(
      "rightUpperArm",
      "rightLowerArm",
      "rightHand",
      globals.ikTargets.rightHand,
    );
    solve2BoneIK(
      "leftUpperLeg",
      "leftLowerLeg",
      "leftFoot",
      globals.ikTargets.leftFoot,
    );
    solve2BoneIK(
      "rightUpperLeg",
      "rightLowerLeg",
      "rightFoot",
      globals.ikTargets.rightFoot,
    );
  };
}

function setupPhysicsHandlers(globals) {
  const gRange = document.getElementById("phys-grav");
  const dRange = document.getElementById("phys-drag");
  const wRange = document.getElementById("phys-wind");

  const updatePhysics = () => {
    if (!globals.currentVRM || !globals.currentVRM.springBoneManager) return;
    const g = parseFloat(gRange.value);
    const d = parseFloat(dRange.value);
    const w = parseFloat(wRange.value);

    document.getElementById("val-grav").innerText = g.toFixed(1);
    document.getElementById("val-drag").innerText = d.toFixed(1);
    document.getElementById("val-wind").innerText = w.toFixed(2);

    // This is a simplifiction to show capability. Modifying base variables of all springs.
    const springs = globals.currentVRM.springBoneManager.joints;
    if (!globals._initialSprings) {
      globals._initialSprings = springs.map((s) => ({
        gravityPower: s.settings?.gravityPower || 0,
        dragForce: s.settings?.dragForce || 0,
        gravityDir: s.settings?.gravityDir
          ? s.settings.gravityDir.clone()
          : new THREE.Vector3(0, -1, 0),
      }));
    }

    springs.forEach((spring, idx) => {
      const init = globals._initialSprings[idx];
      if (init && spring.settings) {
        spring.settings.gravityPower = init.gravityPower * g;
        spring.settings.dragForce = init.dragForce * d;

        // Simulate wind by modifying gravityDir X axis temporarily
        const newDir = init.gravityDir.clone();
        newDir.x += w;
        newDir.normalize();
        if (spring.settings.gravityDir) spring.settings.gravityDir.copy(newDir);
      }
    });
  };

  gRange.oninput = updatePhysics;
  dRange.oninput = updatePhysics;
  wRange.oninput = updatePhysics;
}
