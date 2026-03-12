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

  // Theme Toggle
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isDark = document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
    });
  }

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
        consoleBtn.querySelector("span").innerText = "Hide Panel";
      } else {
        consolePanel.style.height = "24px";
        consoleLogs.classList.add("hidden");
        consoleIcon.style.transform = "rotate(0deg)";
        consoleBtn.querySelector("span").innerText = "Open Panel";
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
          m.loadVRM(url, globals.scene, globals).finally(() => URL.revokeObjectURL(url)),
        );
      } else if (ext === "vrma" || ext === "glb" || ext === "gltf") {
        import("./vrm_loader.js").then((m) => 
          m.loadVRMA(url, globals).finally(() => URL.revokeObjectURL(url))
        );
      } else {
        globals.log("Unsupported file type: " + ext, "red");
        URL.revokeObjectURL(url);
      }
    }
  });

  // File Input
  document.getElementById("import-btn").onclick = () =>
    document.getElementById("file-input").click();

  document.getElementById("download-vrm-btn").onclick = () => {
    if (!globals.lastMigratedBuffer) return;

    const blob = new Blob([globals.lastMigratedBuffer], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = globals.lastMigratedName || "migrated_v1.vrm";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    globals.log("Downloaded migrated VRM 1.0 file", "green");
  };
  document.getElementById("file-input").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "vrm")
      import("./vrm_loader.js").then((m) =>
        m.loadVRM(url, globals.scene, globals, file.name).finally(() => URL.revokeObjectURL(url)),
      );
    else if (ext === "vrma" || ext === "glb" || ext === "gltf")
      import("./vrm_loader.js").then((m) => 
        m.loadVRMA(url, globals).finally(() => URL.revokeObjectURL(url))
      );
    else URL.revokeObjectURL(url);
  };

  // Camera Views
  const switchCamera = (mode) => {
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

  document.querySelectorAll("[data-cam]").forEach((btn) => {
    btn.onclick = () => switchCamera(btn.dataset.cam);
  });

  window.addEventListener("keydown", (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.tagName === "SELECT"
    )
      return;

    switch (e.key) {
      case "1":
        switchCamera("front");
        break;
      case "2":
        switchCamera("side");
        break;
      case "3":
        switchCamera("face");
        break;
      case "4":
        switchCamera("top");
        break;
    }
  });
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
  const dirLightInput = document.getElementById("env-dir");
  const ambLightInput = document.getElementById("env-amb");

  ambLightInput.oninput = (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById("env-amb-v").innerText = v.toFixed(2);
    
    if (globals.ambientLight) {
      globals.ambientLight.intensity = Math.max(v, 0.01);
    }
  };

  dirLightInput.oninput = (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById("env-dir-v").innerText = v.toFixed(2);
    
    if (globals.dirLight) {
      globals.dirLight.intensity = v;
    }
  };
  
  // Set initial lighting based on HTML default
  setTimeout(() => {
    ambLightInput.oninput({ target: ambLightInput });
    dirLightInput.oninput({ target: dirLightInput });
  }, 500);

  // Screenshots
  document.getElementById("screenshot-btn").onclick = () => {
    const link = document.createElement("a");
    link.download = `vrm_capture_${Date.now()}.png`;
    link.href = globals.renderer.domElement.toDataURL("image/png");
    link.click();
    globals.log("Screenshot generated.", "green");
  };

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
        // Auto-disable IK/FK when animation starts
        if (globals.vrmControl) {
          globals.vrmControl.setMode("OFF");
          updateKinematicsUIState(true);
        }

        import("./vrm_loader.js").then((m) => {
          m.loadVRMA(url, globals).then(() => {
            const btn = document.getElementById("anim-play");
            if (btn) {
              btn.className =
                "flex-1 bg-orange-600 text-white flex items-center justify-center py-2.5 rounded-md transition-all border border-orange-500 shadow-lg shadow-orange-500/30 group";
              btn.innerHTML = `<i data-lucide="pause" class="w-5 h-5 group-hover:scale-110 transition-transform"></i>`;
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

        const isPlaying = !globals.currentAction.paused;
        
        // Coordination: Only disable IK/FK buttons during active playback
        if (isPlaying && globals.vrmControl) {
          globals.vrmControl.setMode("OFF");
        }
        updateKinematicsUIState(isPlaying);

        if (isPlaying) {
          playBtn.className =
            "flex-1 bg-orange-600 text-white flex items-center justify-center py-2.5 rounded-md transition-all border border-orange-500 shadow-lg shadow-orange-500/30 group";
        } else {
          playBtn.className =
            "flex-1 bg-zinc-800 text-orange-400 hover:bg-zinc-700 flex items-center justify-center py-2.5 rounded-md transition-all border border-white/10 group";
        }

        playBtn.innerHTML = `<i data-lucide="${isPlaying ? "pause" : "play"}" class="w-5 h-5 group-hover:scale-110 transition-transform"></i>`;
        lucide.createIcons();

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

  // LookAt setup
  document.getElementById("lookat-toggle").onchange = (e) => {
    globals.isLookAtEnabled = e.target.checked;
    globals.log(
      `Mouse LookAt Tracking: ${e.target.checked ? "ON" : "OFF"}`,
      "blue",
    );
  };

  window.addEventListener("mousemove", (e) => {
    if (globals.isLookAtEnabled) {
      // Map mouse to a rough 3D coordinate space in front of the avatar
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      // Target X, Y mapped, Z is positive distance in front of avatar
      globals.cameraTarget.set(x * 2.0, y * 2.0 + 1.2, 2.0);
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

      // Disable kinematics so they don't fight the pose
      if (globals.vrmControl) {
        globals.vrmControl.setMode("OFF");
        updateKinematicsUIState(false); // Ensure buttons are active
      }

      // Reset first
      humanoid.resetNormalizedPose();

      // Safeguard for Desktop Posing formats
      if (poseData.muscles !== undefined && !poseData.data) {
        globals.log(
          "Parsing of legacy Desktop format containing the muscles array is not supported. Please export to VRMA format using the original software.",
          "yellow",
        );
        return;
      }

      // Apply rotations from JSON
      const data = poseData.data;
      if (!data) {
        globals.log("Unrecognized pose data file structure.", "red");
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

  // Pre-bind all static and dynamic pose preset buttons
  document.getElementById("right-content").addEventListener("click", (e) => {
    const btn = e.target.closest(".pose-preset");
    if (!btn) return;
    const posePath = btn.dataset.pose;
    if (posePath === "t-pose" || !posePath) {
      if (globals.currentVRM) {
        if (globals.vrmControl) {
          globals.vrmControl.setMode("OFF");
          updateKinematicsUIState(false);
        }
        if (globals.mixer) globals.mixer.stopAllAction();
        globals.currentVRM.humanoid.resetNormalizedPose();
        globals.log("Set to standard T-Pose.", "yellow");
      }
    } else {
      if (globals.mixer) globals.mixer.stopAllAction();
      loadPose(posePath);
    }
  });

  const btnIdleAnim = document.getElementById("btn-idle-anim");
  if (btnIdleAnim) {
    btnIdleAnim.onclick = () => {
      // Auto-disable IK/FK when animation starts
      if (globals.vrmControl) {
        globals.vrmControl.setMode("OFF");
        updateKinematicsUIState(true);
      }

      import("./vrm_loader.js").then((m) => {
        m.loadVRMA("/animations/idle_loop.vrma", globals).then(() => {
          const btn = document.getElementById("anim-play");
          if (btn) {
            btn.className =
              "flex-1 bg-orange-600 text-white flex items-center justify-center py-2.5 rounded-md transition-all border border-orange-500 shadow-lg shadow-orange-500/30 group";
            btn.innerHTML = `<i data-lucide="pause" class="w-5 h-5 group-hover:scale-110 transition-transform"></i>`;
            lucide.createIcons();
          }
          globals.log("Idle Animation applied", "blue");
        });
      });
    };
  }

  // Custom Pose Upload Logic
  const btnImportPose = document.getElementById("btn-import-pose");
  const inputCustomPose = document.getElementById("input-custom-pose");

  if (btnImportPose && inputCustomPose) {
    btnImportPose.onclick = () => inputCustomPose.click();
    inputCustomPose.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const jsonContent = evt.target.result;
          // Validate JSON format roughly
          JSON.parse(jsonContent);

          // Create Blob URL so loadPose can fetch it normally like other urls
          const blob = new Blob([jsonContent], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          loadPose(url);

          // Clear input so same file can be selected again if needed
          inputCustomPose.value = "";
        } catch (err) {
          globals.log("Invalid JSON Format", "red");
          console.error(err);
        }
      };
      reader.readAsText(file);
    };
  }

  // Custom Pose Export Logic
  const btnExportPose = document.getElementById("btn-export-pose");
  if (btnExportPose) {
    btnExportPose.onclick = () => {
      if (!globals.currentVRM || !globals.currentVRM.humanoid) {
        globals.log("No VRM loaded to export pose from.", "yellow");
        return;
      }
      
      const humanoid = globals.currentVRM.humanoid;
      const poseData = {
        name: `Exported Pose ${new Date().toLocaleTimeString()}`,
        code: self.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        vrmVersion: "1.0",
        data: {}
      };

      Object.keys(humanoid.humanBones).forEach((name) => {
        const node = humanoid.getNormalizedBoneNode(name);
        if (node) {
          poseData.data[name] = {
            rotation: node.quaternion.toArray()
          };
        }
      });

      const blob = new Blob([JSON.stringify(poseData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exported_pose_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      globals.log("Pose exported successfully.", "green");
    };
  }

  // Kinematics Indicator Sliders
  const radiusSlider = document.getElementById("slider-indicator-radius");
  const radiusLabel = document.getElementById("label-indicator-radius");
  if (radiusSlider && radiusLabel) {
    radiusSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      radiusLabel.innerText = val.toFixed(3);
      if (globals.vrmControl) {
        globals.vrmControl.updateIndicators(undefined, val);
      }
    });
  }

  const opacitySlider = document.getElementById("slider-indicator-opacity");
  const opacityLabel = document.getElementById("label-indicator-opacity");
  if (opacitySlider && opacityLabel) {
    opacitySlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      opacityLabel.innerText = val.toFixed(1);
      if (globals.vrmControl) {
        globals.vrmControl.updateIndicators(val, undefined);
      }
    });
  }
} // End setupUIHandlers

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

/**
 * Coordination helper to enable/disable IK/FK buttons during animation playback
 */
function updateKinematicsUIState(disabled) {
  const group = document.getElementById("kinematics-mode-group");
  if (!group) return;

  const buttons = group.querySelectorAll("button");
  buttons.forEach((btn) => {
    btn.disabled = disabled;
    if (disabled) {
      btn.style.opacity = "0.4";
      btn.style.pointerEvents = "none";
      btn.style.cursor = "not-allowed";
      // Ensure OFF is visually active if we forced mode to OFF
      if (btn.dataset.mode === "OFF") {
        btn.className =
          "px-3 py-1 bg-zinc-700 text-white font-bold transition-colors";
      } else {
        btn.className =
          "px-3 py-1 bg-slate-50 dark:bg-[#111] text-slate-500 dark:text-zinc-500 font-bold transition-colors";
      }
    } else {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      btn.style.cursor = "pointer";
      
      // When re-enabling (or just syncing state to OFF without disabling ui), 
      // ensure the OFF button is visually selected and others are deselected.
      if (btn.dataset.mode === "OFF") {
        btn.className = "px-3 py-1 bg-blue-600 text-white font-bold transition-colors";
      } else {
        btn.className = "px-3 py-1 bg-slate-50 dark:bg-[#111] text-slate-700 dark:text-zinc-300 font-bold hover:bg-black/10 dark:hover:bg-white/10 transition-colors";
      }
    }
  });

  const desc = document.getElementById("kinematics-desc");
  if (desc) {
    desc.innerText = disabled
      ? "Kinematics disabled during animation playback."
      : "Select IK or FK to enable bone manipulation.";
    desc.className = disabled
      ? "text-[9px] text-orange-400 font-bold animate-pulse"
      : "text-[9px] text-zinc-500 italic";
  }
}

