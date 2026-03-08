export function initAudioLipsync(globals) {
  const toggle = document.getElementById("mic-toggle");
  const label = document.getElementById("mic-label");

  toggle.onclick = async () => {
    if (!globals.audioCtx) {
      try {
        globals.audioCtx = new (
          window.AudioContext || window.webkitAudioContext
        )();
        globals.analyser = globals.audioCtx.createAnalyser();
        globals.analyser.fftSize = 2048; // ChatVRM default
        globals.timeDomainData = new Float32Array(globals.analyser.fftSize);

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const source = globals.audioCtx.createMediaStreamSource(stream);
        source.connect(globals.analyser);

        label.innerText = "Mic Enabled (Click to Disable)";
        toggle.classList.replace("bg-zinc-800", "bg-blue-600");
        globals.log("Microphone engaged for Lip-sync", "green");
      } catch (e) {
        globals.log("Mic error: " + e.message, "red");
      }
    } else {
      if (globals.audioCtx.state === "running") {
        globals.audioCtx.suspend();
        label.innerText = "Mic Paused";
        toggle.classList.replace("bg-blue-600", "bg-zinc-800");
      } else {
        globals.audioCtx.resume();
        label.innerText = "Mic Enabled (Click to Disable)";
        toggle.classList.replace("bg-zinc-800", "bg-blue-600");
      }
    }
  };
}

export function updateAudioLipsync(vrm, globals) {
  if (
    !vrm ||
    !vrm.expressionManager ||
    !globals.analyser ||
    globals.audioCtx.state !== "running"
  )
    return;

  globals.analyser.getFloatTimeDomainData(globals.timeDomainData);

  let volume = 0.0;
  for (let i = 0; i < globals.analyser.fftSize; i++) {
    volume = Math.max(volume, Math.abs(globals.timeDomainData[i]));
  }

  // ChatVRM cook logic
  volume = 1 / (1 + Math.exp(-45 * volume + 5));
  if (volume < 0.1) volume = 0;

  const em = vrm.expressionManager;

  // ChatVRM essentially only drives the 'aa' blendshape based on volume
  em.setValue("aa", volume * 0.75); // Slightly scaled down so it's not always 100% open
  em.setValue("ih", 0);
  em.setValue("ou", 0);
  em.setValue("ee", 0);
  em.setValue("oh", 0);
}
