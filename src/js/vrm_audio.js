export function initAudioLipsync(globals) {
    const toggle = document.getElementById('mic-toggle');
    const label = document.getElementById('mic-label');
    
    toggle.onclick = async () => {
        if (!globals.audioCtx) {
            try {
                globals.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                globals.analyser = globals.audioCtx.createAnalyser();
                globals.analyser.fftSize = 256;
                globals.analyser.smoothingTimeConstant = 0.5;
                globals.dataArray = new Uint8Array(globals.analyser.frequencyBinCount);
                
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const source = globals.audioCtx.createMediaStreamSource(stream);
                source.connect(globals.analyser);
                
                label.innerText = '麦克风已启用 (点击关闭)';
                toggle.classList.replace('bg-zinc-800', 'bg-blue-600');
                globals.log('Microphone engaged for Lip-sync', 'green');
            } catch (e) {
                globals.log('Mic error: ' + e.message, 'red');
            }
        } else {
            if (globals.audioCtx.state === 'running') {
                globals.audioCtx.suspend();
                label.innerText = '已暂停麦克风';
                toggle.classList.replace('bg-blue-600', 'bg-zinc-800');
            } else {
                globals.audioCtx.resume();
                label.innerText = '麦克风已启用 (点击关闭)';
                toggle.classList.replace('bg-zinc-800', 'bg-blue-600');
            }
        }
    };
}

export function updateAudioLipsync(vrm, globals) {
    if (!vrm || !vrm.expressionManager || !globals.analyser || globals.audioCtx.state !== 'running') return;
    
    globals.analyser.getByteFrequencyData(globals.dataArray);
    
    let sumAa = 0, sumIh = 0, sumOu = 0;
    
    // Low, Mid, High freq ranges rough mapping
    for(let i=0; i<30; i++) sumAa += globals.dataArray[i]; 
    for(let i=30; i<80; i++) sumIh += globals.dataArray[i]; 
    for(let i=80; i<128; i++) sumOu += globals.dataArray[i]; 
    
    const vol = (sumAa + sumIh + sumOu) / (128 * 255);
    const em = vrm.expressionManager;
    
    if(vol < 0.05) {
        em.setValue('aa', 0);
        em.setValue('ih', 0);
        em.setValue('ou', 0);
        em.setValue('ee', 0);
        em.setValue('oh', 0);
        return;
    }
    
    const maxVal = Math.max(sumAa, sumIh, sumOu);
    const weight = Math.min(vol * 5, 1.0);
    
    em.setValue('aa', sumAa === maxVal ? weight : 0);
    em.setValue('ih', sumIh === maxVal ? weight : 0);
    em.setValue('ou', sumOu === maxVal ? weight : 0);
    em.setValue('ee', 0);
    em.setValue('oh', 0);
}
