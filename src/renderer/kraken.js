'use strict';
/* global h, icon, esc, toast, act, slider, toggle, colorSwatch, Pages, api, App */

/** Bild/GIF laden, zuschneiden, drehen und für das runde Kraken-Display aufbereiten */
const KrakenMedia = {
  MAX_FRAMES: 400,
  async load(file) {
    const buf = await file.arrayBuffer();
    const isGif = /gif/i.test(file.type) || /\.gif$/i.test(file.name);
    if (isGif && 'ImageDecoder' in window) {
      const dec = new ImageDecoder({ data: new Uint8Array(buf), type: 'image/gif' });
      await dec.tracks.ready; await dec.completed;
      const total = dec.tracks.selectedTrack.frameCount;
      const count = Math.min(total, this.MAX_FRAMES);
      const frames = [];
      for (let i = 0; i < count; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        frames.push({ bmp: await createImageBitmap(image), delay: Math.max(20, Math.round((image.duration || 100000) / 1000)) });
        image.close();
      }
      dec.close();
      if (frames.length > 1) return { kind: 'gif', frames, name: file.name, truncated: total > count };
      return { kind: 'image', frames, name: file.name };
    }
    const bmp = await createImageBitmap(new Blob([buf], { type: file.type || 'image/png' }));
    return { kind: 'image', frames: [{ bmp, delay: 0 }], name: file.name };
  },
  /** Zeichnet einen Frame „füllend“ (cover) mit Zoom, Verschiebung und Drehung */
  draw(ctx, bmp, res, o) {
    ctx.save();
    ctx.fillStyle = o.bg || '#000'; ctx.fillRect(0, 0, res, res);
    ctx.translate(res / 2 + (o.x || 0) * res, res / 2 + (o.y || 0) * res);
    ctx.rotate(((o.rotation || 0) * Math.PI) / 2);
    const s = Math.max(res / bmp.width, res / bmp.height) * (o.zoom || 1);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, (-bmp.width * s) / 2, (-bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    ctx.restore();
  },
  rgba(media, res, o) {
    const cv = new OffscreenCanvas(res, res); const ctx = cv.getContext('2d');
    this.draw(ctx, media.frames[0].bmp, res, o);
    return ctx.getImageData(0, 0, res, res).data;
  },
  async gif(media, res, o, progress) {
    const { GIFEncoder, quantize, applyPalette } = window.gifenc;
    const cv = new OffscreenCanvas(res, res); const ctx = cv.getContext('2d', { willReadFrequently: true });
    const enc = GIFEncoder();
    for (let i = 0; i < media.frames.length; i++) {
      this.draw(ctx, media.frames[i].bmp, res, o);
      const px = ctx.getImageData(0, 0, res, res).data;
      const pal = quantize(px, 256);
      enc.writeFrame(applyPalette(px, pal), res, res, { palette: pal, delay: media.frames[i].delay, repeat: 0 });
      if (i % 5 === 0) { progress(i / media.frames.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    enc.finish();
    return enc.bytes();
  },
};

Pages.kraken = {
  title: 'NZXT Kraken', icon: 'droplet', data: null, media: null,
  view: { zoom: 1, x: 0, y: 0, bg: '#000000' },
  async render(root) {
    if (!this.data) this.data = await api('kraken:get');
    const k = this.data;
    this.root = root; this.wasConnected = k.connected;
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'NZXT Kraken'), h('p', 'Display, Pumpe und Lüfter deiner Kraken-Wasserkühlung – direkt, ohne NZXT CAM.')]),
      h('div.spacer'),
      k.connected ? h('div.chips', [h('span.chip', [h('b', esc(k.model)), '']), h('span.chip', ['Firmware ', h('b', esc(k.fw || '?'))]), h('span.pill.ok', 'Verbunden')]) : h('span.pill.idle', 'Nicht verbunden'),
    ]));
    if (!k.connected) {
      root.appendChild(h('div.card.empty', [
        h('div.big', { html: icon('droplet') }),
        h('h2', k.probe && k.probe.interfaces.length ? 'Kraken gefunden, aber keine Verbindung' : 'Keine Kraken gefunden'),
        h('p', { html: (k.error ? `<span style="color:var(--err)">${esc(k.error)}</span><br><br>` : '') + 'Unterstützt: Kraken X53/X63/X73 (Pumpe), Kraken Z53/Z63/Z73, Kraken 2023, 2023 Elite, 2024 Elite RGB und 2024 Plus (Pumpe, Lüfter und Display).<br><br>1. Prüfen, ob das interne USB-Kabel der Kraken am Mainboard steckt.<br>2. <b>NZXT CAM beenden</b> (auch im Infobereich) – es blockiert die Kraken.<br>AleRGB verbindet sich automatisch, sobald die Kraken frei ist.' }),
        h('div.row', { style: { justifyContent: 'center' } }, [h('button.btn.primary', { onclick: () => act(() => api('kraken:retry'), 'Verbinde erneut …'), html: icon('refresh') + 'Erneut verbinden' })]),
      ]));
      root.appendChild(this.diagCard(k));
      return;
    }
    this.stats = h('div.kstats');
    const grid = h('div.kgrid', [k.lcd ? this.displayCard(k) : null, h('div', [this.stats, ...k.channels.map((ch) => this.speedCard(ch, k))])]);
    root.appendChild(grid);
    root.appendChild(this.diagCard(k));
    this.update();
  },

  /** Zeigt, welche USB-Schnittstellen gefunden wurden und wie sie reagiert haben */
  diagCard(k) {
    const p = k.probe;
    if (!p) return h('div');
    const text = JSON.stringify(p, null, 2);
    const rows = (p.attempts || []).map((a) => `<tr><td>${esc(a.path)}</td><td>${esc(a.usagePage)}</td><td>${esc(a.mode)}</td><td>${esc(a.result || '')}</td><td>${esc((a.received || []).join(', ') || '–')}</td></tr>`).join('');
    return h('details.card.pad', { style: { marginTop: '16px' }, open: !k.connected }, [
      h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, `Diagnose · ${p.interfaces.length} USB-Schnittstelle(n) gefunden`),
      h('div', { style: { overflowX: 'auto', marginTop: '12px' }, html: `<table class="ktable"><tr><th>Schnittstelle</th><th>Usage-Page</th><th>Modus</th><th>Ergebnis</th><th>Empfangen</th></tr>${rows}</table>` }),
      h('div.row', { style: { marginTop: '12px' } }, [h('button.btn.sm', { onclick: () => { navigator.clipboard.writeText(text); toast('Diagnose kopiert – füge sie in den Chat ein', 'ok'); }, html: icon('copy') + 'Diagnose kopieren' })]),
    ]);
  },

  // ---------------- Display ----------------
  displayCard(k) {
    const res = k.lcd.res;
    this.preview = h('canvas.klcd', { width: 360, height: 360 });
    const file = h('input', { type: 'file', accept: 'image/gif,image/png,image/jpeg,image/webp,image/bmp', style: { display: 'none' }, onchange: () => file.files[0] && this.loadFile(file.files[0]) });
    const drop = h('div.kdrop', { ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) this.loadFile(f); } }, [this.preview]);
    const v = this.view;
    const sl = (key, label, min, max, step, fmt) => { const val = h('b', fmt(v[key])); const s = slider({ min, max, step, value: v[key] }); s.addEventListener('input', () => { v[key] = Number(s.value); val.textContent = fmt(v[key]); }); return h('div.param', [h('label.pl', [label, val]), s]); };
    this.progress = h('span.small.muted');
    this.mediaInfo = h('div.small.muted', { style: { textAlign: 'center', minHeight: '18px' } }, this.media ? this.mediaLabel() : 'Noch kein Bild gewählt – die Vorschau zeigt die Temperatur-Anzeige.');
    const bright = slider({ min: 0, max: 100, value: k.lcd.brightness ?? 50 }); const bv = h('b', (k.lcd.brightness ?? 50) + ' %');
    bright.addEventListener('input', () => (bv.textContent = bright.value + ' %'));
    bright.addEventListener('change', () => act(() => api('kraken:brightness', Number(bright.value))));
    const rot = h('div.tabs', [0, 90, 180, 270].map((d) => h('button' + (k.lcd.orientation * 90 === d ? '.active' : ''), { onclick: () => act(() => api('kraken:orientation', d), `Display auf ${d}° gedreht`) }, d + '°')));
    this.uploadBtn = h('button.btn.primary', { disabled: !this.media, onclick: () => this.upload(), html: icon('upload') + 'Aufs Display übertragen' });
    const card = h('div.card.pad.kdisplay', [
      h('div.row', [h('h2.grow', { style: { margin: 0 } }, `Display · ${res}×${res}`), h('button.btn.sm', { onclick: () => act(() => api('kraken:liquid'), 'Temperatur-Anzeige aktiv'), html: icon('droplet') + 'Temperatur-Anzeige' })]),
      drop, this.mediaInfo,
      h('div.row', { style: { justifyContent: 'center' } }, [h('button.btn', { onclick: () => file.click(), html: icon('folder') + 'Bild oder GIF wählen' }), this.uploadBtn, file]),
      this.progress,
      k.lcd.gif ? null : h('div.note.warn', [h('span', { html: icon('alert') }), h('div', 'Die Firmware 2.x der Kraken 2023 unterstützt keine GIFs – Standbilder funktionieren.')]),
      h('details', { open: !!this.media }, [h('summary', 'Zuschnitt anpassen'), h('div.params', { style: { marginTop: '12px' } }, [
        sl('zoom', 'Zoom', 1, 4, 0.01, (x) => Math.round(x * 100) + ' %'), sl('x', 'Verschieben ↔', -0.5, 0.5, 0.005, (x) => Math.round(x * 100)), sl('y', 'Verschieben ↕', -0.5, 0.5, 0.005, (x) => Math.round(x * 100)),
        h('div.param.inline', [h('label.pl', 'Hintergrund'), colorSwatch(v.bg, (c) => (v.bg = c))]),
      ])]),
      h('div.param', [h('label.pl', ['Display-Helligkeit', bv]), bright]),
      h('div.param', [h('label.pl', 'Ausrichtung (je nach Einbaulage)'), rot]),
    ]);
    this.animate();
    return card;
  },
  mediaLabel() { const m = this.media; return `${esc(m.name)} · ${m.kind === 'gif' ? m.frames.length + ' Frames' + (m.truncated ? ` (auf ${KrakenMedia.MAX_FRAMES} gekürzt)` : '') : 'Standbild'}`; },
  async loadFile(f) {
    try {
      this.mediaInfo.textContent = 'Lade …';
      this.media = await KrakenMedia.load(f);
      if (this.media.kind === 'gif' && !this.data.lcd.gif) { toast('Diese Firmware kann keine GIFs anzeigen – es wird der erste Frame als Bild übertragen.', 'error'); this.media = { ...this.media, kind: 'image', frames: [this.media.frames[0]] }; }
      Object.assign(this.view, { zoom: 1, x: 0, y: 0 });
      App.rerender();
    } catch (e) { toast('Datei konnte nicht gelesen werden: ' + e.message, 'error'); this.mediaInfo.textContent = ''; }
  },
  async upload() {
    const k = this.data, res = k.lcd.res, m = this.media;
    // Bild wird wie bei NZXT CAM passend zur eingestellten Ausrichtung gedreht
    const o = { ...this.view, rotation: k.lcd.orientation };
    this.uploadBtn.disabled = true;
    try {
      if (m.kind === 'gif') {
        const bytes = await KrakenMedia.gif(m, res, o, (p) => (this.progress.textContent = `GIF wird vorbereitet … ${Math.round(p * 100)} %`));
        this.progress.textContent = `Übertrage ${(bytes.length / 1e6).toFixed(1)} MB …`;
        await act(() => api('kraken:upload', 'gif', bytes, m.name), 'GIF ist jetzt auf deinem Display');
      } else {
        this.progress.textContent = 'Übertrage Bild …';
        await act(() => api('kraken:upload', 'image', new Uint8Array(KrakenMedia.rgba(m, res, o)), m.name), 'Bild ist jetzt auf deinem Display');
      }
    } catch {} finally { this.progress.textContent = ''; if (this.uploadBtn) this.uploadBtn.disabled = false; }
  },
  animate() {
    const cv = this.preview; const ctx = cv.getContext('2d'); let fi = 0, next = 0;
    const loop = (ts) => {
      if (!cv.isConnected) return;
      requestAnimationFrame(loop);
      const R = cv.width; const m = this.media;
      ctx.clearRect(0, 0, R, R);
      ctx.save(); ctx.beginPath(); ctx.arc(R / 2, R / 2, R / 2 - 14, 0, Math.PI * 2); ctx.clip();
      if (m) {
        if (m.kind === 'gif' && ts >= next) { fi = (fi + 1) % m.frames.length; next = ts + m.frames[fi].delay; }
        const f = m.frames[m.kind === 'gif' ? fi : 0];
        ctx.translate(14, 14); KrakenMedia.draw(ctx, f.bmp, R - 28, this.view);
      } else {
        const st = this.data && this.data.status;
        const g = ctx.createRadialGradient(R / 2, R / 2, 10, R / 2, R / 2, R / 2); g.addColorStop(0, '#1d1b3a'); g.addColorStop(1, '#05040d');
        ctx.fillStyle = g; ctx.fillRect(0, 0, R, R);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '600 64px "Segoe UI", sans-serif';
        ctx.fillText(st ? st.temp.toFixed(0) + '°' : '--', R / 2, R / 2 + 18);
        ctx.font = '15px "Segoe UI", sans-serif'; ctx.fillStyle = '#9396b0'; ctx.fillText('FLÜSSIGKEIT', R / 2, R / 2 + 50);
      }
      ctx.restore();
      ctx.lineWidth = 10; const ring = ctx.createConicGradient(ts / 2000, R / 2, R / 2); ['#8b5cf6', '#ec4899', '#22d3ee', '#8b5cf6'].forEach((c, i) => ring.addColorStop(i / 3, c));
      ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(R / 2, R / 2, R / 2 - 7, 0, Math.PI * 2); ctx.stroke();
    };
    requestAnimationFrame(loop);
  },

  // ---------------- Pumpe & Lüfter ----------------
  speedCard(ch, k) {
    const cfg = k.settings[ch];
    const label = ch === 'pump' ? 'Pumpe' : 'Radiator-Lüfter';
    const chart = h('div.kchart');
    const duty = slider({ min: ch === 'pump' ? 20 : 0, max: 100, value: cfg.duty }); const dv = h('b', cfg.duty + ' %');
    duty.addEventListener('input', () => (dv.textContent = duty.value + ' %'));
    duty.addEventListener('change', () => act(() => api('kraken:speed', ch, { mode: 'fixed', duty: Number(duty.value) })));
    const fixedRow = h('div.param', { style: { display: cfg.mode === 'fixed' ? '' : 'none' } }, [h('label.pl', ['Feste Leistung', dv]), duty]);
    const opts = [...Object.entries(k.presets).map(([id, p]) => ({ id, label: p.label })), { id: 'fixed', label: 'Fest' }];
    const sel = cfg.mode === 'fixed' ? 'fixed' : cfg.preset;
    const tabs = h('div.tabs', opts.map((o) => h('button' + (o.id === sel ? '.active' : ''), { onclick: () => act(() => api('kraken:speed', ch, o.id === 'fixed' ? { mode: 'fixed', duty: Number(duty.value) } : { mode: 'preset', preset: o.id }), `${label}: ${o.label}`).then(() => App.rerender()) }, o.label)));
    chart.innerHTML = this.curveSvg(cfg.mode === 'fixed' ? [[20, cfg.duty], [58, cfg.duty], [59, 100]] : k.presets[cfg.preset][ch]);
    return h('div.card.pad', { style: { marginTop: '16px' } }, [h('h2', label), tabs, chart, fixedRow, h('p.small.muted', { style: { margin: '8px 0 0' } }, 'Die Kurve richtet sich nach der Flüssigkeitstemperatur. Ab 59 °C läuft der Kanal aus Sicherheitsgründen immer mit 100 %.')]);
  },
  curveSvg(points) {
    const W = 360, H = 110, x = (t) => ((t - 20) / 40) * W, y = (d) => H - (d / 100) * H;
    const pts = [...points].sort((a, b) => a[0] - b[0]);
    const full = [[20, pts[0][1]], ...pts, [60, 100]];
    const d = full.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
    const grid = [25, 50, 75].map((v) => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/>`).join('');
    const labels = [20, 30, 40, 50, 60].map((t) => `<text x="${Math.min(W - 14, x(t) + 2)}" y="${H - 4}" fill="#63667f" font-size="10">${t}°</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:110px;margin-top:14px">${grid}<path d="${d} L${W},${H} L0,${H} Z" fill="url(#kg)" opacity=".35"/><path d="${d}" fill="none" stroke="#a78bfa" stroke-width="2.5"/>${labels}<defs><linearGradient id="kg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs></svg>`;
  },

  update() {
    const k = this.data;
    if (!this.root || !this.root.isConnected) return;
    if (k.connected !== this.wasConnected) return App.rerender();
    if (!this.stats || !k.status) return;
    const s = k.status;
    const tile = (label, val, sub) => h('div.card.kstat', [h('div.small.muted', label), h('div.kval', val), sub ? h('div.small.muted', sub) : null]);
    this.stats.innerHTML = '';
    this.stats.append(
      tile('Flüssigkeit', s.temp.toFixed(1) + ' °C', 'Kühlmitteltemperatur'),
      tile('Pumpe', String(s.pumpRpm), `U/min · ${s.pumpDuty} %`),
      s.fanRpm !== undefined ? tile('Lüfter', String(s.fanRpm), `U/min · ${s.fanDuty} %`) : null,
    );
    if (k.busy && this.progress && !this.progress.textContent) this.progress.textContent = 'Übertrage …';
  },
};
