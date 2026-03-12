import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { initAudioLipsync, updateAudioLipsync } from "./vrm_audio.js";
import { setupUIHandlers } from "./vrm_interaction.js";
import { VRMControl } from "./vrm_control.js";

const globals = {
  scene: null,
  camera: null,
  renderer: null,
  composer: null,
  controls: null,
  currentVRM: null,
  mixer: null,
  currentAction: null,
  clock: new THREE.Timer(),
  ambientLight: null,
  dirLight: null,
  gridHelper: null,
  axesHelper: null,
  skeletonHelper: null,
  audioCtx: null,
  analyser: null,
  dataArray: null,
  isLookAtEnabled: true,
  lookAtTarget: new THREE.Object3D(),
  cameraTarget: new THREE.Vector3(),
  boneMap: {},
  springBoneVisualizerRoots: [],
  isSeeking: false,
  vrmControl: null, // Custom IK/FK controller
  fpsFrames: 0,
  fpsPrevTime: performance.now(),
  fpsHistory: new Array(60).fill(60),
  lastMigratedBuffer: null,
  lastMigratedName: null,

  log: function (msg, color = "gray") {
    const logEl = document.getElementById("console-logs");
    if (!logEl) return;
    const div = document.createElement("div");
    const colors = {
      red: "text-red-500",
      green: "text-green-400",
      blue: "text-blue-400",
      yellow: "text-orange-400",
      gray: "text-zinc-500",
      purple: "text-purple-400",
    };
    div.className = colors[color] || colors.gray;
    div.innerHTML = `<span class="opacity-50 text-[8px]">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  },

  updateExpressions: function (vrm) {
    const container = document.getElementById("expression-controls");
    container.innerHTML = "";
    const mgr = vrm.expressionManager;
    if (!mgr) return;

    mgr.expressions.forEach((exp) => {
      const item = document.createElement("div");
      item.className = "space-y-1 mb-2";
      item.innerHTML = `
                <div class="flex justify-between text-[10px] text-zinc-400 font-mono">
                    <span class="">${exp.expressionName}</span>
                    <span id="val-${exp.expressionName}">0%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value="0" 
                       class="w-full h-1 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none accent-blue-500 cursor-pointer"
                       data-exp="${exp.expressionName}">
   `;
      const slider = item.querySelector("input");
      slider.oninput = (e) => {
        const v = parseFloat(e.target.value);
        document.getElementById(`val-${exp.expressionName}`).innerText =
          `${Math.round(v * 100)}%`;
        mgr.setValue(exp.expressionName, v);
      };
      container.appendChild(item);
    });
  },

  updateMetadata: function (meta) {
    const container = document.getElementById("meta-container");
    if (!meta) return;

    const renderValue = (v) => {
      if (v === null || v === undefined || v === "") return "-";
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    };

    const data = Object.entries(meta).map(([k, v]) => {
      return { k: k, v: renderValue(v) };
    });

    container.innerHTML = data
      .map(
        (i) => `
   <div class="flex flex-col border-b border-white/5 pb-1 gap-1 mt-1">
    <span class="text-zinc-500 font-bold shrink-0 text-[10px] capitalize">${i.k}</span>
    <span class="text-zinc-300 font-medium break-all text-[11px]" title='${i.v.replace(/'/g, "&#39;")}'>${i.v}</span>
   </div>
  `,
      )
      .join("");
  },

  updateHierarchy: function (root) {
    const tree = document.getElementById("hierarchy-tree");
    tree.innerHTML = "";
    let geomCount = 0;
    let texCount = 0;

    const createNode = (obj, depth = 0) => {
      const node = document.createElement("div");
      node.className = `tree-node py-1 px-2 cursor-pointer transition-colors flex justify-between items-center rounded`;
      node.style.paddingLeft = `${depth * 10 + 8}px`;

      const isBone = obj.isBone;
      if (obj.isMesh) {
        geomCount++;
        if (obj.material && obj.material.map) texCount++;
      }

      node.innerHTML = `
    <div class="flex items-center gap-1 overflow-hidden">
     <i data-lucide="${isBone ? "bone" : "box"}" class="w-3 h-3 shrink-0 ${isBone ? "text-orange-400" : "text-blue-400"}"></i> 
     <span class="truncate">${obj.name || obj.type}</span>
    </div>
    <button class="vis-btn w-4 h-4 text-zinc-600 hover:text-white shrink-0" title="Toggle Visibility">
     <i data-lucide="${obj.visible ? "eye" : "eye-off"}" class="w-3 h-3"></i>
    </button>
   `;

      node.onclick = (e) => {
        e.stopPropagation();
        document
          .querySelectorAll(".tree-node")
          .forEach((n) => n.classList.remove("selected"));
        node.classList.add("selected");

        if (globals.vrmControl && globals.vrmControl.isActive) {
          globals.vrmControl.selectBone(obj);
        }

        globals.log(`Selected Node: ${obj.name}`, "blue");
      };

      const visBtn = node.querySelector(".vis-btn");
      visBtn.onclick = (e) => {
        e.stopPropagation();
        obj.visible = !obj.visible;
        visBtn.innerHTML = `<i data-lucide="${obj.visible ? "eye" : "eye-off"}" class="w-3 h-3"></i>`;
        lucide.createIcons();
      };

      tree.appendChild(node);
      obj.children.forEach((child) => createNode(child, depth + 1));
    };

    createNode(root);
    lucide.createIcons();

    document.getElementById("stat-geom").innerText = geomCount;
    document.getElementById("stat-tex").innerText = texCount;
  },

  initPhysics: function (vrm) {
    // VRM SpringBone visualization toggler
    const visToggle = document.getElementById("sb-vis-toggle");
    visToggle.onchange = (e) => {
      const on = e.target.checked;
      if (globals.springBoneVisualizerRoots) {
        globals.springBoneVisualizerRoots.forEach((root) => {
          root.visible = on;
        });
        globals.log(
          `SpringBone visualizer ${on ? "Enabled" : "Disabled"}`,
          "purple",
        );
      }
    };

    // Sliders
    const gravSlider = document.getElementById("phys-grav");
    const dragSlider = document.getElementById("phys-drag");
    const windSlider = document.getElementById("phys-wind");

    const updatePhysics = () => {
      // three-vrm 3.5 uses springBoneManager.springs which contain joints
      if (!vrm.springBoneManager || !vrm.springBoneManager.springs) return;
      
      const gravMult = parseFloat(gravSlider.value);
      const dragMult = parseFloat(dragSlider.value);
      const windX = parseFloat(windSlider.value);

      document.getElementById("val-grav").innerText = gravMult.toFixed(1);
      document.getElementById("val-drag").innerText = dragMult.toFixed(1);
      document.getElementById("val-wind").innerText = windX.toFixed(2);

      vrm.springBoneManager.springs.forEach((spring) => {
        spring.joints.forEach((joint) => {
          if (!joint.settings) return;
          
          if (joint.settings.originalGravityPower === undefined) {
             joint.settings.originalGravityPower = joint.settings.gravityPower;
          }
          if (joint.settings.originalDragForce === undefined) {
             joint.settings.originalDragForce = joint.settings.dragForce;
          }
          if (joint.settings.originalGravityDir === undefined) {
             joint.settings.originalGravityDir = joint.settings.gravityDir.clone();
          }

          // Fallback to a base gravity of 0.5 if original was 0, to make gravity multiplier actually work
          const baseGravity = joint.settings.originalGravityPower === 0 ? 0.5 : joint.settings.originalGravityPower;
          joint.settings.gravityPower = baseGravity * gravMult;
          
          joint.settings.dragForce = joint.settings.originalDragForce * dragMult;
          
          // Apply horizontal wind to the gravityDir vector relative to its original direction
          joint.settings.gravityDir.copy(joint.settings.originalGravityDir);
          joint.settings.gravityDir.x += windX;
          joint.settings.gravityDir.normalize();
        });
      });
    };

    gravSlider.oninput = updatePhysics;
    dragSlider.oninput = updatePhysics;
    windSlider.oninput = updatePhysics;
  },
};

// --- Initialization ---

async function init() {
  lucide.createIcons();
  const container = document.getElementById("canvas-container");
  const viewport = document.getElementById("viewport-container");

  globals.renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: true,
  });
  await globals.renderer.init();
  globals.renderer.setSize(container.clientWidth, container.clientHeight);
  globals.renderer.setPixelRatio(window.devicePixelRatio);
  // Optional, configure tonemapping if needed
  globals.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(globals.renderer.domElement);

  globals.scene = new THREE.Scene();
  globals.scene.background = new THREE.Color("#808080");

  globals.camera = new THREE.PerspectiveCamera(
    35,
    container.clientWidth / container.clientHeight,
    0.1,
    1000,
  );
  globals.camera.position.set(0, 1.4, 3.5);

  globals.controls = new OrbitControls(
    globals.camera,
    globals.renderer.domElement,
  );
  globals.controls.target.set(0, 1.1, 0);
  globals.controls.enableDamping = true;

  globals.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  globals.scene.add(globals.ambientLight);

  globals.dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  globals.dirLight.position.set(1, 2, 3);
  globals.dirLight.castShadow = true;
  globals.scene.add(globals.dirLight);

  globals.gridHelper = new THREE.GridHelper(10, 20, 0x333333, 0x111111);
  globals.scene.add(globals.gridHelper);

  globals.axesHelper = new THREE.AxesHelper(1);
  globals.axesHelper.position.y = 0.01;
  globals.axesHelper.visible = false;
  globals.scene.add(globals.axesHelper);

  // Add the LookAt target to the scene so it interpolates properly in world space
  globals.scene.add(globals.lookAtTarget);

  // Initializations from modules
  setupUIHandlers(globals);
  initAudioLipsync(globals);

  globals.vrmControl = new VRMControl(globals);

  // Setup FK/IK Mode UI Toggle
  const modeButtons = document.querySelectorAll(
    "#kinematics-mode-group button",
  );
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const mode = e.target.dataset.mode;
      // Update active styling
      modeButtons.forEach((b) => {
        b.className =
          "px-3 py-1 bg-[#111] text-zinc-300 font-bold hover:bg-white/10 transition-colors";
      });
      e.target.className =
        "px-3 py-1 bg-blue-600 text-white font-bold transition-colors";

      globals.vrmControl.setMode(mode);
    });
  });

  window.addEventListener("resize", () => {
    if (!container || !viewport) return;
    globals.camera.aspect = viewport.clientWidth / viewport.clientHeight;
    globals.camera.updateProjectionMatrix();
    globals.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  });

  animate();
  globals.log("VRM Engine V2 Initialized Successfully.", "green");
}

function animate() {
  requestAnimationFrame(animate);
  globals.clock.update();
  const delta = globals.clock.getDelta();

  if (globals.currentVRM) {
    if (globals.lookAtTarget && globals.cameraTarget) {
      if (globals.isLookAtEnabled) {
        const elapsedTime = performance.now() / 1000;
        // Add subtle natural drift noise
        const noiseX = Math.sin(elapsedTime * 0.5) * 0.2;
        const noiseY = Math.sin(elapsedTime * 0.7) * 0.1;

        const actualTarget = globals.cameraTarget.clone();
        actualTarget.x += noiseX;
        actualTarget.y += noiseY;

        globals.lookAtTarget.position.lerp(actualTarget, 5.0 * delta);
      } else {
        // Smoothly return eyes to default forward position when LookAt is OFF
        globals.lookAtTarget.position.lerp(
          new THREE.Vector3(0, 1.2, 2.0),
          5.0 * delta,
        );
      }
    }
    if (globals.vrmControl) globals.vrmControl.update();
    globals.currentVRM.update(delta);
    updateAudioLipsync(globals.currentVRM, globals);
    if (globals.autoBlink) globals.autoBlink.update(delta);

    if (globals.springBoneVisualizerRoots) {
      globals.springBoneVisualizerRoots.forEach((root) => {
        if (root.visible) {
          root.children.forEach((helper) => {
            if (helper.update) helper.update();
          });
        }
      });
    }
  }

  if (globals.mixer) {
    globals.mixer.update(delta);
    if (
      globals.currentAction &&
      !globals.currentAction.paused &&
      !globals.isSeeking
    ) {
      const clip = globals.currentAction.getClip();
      if (clip) {
        const time = globals.currentAction.time % clip.duration;
        const prog = (time / clip.duration) * 100;
        document.getElementById("anim-progress").value = prog || 0;
        document.getElementById("anim-time").innerText =
          time.toFixed(1) + "s / " + clip.duration.toFixed(1) + "s";
      }
    }
  }

  globals.controls.update();

  globals.renderer.render(globals.scene, globals.camera);

  globals.fpsFrames++;
  const now = performance.now();
  if (now >= globals.fpsPrevTime + 1000) {
    const currentFps = Math.round(
      (globals.fpsFrames * 1000) / (now - globals.fpsPrevTime),
    );
    document.getElementById("stat-fps").innerText = currentFps;

    // Update history array
    globals.fpsHistory.shift();
    globals.fpsHistory.push(currentFps);

    // Draw Chart
    const canvas = document.getElementById("fps-chart");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      // Handle high-dpi sizing if not already
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.beginPath();
      ctx.strokeStyle = "#4ade80"; // green-400
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";

      const maxFps = 120; // Scale max height
      const step = w / (globals.fpsHistory.length - 1);

      globals.fpsHistory.forEach((val, i) => {
        const x = i * step;
        const normalizedY = h - (Math.min(val, maxFps) / maxFps) * h;
        if (i === 0) ctx.moveTo(x, normalizedY);
        else ctx.lineTo(x, normalizedY);
      });
      ctx.stroke();
    }

    globals.fpsFrames = 0;
    globals.fpsPrevTime = now;
  }

  if (globals.fpsFrames % 30 === 0) {
    if (globals.renderer.info && globals.renderer.info.render) {
      document.getElementById("stat-tris").innerText =
        globals.renderer.info.render.triangles.toLocaleString();
      document.getElementById("stat-calls").innerText =
        globals.renderer.info.render.calls;
      document.getElementById("stat-geom").innerText =
        globals.renderer.info.memory.geometries;
      document.getElementById("stat-tex").innerText =
        globals.renderer.info.memory.textures;
    }
  }
}

window.onload = init;
