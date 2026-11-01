'use strict';
/* global h, icon, esc, toast, act, modal, slider, toggle, paramControls, SpectraEffects, App, Pages, api, throttle */

const TEMPLATES = {
  basic: { label: 'Grundgerüst (Farbwelle)', code: `<!DOCTYPE html>
<html>
<head>
  <title>Mein Effekt</title>
  <meta description="Eine sanfte Farbwelle – Vorlage für eigene Effekte">
  <meta publisher="Ich">
  <!-- Jede <meta property> wird zu einer Einstellung in AleRGB und zu einer globalen Variable -->
  <meta property="speed" label="Geschwindigkeit" type="number" min="1" max="20" default="6">
  <meta property="color1" label="Farbe 1" type="color" default="#ff00aa">
  <meta property="color2" label="Farbe 2" type="color" default="#00d5ff">
  <meta property="stripes" label="Streifen" type="boolean" default="1">
</head>
<body style="margin:0;background:#000">
  <canvas id="exCanvas" width="320" height="200"></canvas>
  <script>
    const c = document.getElementById('exCanvas');
    const ctx = c.getContext('2d');
    let t = 0;

    function frame() {
      t += speed / 600;
      const g = ctx.createLinearGradient(0, 0, 320, 0);
      const shift = (Math.sin(t * 2) + 1) / 2;
      g.addColorStop(0, color1);
      g.addColorStop(shift * 0.8 + 0.1, color2);
      g.addColorStop(1, color1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 320, 200);
      if (stripes) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let x = -40; x < 360; x += 40) ctx.fillRect((x + t * 120) % 360 - 20, 0, 12, 200);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Optional: wird aufgerufen, wenn sich die Einstellung "speed" ändert
    function onspeedChanged() { console.log('Neue Geschwindigkeit', speed); }
  </script>
</body>
</html>` },
  audio: { label: 'Audio-reaktiv (Kreis)', code: `<!DOCTYPE html>
<html>
<head>
  <title>Audio-Kreis</title>
  <meta description="Ein pulsierender Kreis, der auf Musik reagiert">
  <meta property="hueSpeed" label="Farbrotation" type="number" min="0" max="10" default="3">
  <meta property="gain" label="Verstärkung" type="number" min="1" max="10" default="4">
</head>
<body style="margin:0;background:#000">
  <canvas id="exCanvas" width="320" height="200"></canvas>
  <script>
    const ctx = document.getElementById('exCanvas').getContext('2d');
    let hue = 0;
    function frame() {
      // engine.audio.freq: 200 Werte (0..255), Bass links. engine.audio.level: Pegel in dB (-100..0)
      const f = engine.audio.freq;
      let bass = 0; for (let i = 0; i < 20; i++) bass += f[i]; bass /= 20 * 255;
      hue = (hue + hueSpeed * 0.3) % 360;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, 320, 200);
      const r = 20 + Math.min(1, bass * gain / 2) * 140;
      const g = ctx.createRadialGradient(160, 100, 0, 160, 100, r);
      g.addColorStop(0, 'hsl(' + hue + ',100%,60%)');
      g.addColorStop(1, 'hsla(' + (hue + 80) + ',100%,50%,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(160, 100, r, 0, Math.PI * 2); ctx.fill();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  </script>
</body>
</html>` },
  particles: { label: 'Partikel (Feuerwerk)', code: `<!DOCTYPE html>
<html>
<head>
  <title>Feuerwerk</title>
  <meta description="Zufällige Feuerwerks-Explosionen">
  <meta property="rate" label="Häufigkeit" type="number" min="1" max="20" default="6">
  <meta property="palette" label="Palette" type="combobox" values="Regenbogen,Gold,Eis" default="Regenbogen">
</head>
<body style="margin:0;background:#000">
  <canvas id="exCanvas" width="320" height="200"></canvas>
  <script>
    const ctx = document.getElementById('exCanvas').getContext('2d');
    const parts = [];
    function color() {
      if (palette === 'Gold') return 'hsl(' + (35 + Math.random() * 20) + ',100%,60%)';
      if (palette === 'Eis') return 'hsl(' + (180 + Math.random() * 40) + ',100%,70%)';
      return 'hsl(' + Math.random() * 360 + ',100%,60%)';
    }
    function boom() {
      const x = Math.random() * 320, y = Math.random() * 200, col = color();
      for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, s = Math.random() * 3 + 0.5;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, col }); }
    }
    function frame() {
      if (Math.random() < rate / 200) boom();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, 320, 200);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life -= 0.012;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.col; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  </script>
</body>
</html>` },
};

Pages.studio = {
  title: 'Effekt-Studio', icon: 'wand', tab: 'builder',
  builder: { key: null, name: 'Mein Effekt', layers: [{ id: 'aurora', params: {}, blend: 'normal', opacity: 1, enabled: true }, { id: 'starfield', params: { bg: '#000000' }, blend: 'add', opacity: 0.8, enabled: true }] },
  code: { key: null, name: 'Mein Effekt', html: TEMPLATES.basic.code, params: [], props: {} },
  open(tab, data) {
    this.tab = tab;
    if (data && tab === 'builder') this.builder = { key: data.key || null, name: data.name || 'Mein Effekt', layers: data.layers.map((l) => ({ enabled: true, blend: 'normal', opacity: 1, ...l })) };
    if (data && tab === 'code') this.code = { key: data.key || null, name: data.name || 'Mein Effekt', html: data.html, params: [], props: {} };
    if (!data && tab === 'code') this.code = { key: null, name: 'Mein Effekt', html: TEMPLATES.basic.code, params: [], props: {} };
  },
  leave() { api('fx:endPreview'); },
  render(root) {
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Effekt-Studio'), h('p', 'Baue eigene Effekte – per Baukasten ohne Code oder als HTML/JavaScript-Canvas.')]),
      h('div.spacer'),
      h('div.tabs', [
        h('button' + (this.tab === 'builder' ? '.active' : ''), { onclick: () => { this.tab = 'builder'; App.rerender(); }, html: 'Ebenen-Baukasten' }),
        h('button' + (this.tab === 'code' ? '.active' : ''), { onclick: () => { this.tab = 'code'; App.rerender(); }, html: 'Code-Editor' }),
      ]),
    ]));
    this.big = h('canvas.preview', { width: 64, height: 36 });
    const stage = h('div.fx-stage', [h('div.preview-wrap', [this.big, h('div.ptitle', [h('b', 'Live-Vorschau'), h('span.small', 'läuft auch auf deinen Geräten')])])]);
    if (this.tab === 'builder') this.renderBuilder(root, stage); else this.renderCode(root, stage);
  },

  // ---------------- Baukasten ----------------
  renderBuilder(root, stage) {
    const B = this.builder;
    const push = throttle(() => api('fx:previewLayers', { type: 'layers', layers: B.layers }), 80);
    push();
    const list = h('div');
    const effOpts = SpectraEffects.EFFECTS;
    const drawLayers = () => {
      list.innerHTML = '';
      B.layers.forEach((L, i) => {
        const e = SpectraEffects.BY_ID[L.id];
        const op = slider({ min: 0, max: 1, step: 0.01, value: L.opacity }); const opv = h('b', Math.round(L.opacity * 100) + '%');
        op.addEventListener('input', () => { L.opacity = Number(op.value); opv.textContent = Math.round(L.opacity * 100) + '%'; push(); });
        const m = L.mask || { x0: 0, x1: 1, y0: 0, y1: 1 };
        const maskSl = (k, label) => { const s = slider({ min: 0, max: 1, step: 0.01, value: m[k] }); s.addEventListener('input', () => { L.mask = { ...m, [k]: Number(s.value) }; Object.assign(m, L.mask); push(); }); return h('div.param', [h('label.pl', label), s]); };
        list.appendChild(h('div.card.layer' + (L.enabled === false ? '.disabled' : ''), { style: { borderLeftColor: `hsl(${(i * 67 + 260) % 360},80%,65%)` } }, [
          h('div.lh', [
            h('span.small.muted', '#' + (B.layers.length - i)),
            h('select', { onchange: (ev) => { L.id = ev.target.value; L.params = {}; drawLayers(); push(); } }, ['Basis', 'Natur', 'Psychedelisch', 'Animation', 'Audio', 'Ambilight', 'System'].map((cat) => h('optgroup', { label: cat }, effOpts.filter((x) => x.category === cat).map((x) => h('option', { value: x.id, selected: x.id === L.id }, esc(x.name)))))),
            toggle(L.enabled !== false, (v) => { L.enabled = v; drawLayers(); push(); }),
            h('button.btn.sm.ghost', { title: 'Nach oben', disabled: i === 0, onclick: () => { B.layers.splice(i - 1, 0, B.layers.splice(i, 1)[0]); drawLayers(); push(); }, html: icon('up') }),
            h('button.btn.sm.ghost', { title: 'Nach unten', disabled: i === B.layers.length - 1, onclick: () => { B.layers.splice(i + 1, 0, B.layers.splice(i, 1)[0]); drawLayers(); push(); }, html: icon('down') }),
            h('button.btn.sm.ghost.danger', { title: 'Ebene löschen', disabled: B.layers.length === 1, onclick: () => { B.layers.splice(i, 1); drawLayers(); push(); }, html: icon('trash') }),
          ]),
          h('div.lgrid', [
            h('div.param', [h('label.pl', 'Mischmodus'), h('select', { onchange: (ev) => { L.blend = ev.target.value; push(); } }, SpectraEffects.BLEND_MODES.map((b) => h('option', { value: b.value, selected: b.value === L.blend }, b.label)))]),
            h('div.param', [h('label.pl', ['Deckkraft', opv]), op]),
          ]),
          h('details', [h('summary', 'Effekt-Einstellungen'), paramControls(e.params, L.params, (k, v) => { L.params[k] = v; push(); })]),
          h('details', [h('summary', 'Bereich begrenzen (Maske)'), h('div.lgrid', [maskSl('x0', 'Links'), maskSl('x1', 'Rechts'), maskSl('y0', 'Oben'), maskSl('y1', 'Unten')])]),
        ]));
      });
    };
    drawLayers();
    const name = h('input', { type: 'text', value: B.name, oninput: () => (B.name = name.value) });
    root.appendChild(h('div.studio', [
      h('div', [
        h('div.card.pad', { style: { marginBottom: '14px' } }, [h('div.row', [h('div.grow', [h('label.small.muted', 'Name'), name]),
          h('button.btn', { style: { marginTop: '18px' }, onclick: () => { B.layers.unshift({ id: 'starfield', params: {}, blend: 'add', opacity: 1, enabled: true }); drawLayers(); push(); }, html: icon('plus') + 'Ebene' }),
          h('button.btn.primary', { style: { marginTop: '18px' }, onclick: () => act(() => api('fx:saveLayers', { type: 'layers', name: B.name, layers: B.layers }, B.key), 'Effekt gespeichert & aktiviert').then((k) => (B.key = k)), html: icon('save') + 'Speichern' })]),
          h('p.small.muted', { style: { margin: '10px 0 0' } }, 'Oberste Ebene liegt oben. Tipp: „Sternenhimmel“ mit Mischmodus „Addieren“ über „Polarlicht“ legen, oder „Bass-Puls“ mit „Multiplizieren“ über einen Farbverlauf.')]),
        list,
      ]),
      stage,
    ]));
  },

  // ---------------- Code-Editor ----------------
  renderCode(root, stage) {
    const C = this.code;
    const ta = h('textarea', { spellcheck: false, value: C.html });
    const gutter = h('div.gutter');
    const lines = () => { const n = ta.value.split('\n').length; gutter.innerHTML = Array.from({ length: n }, (_, i) => i + 1).join('<br>'); };
    ta.addEventListener('input', () => { C.html = ta.value; lines(); });
    ta.addEventListener('scroll', () => (gutter.scrollTop = ta.scrollTop));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); C.html = ta.value; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    });
    lines();
    this.consoleBox = h('div.console');
    const paramBox = h('div');
    const run = async () => {
      this.consoleBox.textContent = '';
      try {
        const params = await api('fx:previewCode', C.html, C.props);
        C.params = params;
        paramBox.innerHTML = '';
        paramBox.appendChild(paramControls(params, C.props, (k, v) => { C.props[k] = v; throttledRun(); }));
      } catch (e) { this.consoleBox.textContent = e.message; }
    };
    const throttledRun = throttle(() => api('fx:previewCode', C.html, C.props), 150);
    const save = () => act(() => api('fx:saveCode', C.key, C.name, C.html), 'Effekt gespeichert & aktiviert').then((k) => (C.key = k));
    const name = h('input', { type: 'text', value: C.name, oninput: () => (C.name = name.value) });
    const tpl = h('select', { style: { width: '220px' }, onchange: async () => { if (!tpl.value) return; if (await modal({ title: 'Vorlage laden?', text: 'Der aktuelle Code wird ersetzt.', okLabel: 'Laden' })) { C.html = TEMPLATES[tpl.value].code; C.props = {}; ta.value = C.html; lines(); run(); } tpl.value = ''; } },
      [h('option', { value: '' }, 'Vorlage laden …'), ...Object.entries(TEMPLATES).map(([k, t]) => h('option', { value: k }, esc(t.label)))]);
    root.appendChild(h('div.studio', [
      h('div', [
        h('div.row', { style: { marginBottom: '12px', flexWrap: 'nowrap' } }, [h('div.grow', [name]), tpl,
          h('button.btn', { onclick: run, title: 'Strg+Enter', html: icon('play') + 'Ausführen' }),
          h('button.btn.primary', { onclick: save, title: 'Strg+S', html: icon('save') + 'Speichern' })]),
        h('div.code-wrap', [gutter, ta]),
        this.consoleBox,
      ]),
      h('div', [stage,
        h('div.card.pad', { style: { marginTop: '16px' } }, [h('h2', 'Einstellungen (aus &lt;meta property&gt;)'), paramBox]),
        h('div.card.pad', { style: { marginTop: '16px' } }, [h('h2', 'So funktionieren Canvas-Effekte'), h('div.small.muted', { style: { lineHeight: 1.6 }, html:
          'Zeichne auf <kbd>&lt;canvas id="exCanvas" width="320" height="200"&gt;</kbd>. AleRGB tastet das Bild ab und legt es über dein Geräte-Layout.<br>' +
          '• <kbd>&lt;meta property="name" type="number|color|boolean|combobox|hue|textfield" …&gt;</kbd> wird zur Einstellung & globalen Variable.<br>' +
          '• <kbd>on&lt;name&gt;Changed()</kbd> wird bei Änderungen aufgerufen.<br>' +
          '• <kbd>engine.audio.freq</kbd> (200 Werte), <kbd>engine.audio.level</kbd> (dB), <kbd>engine.audio.density</kbd>, zusätzlich <kbd>engine.audio.bands</kbd>/<kbd>bass</kbd> (0..1).<br>' +
          'Dieses Format nutzen auch viele Community-Effekte im Netz (z.B. für SignalRGB) – diese lassen sich direkt importieren.' })]),
      ]),
    ]));
    run();
  },
  onPreview(p) { if (this.big) App.paint(this.big, p); },
  onLog(l) { if (this.tab === 'code' && this.consoleBox && /Canvas-Effekt/.test(l.msg)) this.consoleBox.textContent += l.msg.replace('[Canvas-Effekt] ', '') + '\n'; },
};
