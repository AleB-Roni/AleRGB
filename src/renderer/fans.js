'use strict';
/* global h, icon, esc, toast, act, slider, toggle, modal, Pages, api, App */

Pages.fans = {
  title: 'Lüfter', icon: 'fan', data: null, open: {},
  async render(root) {
    this.data = await api('fans:get');
    const d = this.data;
    this.root = root; this.lastStatus = d.status;
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Lüfter'), h('p', 'Mainboard-Lüfter (CPU_FAN, SYS_FAN …) nach Temperatur regeln. Pumpe & Radiator-Lüfter der Kraken findest du unter „NZXT Kraken“.')]),
      h('div.spacer'),
      d.status === 'running' ? h('div.row', [h('span.pill.ok', 'Aktiv'), h('button.btn', { onclick: () => act(() => api('fans:stop'), 'Lüftersteuerung beendet – das BIOS übernimmt wieder'), html: icon('power') + 'Beenden' })]) : null,
    ]));
    if (d.status !== 'running') { root.appendChild(this.setupCard(d)); return; }
    this.temps = h('div.kstats');
    root.appendChild(this.temps);
    this.list = h('div.fan-list');
    root.appendChild(this.list);
    if (!d.controls.length) {
      root.appendChild(h('div.card.empty', [h('div.big', { html: icon('fan') }), h('h2', 'Keine steuerbaren Mainboard-Lüfter gefunden'),
        h('p', { html: d.pawnio ? 'Dein Mainboard-Chip wird von LibreHardwareMonitor evtl. noch nicht unterstützt, oder die Lüfter hängen an einem anderen Controller.' : 'Der <b>PawnIO-Treiber</b> fehlt – ohne ihn sind die Lüfteranschlüsse des Mainboards nicht erreichbar. Installiere ihn (siehe oben) und starte die Lüftersteuerung neu.' })]));
    }
    root.appendChild(h('div.card.pad', { style: { marginTop: '18px' } }, [
      h('h2', 'Einstellungen'),
      h('div.set-list', [
        h('div.item', [h('div.t', [h('div', 'Beim Start von AleRGB automatisch aktivieren'), h('div', 'Windows fragt dabei jedes Mal nach Adminrechten (Benutzerkontensteuerung).')]), toggle(d.settings.autoStart, (v) => api('fans:settings', { autoStart: v }))]),
        h('div.item', [h('div.t', [h('div', '0 % erlauben (Lüfter-Stopp)'), h('div', `Standard: mindestens ${d.minDuty} %. Nur aktivieren, wenn deine Lüfter Zero-RPM unterstützen und gut gekühlt wird.`)]), toggle(d.settings.allowZero, (v) => api('fans:settings', { allowZero: v }))]),
      ]),
      h('p.small.muted', { style: { margin: '12px 0 0' } }, `Sicherheit: Über CPU ${d.critical.cpu} °C, GPU ${d.critical.gpu} °C oder Wasser ${d.critical.liquid} °C laufen alle gesteuerten Lüfter mit 100 %. Wird AleRGB beendet oder stürzt ab, übernimmt automatisch wieder das BIOS.`),
    ]));
    this.update(true);
  },

  setupCard(d) {
    const win = d.platform === 'win32';
    const step = (ok, title, text, action) => h('div.note' + (ok ? '.ok' : '.info'), [h('span', { html: icon(ok ? 'check' : 'info') }), h('div.grow', [h('b', title), h('div.small.muted', { html: text })]), action || null]);
    return h('div.card.pad', [
      h('h2', 'Mainboard-Lüftersteuerung einrichten'),
      h('p.muted', { style: { lineHeight: 1.6 } }, 'Die Lüfteranschlüsse auf dem Mainboard werden von einem Chip gesteuert, den Windows nur mit Administratorrechten und einem Treiber erreicht. AleRGB nutzt dafür LibreHardwareMonitor und den signierten Open-Source-Treiber PawnIO (beides auch in OpenRGB und FanControl im Einsatz). Nur ein kleiner Hilfsdienst läuft mit Adminrechten – AleRGB selbst nicht.'),
      !win ? h('div.note.warn', [h('span', { html: icon('alert') }), h('div', 'Nur unter Windows verfügbar.')]) : null,
      step(!!d.pawnio, '1. PawnIO-Treiber', d.pawnio ? 'Installiert.' : 'Einmalig installieren (wird auch für RAM-/Mainboard-RGB in OpenRGB gebraucht).', d.pawnio ? null : h('button.btn.sm', { onclick: () => api('app:open', 'https://pawnio.eu/'), html: icon('download') + 'pawnio.eu öffnen' })),
      step(false, '2. Lüftersteuerung starten', 'Windows fragt nach Adminrechten. Danach siehst du hier alle Lüfter mit Drehzahl und kannst Kurven festlegen.'),
      d.message ? h('div.note.' + (d.status === 'error' ? 'error' : 'info'), [h('span', { html: icon(d.status === 'error' ? 'alert' : 'info') }), h('div', esc(d.message))]) : null,
      h('div.row', { style: { marginTop: '12px' } }, [h('button.btn.primary', { disabled: !win || d.status === 'starting', onclick: () => act(() => api('fans:start')), html: icon('fan') + (d.status === 'starting' ? 'Startet …' : 'Lüftersteuerung starten') })]),
    ]);
  },

  update(force) {
    const d = this.data;
    if (!this.root || !this.root.isConnected) return;
    if (d.status !== this.lastStatus) return App.rerender();
    if (d.status !== 'running') return;
    // Temperaturen
    const k = d.key; const tile = (label, s) => h('div.card.kstat', [h('div.small.muted', label), h('div.kval', s ? s.value.toFixed(0) + ' °C' : '–'), h('div.small.muted', s ? esc(s.name) : 'nicht gefunden')]);
    this.temps.innerHTML = ''; this.temps.append(tile('CPU', k.cpu), tile('Grafikkarte', k.gpu), tile('Wasser (Kraken)', k.liquid));
    // Lüfter: Karten nur einmal bauen, danach nur Werte aktualisieren
    const ids = d.controls.map((c) => c.id).join();
    if (force || ids !== this.ids) { this.ids = ids; this.cards = new Map(); this.list.innerHTML = ''; for (const c of d.controls) this.list.appendChild(this.card(c)); }
    for (const c of d.controls) {
      const card = this.cards.get(c.id); if (!card) continue;
      card.rpm.textContent = c.rpm !== null && c.rpm !== undefined ? c.rpm + ' U/min' : '– U/min';
      card.duty.textContent = (c.value !== null && c.value !== undefined ? Math.round(c.value) : '–') + ' %';
      card.bar.style.width = Math.max(0, Math.min(100, c.value || 0)) + '%';
      if (card.editor) card.editor.mark(this.sensorTemp(d.settings.fans[c.id]));
    }
  },
  sensorTemp(cfg) { const d = this.data; const id = (cfg && cfg.sensor) || d.defaultSensor; const s = d.sensors.find((x) => x.id === id); return s ? s.value : null; },

  card(c) {
    const d = this.data; const cfg = d.settings.fans[c.id] || { mode: 'bios' };
    const set = (patch) => api('fans:set', c.id, patch);
    const rpm = h('span.kval', { style: { fontSize: '20px', margin: 0 } }); const duty = h('span.small.muted'); const bar = h('div.fan-bar-fill');
    const body = h('div');
    const name = cfg.alias || c.name;
    const draw = () => {
      body.innerHTML = '';
      const mode = cfg.mode || 'bios';
      body.appendChild(h('div.tabs', [['bios', 'BIOS'], ['fixed', 'Fest'], ['curve', 'Kurve']].map(([m, l]) => h('button' + (mode === m ? '.active' : ''), { onclick: () => { cfg.mode = m; if (m === 'curve' && !cfg.points) cfg.points = d.presets.balanced.points.map((p) => p.slice()); if (m === 'fixed' && !Number.isFinite(cfg.duty)) cfg.duty = 50; set({ mode: m, points: cfg.points, duty: cfg.duty }); draw(); } }, l))));
      if (mode === 'bios') body.appendChild(h('p.small.muted', 'Das Mainboard/BIOS regelt diesen Lüfter wie gewohnt.'));
      if (mode === 'fixed') {
        const v = cfg.duty ?? 50; const lab = h('b', v + ' %');
        const s = slider({ min: d.settings.allowZero ? 0 : d.minDuty, max: 100, value: v });
        s.addEventListener('input', () => (lab.textContent = s.value + ' %')); s.addEventListener('change', () => { cfg.duty = Number(s.value); set({ duty: cfg.duty }); });
        body.appendChild(h('div.param', { style: { marginTop: '14px' } }, [h('label.pl', ['Leistung', lab]), s]));
      }
      if (mode === 'curve') {
        const sensors = d.sensors.filter((x) => typeof x.value === 'number');
        const sel = h('select', { onchange: () => { cfg.sensor = sel.value; set({ sensor: cfg.sensor }); } }, sensors.map((x) => h('option', { value: x.id, selected: x.id === (cfg.sensor || d.defaultSensor) }, `${x.name} · ${x.hardware} (${x.value.toFixed(0)} °C)`)));
        const editor = curveEditor(cfg.points || d.presets.balanced.points, d.settings.allowZero ? 0 : d.minDuty, (pts) => { cfg.points = pts; set({ points: pts }); });
        this.cards.get(c.id).editor = editor;
        body.append(
          h('div.row', { style: { marginTop: '14px', flexWrap: 'nowrap' } }, [h('div.grow', [h('label.small.muted', 'Temperatur-Quelle'), sel])]),
          h('div.row', { style: { marginTop: '10px' } }, [h('span.small.muted', 'Vorlage:'), ...Object.entries(d.presets).map(([id, p]) => h('button.btn.sm', { onclick: () => { cfg.points = p.points.map((x) => x.slice()); set({ points: cfg.points }); draw(); } }, esc(p.label)))]),
          editor.el,
          h('p.small.muted', { style: { margin: '6px 0 0' } }, 'Punkte ziehen, um die Kurve anzupassen. Die senkrechte Linie zeigt die aktuelle Temperatur.'),
        );
      } else if (this.cards.get(c.id)) this.cards.get(c.id).editor = null;
    };
    const el = h('div.card.pad.fan-card', [
      h('div.row', { style: { flexWrap: 'nowrap' } }, [
        h('div.dev-icon', { html: icon('fan') }),
        h('div.grow', { style: { minWidth: 0 } }, [h('div.name', { title: c.id }, esc(name)), h('div.small.muted', esc(c.hardware))]),
        h('button.btn.sm.ghost', { title: 'Umbenennen', onclick: async () => { const n = await modal({ title: 'Lüfter umbenennen', text: 'z.B. „CPU-Lüfter“, „Front unten“, „Heck“', input: true, value: name }); if (n !== null) { cfg.alias = n.trim() || null; set({ alias: cfg.alias }); App.rerender(); } }, html: icon('edit') }),
        h('div', { style: { textAlign: 'right' } }, [rpm, h('div', duty)]),
      ]),
      h('div.fan-bar', bar),
      body,
    ]);
    this.cards.set(c.id, { rpm, duty, bar, editor: null });
    draw();
    return el;
  },
};

/** SVG-Kurveneditor: Temperatur (20–100 °C) → Leistung (%) mit ziehbaren Punkten */
function curveEditor(points, minDuty, onChange) {
  const W = 420, H = 170, P = { l: 34, r: 10, t: 10, b: 24 };
  const T0 = 20, T1 = 100;
  const x = (t) => P.l + ((t - T0) / (T1 - T0)) * (W - P.l - P.r), y = (d) => P.t + (1 - d / 100) * (H - P.t - P.b);
  const ix = (px) => T0 + ((px - P.l) / (W - P.l - P.r)) * (T1 - T0), iy = (py) => 100 * (1 - (py - P.t) / (H - P.t - P.b));
  let pts = points.map((p) => p.slice()).sort((a, b) => a[0] - b[0]);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.classList.add('curve-ed');
  const mk = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
  for (let t = 20; t <= 100; t += 10) { mk('line', { x1: x(t), x2: x(t), y1: P.t, y2: H - P.b, class: 'g' }); mk('text', { x: x(t), y: H - 6, class: 'l', 'text-anchor': 'middle' }).textContent = t + '°'; }
  for (let d = 0; d <= 100; d += 25) { mk('line', { x1: P.l, x2: W - P.r, y1: y(d), y2: y(d), class: 'g' }); mk('text', { x: P.l - 6, y: y(d) + 4, class: 'l', 'text-anchor': 'end' }).textContent = d + '%'; }
  const area = mk('path', { class: 'a' }); const line = mk('path', { class: 'c' });
  const now = mk('line', { class: 'now', y1: P.t, y2: H - P.b, x1: -10, x2: -10 }); const nowDot = mk('circle', { class: 'nowd', r: 4, cx: -10, cy: -10 });
  const handles = [];
  const render = () => {
    const d = [[T0, pts[0][1]], ...pts, [T1, pts[pts.length - 1][1]]].map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
    line.setAttribute('d', d); area.setAttribute('d', `${d} L${x(T1)},${y(0)} L${x(T0)},${y(0)} Z`);
    pts.forEach((p, i) => { handles[i].setAttribute('cx', x(p[0])); handles[i].setAttribute('cy', y(p[1])); handles[i].querySelector('title').textContent = `${Math.round(p[0])} °C → ${Math.round(p[1])} %`; });
  };
  pts.forEach((p, i) => {
    const c = mk('circle', { r: 7, class: 'h' }); c.appendChild(document.createElementNS(ns, 'title')); handles.push(c);
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId); App.lock = true;
      const move = (ev) => {
        const r = svg.getBoundingClientRect(); const sx = W / r.width, sy = H / r.height;
        let t = ix((ev.clientX - r.left) * sx), d = iy((ev.clientY - r.top) * sy);
        const lo = i ? pts[i - 1][0] + 1 : T0, hi = i < pts.length - 1 ? pts[i + 1][0] - 1 : T1;
        pts[i] = [Math.round(Math.max(lo, Math.min(hi, t))), Math.round(Math.max(minDuty, Math.min(100, d)))];
        render();
      };
      const up = () => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); App.lock = false; onChange(pts.map((p) => p.slice())); };
      c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    });
  });
  render();
  const interp = (t) => { if (t <= pts[0][0]) return pts[0][1]; if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]; const k = pts.findIndex((p) => p[0] >= t); const a = pts[k - 1], b = pts[k]; return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]); };
  return {
    el: h('div', { style: { marginTop: '10px' } }, svg),
    mark(t) { if (typeof t !== 'number') return; const X = x(Math.max(T0, Math.min(T1, t))); now.setAttribute('x1', X); now.setAttribute('x2', X); nowDot.setAttribute('cx', X); nowDot.setAttribute('cy', y(Math.max(minDuty, interp(t)))); },
  };
}
