'use strict';
/**
 * Audio- und Bildschirmerfassung für reaktive Effekte.
 * System-Audio: Windows-Loopback über getDisplayMedia; Fallback: Mikrofon.
 */
const Capture = (() => {
  let audio = null, screen = null, wantAudio = false, wantScreen = false, source = 'system';
  const state = { audioOk: false, screenOk: false, audioErr: '', screenErr: '' };
  let smoothing = 0.5;

  async function startAudio() {
    if (audio) return;
    try {
      let stream = null;
      if (source === 'system') {
        try {
          const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          s.getVideoTracks().forEach((t) => t.stop());
          if (s.getAudioTracks().length) stream = new MediaStream(s.getAudioTracks());
        } catch {}
      }
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.6;
      src.connect(an);
      const fbuf = new Uint8Array(an.frequencyBinCount), tbuf = new Float32Array(an.fftSize);
      const NB = 24; let peak = 0.2; let bassPeak = 0.2;
      const binHz = ctx.sampleRate / an.fftSize;
      const timer = setInterval(() => {
        an.getByteFrequencyData(fbuf); an.getFloatTimeDomainData(tbuf);
        let rms = 0; for (let i = 0; i < tbuf.length; i++) rms += tbuf[i] * tbuf[i]; rms = Math.sqrt(rms / tbuf.length);
        // 200 logarithmische Frequenz-Bins (0..255), kompatibel zu engine.audio.freq
        const freq = new Array(200); const bands = new Array(NB).fill(0);
        const lo = Math.log(30), hi = Math.log(16000);
        for (let i = 0; i < 200; i++) { const f = Math.exp(lo + (hi - lo) * (i / 199)); freq[i] = fbuf[Math.min(fbuf.length - 1, Math.round(f / binHz))]; }
        for (let b = 0; b < NB; b++) { const a = Math.floor((b / NB) * 200), e = Math.floor(((b + 1) / NB) * 200); let m = 0; for (let i = a; i < e; i++) m = Math.max(m, freq[i]); bands[b] = m / 255; }
        let mx = 0; for (const v of bands) mx = Math.max(mx, v); peak = Math.max(mx, peak * 0.995, 0.15);
        for (let b = 0; b < NB; b++) bands[b] = Math.min(1, bands[b] / peak);
        let bass = 0; const bEnd = Math.round(150 / binHz); for (let i = 1; i <= bEnd; i++) bass = Math.max(bass, fbuf[i] / 255);
        bassPeak = Math.max(bass, bassPeak * 0.995, 0.15);
        const bassN = Math.pow(Math.min(1, bass / bassPeak), 2);
        let dens = 0; for (const v of freq) if (v > 40) dens++;
        const data = { bands, bass: bassN, level: Math.min(1, rms * 4), db: Math.max(-100, 20 * Math.log10(rms + 1e-6)), density: dens / 200, freq };
        window.spectra.sendAudio(data);
        Capture.lastAudio = data;
      }, 33);
      audio = { stream, ctx, timer };
      state.audioOk = true; state.audioErr = '';
    } catch (e) { state.audioOk = false; state.audioErr = e.message; }
  }
  function stopAudio() { if (!audio) return; clearInterval(audio.timer); audio.stream.getTracks().forEach((t) => t.stop()); audio.ctx.close(); audio = null; state.audioOk = false; window.spectra.sendAudio(null); }

  async function startScreen() {
    if (screen) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const video = document.createElement('video'); video.srcObject = stream; video.muted = true; await video.play();
      const W = 32, H = 18; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true });
      let acc = null;
      const timer = setInterval(() => {
        if (!video.videoWidth) return;
        cx.drawImage(video, 0, 0, W, H);
        const px = cx.getImageData(0, 0, W, H).data;
        const out = new Uint8Array(W * H * 3); if (!acc) acc = new Float32Array(W * H * 3);
        const k = 1 - smoothing * 0.85; let ar = 0, ag = 0, ab = 0;
        for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
          for (let c = 0; c < 3; c++) { acc[j + c] += (px[i + c] - acc[j + c]) * k; out[j + c] = acc[j + c]; }
          ar += out[j]; ag += out[j + 1]; ab += out[j + 2];
        }
        const n = W * H;
        window.spectra.sendScreen({ w: W, h: H, data: out, avg: [ar / n, ag / n, ab / n] });
      }, 40);
      screen = { stream, timer }; state.screenOk = true; state.screenErr = '';
    } catch (e) { state.screenOk = false; state.screenErr = e.message; }
  }
  function stopScreen() { if (!screen) return; clearInterval(screen.timer); screen.stream.getTracks().forEach((t) => t.stop()); screen = null; state.screenOk = false; window.spectra.sendScreen(null); }

  function sync(requirements, settings) {
    const newSource = settings.audioSource || 'system';
    smoothing = settings.screenSmoothing ?? 0.5;
    if (newSource !== source) { source = newSource; stopAudio(); }
    wantAudio = requirements.includes('audio'); wantScreen = requirements.includes('screen');
    if (wantAudio) startAudio(); else stopAudio();
    if (wantScreen) startScreen(); else stopScreen();
  }
  return { sync, state, lastAudio: null };
})();
