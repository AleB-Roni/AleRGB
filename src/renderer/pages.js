'use strict';
/* global h, icon, esc, toast, act, modal, slider, toggle, colorSwatch, paramControls, drawLeds, b64, TYPE_LABEL, SpectraEffects, App, Capture */
const Pages = {};
const api = (...a) => window.spectra.invoke(...a);

// ======================================================================
// Geräte
// ======================================================================
Pages.devices = {
  title: 'Geräte', icon: 'devices',
  render(root) {
    const S = App.state;
    const devs = S.devices;
    const leds = devs.reduce((a, d) => a + d.ledCount, 0);
    const activeDrivers = S.drivers.filter((d) => d.status === 'ok').length;
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Geräte'), h('p', 'Alle erkannten RGB-Geräte – über alle Hersteller hinweg synchronisiert.')]),
      h('div.spacer'),
      h('div.chips', [h('span.chip', [h('b', String(devs.length)), ' Geräte']), h('span.chip', [h('b', String(leds)), ' LEDs']), h('span.chip', [h('b', String(activeDrivers)), ' Treiber aktiv'])]),
      h('button.btn', { onclick: () => act(() => api('drivers:rescan'), 'Suche neu gestartet …'), html: icon('refresh') + 'Neu suchen' }),
    ]));
    if (!devs.length) {
      root.appendChild(h('div.card.empty', [
        h('div.big', { html: icon('devices') }),
        h('h2', 'Noch keine Geräte gefunden'),
        h('p', 'AleRGB verbindet sich mit OpenRGB, Razer Synapse, Corsair iCUE, Logitech G HUB, SteelSeries GG sowie WLED, Hue, Nanoleaf, Govee und Yeelight. Prüfe die Integrationen oder lass den Kompatibilitäts-Check laufen.'),
        h('div.row', { style: { justifyContent: 'center' } }, [
          h('button.btn.primary', { onclick: () => App.go('diagnostics'), html: icon('activity') + 'Kompatibilitäts-Check' }),
          h('button.btn', { onclick: () => App.go('integrations'), html: icon('plug') + 'Integrationen' }),
          h('button.btn', { onclick: () => act(() => api('driver:update', 'simulator', { enabled: true }), 'Demo-Geräte aktiviert'), html: icon('sparkles') + 'Demo-Geräte aktivieren' }),
        ]),
      ]));
      return;
    }
    const grid = h('div.grid.devices');
    this.cards = new Map();
    const order = ['keyboard', 'mouse', 'mousepad', 'headset', 'motherboard', 'gpu', 'ram', 'fan', 'cooler', 'ledstrip', 'panels', 'matrix', 'light'];
    const sorted = devs.slice().sort((a, b) => (order.indexOf(a.type) + 99) % 99 - (order.indexOf(b.type) + 99) % 99 || a.name.localeCompare(b.name));
    for (const d of sorted) {
      const s = d.settings;
      const cv = h('canvas');
      const card = h('div.card.device' + (s.enabled ? '' : '.off'), [
        h('div.viz', [cv, h('span.type.chip', esc(TYPE_LABEL[d.type] || d.type))]),
        h('div.body', [
          h('div.row', [h('div.grow', { style: { minWidth: 0 } }, [h('div.name', { title: d.name }, esc(d.name)), h('div.meta', `${esc(d.vendor)} · ${esc(driverName(d.driver))} · ${d.ledCount} LED${d.ledCount === 1 ? '' : 's'}`)]),
            toggle(s.enabled, (v) => api('device:update', d.id, { enabled: v }))]),
          h('div.ctl', [h('span.muted', { html: icon('sun') }), (() => { const sl = slider({ min: 0, max: 100, value: s.brightness ?? 100 }); sl.addEventListener('change', () => api('device:update', d.id, { brightness: Number(sl.value) })); return sl; })()]),
          h('div.foot', [
            h('button.btn.sm', { onclick: () => api('device:identify', d.id), html: icon('zap') + 'Identifizieren' }),
            overrideButton(d),
          ]),
          d.lastError ? h('div.err', esc(d.lastError)) : null,
        ]),
      ]);
      this.cards.set(d.id, { cv, d });
      grid.appendChild(card);
    }
    root.appendChild(grid);
  },
  onPreview(p) {
    if (!this.cards) return;
    for (const [id, c] of this.cards) { const col = p.devices[id]; drawLeds(c.cv, c.d.leds, col ? b64(col) : null, { pad: 26, aspect: c.d.aspect || (c.d.ledCount > 1 && c.d.leds.every((l) => l.y === c.d.leds[0].y) ? 10 : null) }); }
  },
};
function driverName(id) { const d = App.state.drivers.find((x) => x.id === id); return d ? d.name : id; }
function overrideButton(d) {
  const o = d.settings.override;
  const label = o ? (o.type === 'static' ? 'Eigene Farbe' : 'Eigener Effekt') : 'Synchron';
  return h('select', { style: { width: 'auto', marginLeft: 'auto', padding: '5px 28px 5px 10px', fontSize: '12px' }, title: 'Effekt für dieses Gerät', onchange: async (e) => {
    const v = e.target.value;
    if (v === 'sync') return api('device:update', d.id, { override: null });
    if (v === 'static') {
      const c = await modal({ title: 'Feste Farbe für ' + d.name, text: 'Farbe als Hex-Code (z.B. #ff0044):', input: true, value: (o && o.color) || '#ffffff' });
      if (c) return api('device:update', d.id, { override: { type: 'static', color: c } });
      return App.rerender();
    }
    return api('device:update', d.id, { override: { type: 'native', id: v, params: {} } });
  } }, [
    h('option', { value: 'sync', selected: !o }, 'Synchron'),
    h('option', { value: 'static', selected: o && o.type === 'static' }, 'Feste Farbe …'),
    h('optgroup', { label: 'Eigener Effekt' }, SpectraEffects.EFFECTS.filter((e) => !e.requires).map((e) => h('option', { value: e.id, selected: o && o.id === e.id }, esc(e.name)))),
  ]);
}

// ======================================================================
// Effekte
// ======================================================================
const FAKE = {
  audio: { bands: new Array(24).fill(0), bass: 0, level: 0 }, screen: null, system: { cpu: 0.5, mem: 0.6 },
  tick(t) {
    for (let i = 0; i < 24; i++) this.audio.bands[i] = Math.max(0, 0.55 + 0.4 * Math.sin(t * 3 + i * 0.7) * Math.cos(t * 1.3 + i * 0.2) - i * 0.012);
    this.audio.bass = Math.pow(Math.max(0, Math.sin(t * 6.3)), 4); this.audio.level = 0.3 + 0.3 * Math.abs(Math.sin(t * 2));
    this.system.cpu = 0.5 + 0.4 * Math.sin(t * 0.7);
    if (!this.screen) { const W = 32, H = 18, d = new Uint8Array(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 3; d[k] = 40 + x * 6; d[k + 1] = 20 + y * 8; d[k + 2] = 200 - x * 4; } this.screen = { w: W, h: H, data: d, avg: [120, 80, 140] }; }
  },
};
const Thumbs = {
  items: [], running: false,
  add(cv, spec) { this.items.push({ cv, fn: SpectraEffects.compile(spec), ctx: cv.getContext('2d'), img: null }); this.start(); },
  clear() { this.items = []; },
  start() {
    if (this.running) return; this.running = true;
    const W = 32, H = 18; let last = 0;
    const loop = (ts) => {
      if (!this.items.length) { this.running = false; return; }
      requestAnimationFrame(loop);
      if (ts - last < 50) return; last = ts;
      const t = ts / 1000; FAKE.tick(t); const o = [0, 0, 0];
      for (const it of this.items) {
        if (!it.cv.isConnected) continue;
        const r = it.cv.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
        if (!it.img) { it.cv.width = W; it.cv.height = H; it.img = it.ctx.createImageData(W, H); }
        const d = it.img.data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { it.fn(x / (W - 1), y / (H - 1), t, FAKE, o); const k = (y * W + x) * 4; d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = 255; }
        it.ctx.putImageData(it.img, 0, 0);
      }
    };
    requestAnimationFrame(loop);
  },
};
const CAT_ORDER = ['Basis', 'Natur', 'Psychedelisch', 'Animation', 'Audio', 'Ambilight', 'System', 'Canvas', 'Eigene & Importierte'];
const REQ_LABEL = { audio: 'Audio', screen: 'Bildschirm', system: 'System' };

Pages.effects = {
  title: 'Effekte', icon: 'sparkles', filter: 'Alle', search: '',
  render(root) {
    const S = App.state; Thumbs.clear();
    const cur = S.effects.find((e) => e.key === S.effect.key) || S.effects[0];
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Effekte'), h('p', 'Wähle einen Effekt, passe ihn an, erstelle eigene oder importiere Effekte aus dem Netz.')]),
      h('div.spacer'),
      h('button.btn', { onclick: () => App.openStudio('builder'), html: icon('layers') + 'Ebenen-Effekt' }),
      h('button.btn', { onclick: () => App.openStudio('code'), html: icon('code') + 'Code-Effekt' }),
      h('button.btn', { onclick: () => act(() => api('fx:importFiles'), (k) => k && 'Effekt importiert'), html: icon('upload') + 'Importieren' }),
      h('button.btn', { onclick: () => importUrl(), html: icon('link') + 'Aus URL' }),
      h('button.btn.ghost', { onclick: () => api('fx:openFolder'), title: 'Effekt-Ordner öffnen', html: icon('folder') }),
    ]));
    // Bühne
    this.big = h('canvas.preview', { width: 64, height: 36 });
    const req = (cur.requires || []);
    const reqNotes = req.map((r) => {
      if (r === 'audio') return Capture.state.audioErr ? h('div.note.warn', [h('span', { html: icon('alert') }), h('div', 'Audio konnte nicht erfasst werden: ' + esc(Capture.state.audioErr))]) : h('div.note.info', [h('span', { html: icon('info') }), h('div', 'Reagiert auf ' + (S.settings.audioSource === 'mic' ? 'dein Mikrofon' : 'den Windows-Systemsound') + '. Quelle in den Einstellungen änderbar.')]);
      if (r === 'screen') return h('div.note.info', [h('span', { html: icon('info') }), h('div', 'Nimmt den Hauptbildschirm mit niedriger Auflösung auf – nichts wird gespeichert oder versendet.')]);
      return null;
    });
    const isCanvas = cur.type === 'canvas';
    root.appendChild(h('div.fx-layout', [
      h('div.fx-stage', [
        h('div.preview-wrap', [this.big, h('div.ptitle', [h('b', esc(cur.name)), h('span.small', esc(cur.category))])]),
        h('div.card.pad', [
          h('div.row', { style: { marginBottom: '14px' } }, [h('h2.grow', { style: { margin: 0 } }, 'Einstellungen'),
            cur.type === 'native' ? h('button.btn.sm', { onclick: () => App.openStudio('builder', { layers: [{ id: cur.id, params: { ...S.effect.params }, blend: 'normal', opacity: 1 }], name: cur.name + ' Remix' }), html: icon('layers') + 'Im Baukasten öffnen' }) : null,
            isCanvas ? h('button.btn.sm', { onclick: () => editEffect(cur), html: icon(cur.editable ? 'edit' : 'copy') + (cur.editable ? 'Code bearbeiten' : 'Als Kopie bearbeiten') }) : null,
            cur.type === 'layers' ? h('button.btn.sm', { onclick: () => editEffect(cur), html: icon('edit') + 'Bearbeiten' }) : null,
          ]),
          h('p.muted.small', { style: { marginTop: 0 } }, esc(cur.description || '')),
          paramControls(cur.params, S.effect.params || {}, throttle((k, v) => api('effect:set', { key: cur.key, params: { [k]: v } }), 60)),
          ...reqNotes.filter(Boolean).map((n) => { n.style.marginTop = '14px'; return n; }),
        ]),
      ]),
      this.gallery(S),
    ]));
    // Drag & Drop
    const dz = h('div.dropzone', 'Effekt-Datei (.html / .json) hier ablegen');
    root.appendChild(dz);
    root.ondragover = (e) => { e.preventDefault(); dz.classList.add('show'); };
    dz.ondragleave = () => dz.classList.remove('show');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('show'); const paths = [...e.dataTransfer.files].map((f) => window.spectra.pathForFile(f)); act(() => api('fx:importFiles', paths), 'Importiert'); };
  },
  gallery(S) {
    const wrap = h('div.fx-gallery');
    const cats = ['Alle', ...CAT_ORDER.filter((c) => S.effects.some((e) => e.category === c))];
    const search = h('input', { type: 'text', placeholder: 'Effekte durchsuchen …', value: this.search, oninput: () => { this.search = search.value; draw(); } });
    const chips = h('div.chips', cats.map((c) => h('span.chip.btnchip' + (c === this.filter ? '.active' : ''), { onclick: () => { this.filter = c; App.rerender(); } }, esc(c))));
    const list = h('div');
    const draw = () => {
      list.innerHTML = ''; Thumbs.clear();
      const q = this.search.toLowerCase();
      for (const cat of CAT_ORDER) {
        if (this.filter !== 'Alle' && this.filter !== cat) continue;
        const items = S.effects.filter((e) => e.category === cat && (!q || (e.name + ' ' + e.description).toLowerCase().includes(q)));
        if (!items.length) continue;
        list.appendChild(h('h3.cat', esc(cat)));
        list.appendChild(h('div.fx-grid', items.map((e) => this.tile(e, S))));
      }
      if (!list.children.length) list.appendChild(h('div.muted', { style: { padding: '30px 0' } }, 'Keine Effekte gefunden.'));
    };
    draw();
    wrap.appendChild(h('div.row', [h('div.grow', [search])]));
    wrap.appendChild(h('div', { style: { marginTop: '12px' } }, chips));
    wrap.appendChild(list);
    return wrap;
  },
  tile(e, S) {
    let thumb;
    if (e.type === 'native') { thumb = h('canvas'); Thumbs.add(thumb, { type: 'native', id: e.id, params: e.key === S.effect.key ? S.effect.params : undefined }); }
    else if (e.type === 'layers') { thumb = h('canvas'); Thumbs.add(thumb, { type: 'layers', layers: e.layers }); }
    else thumb = h('div.thumb', { html: icon('code') + '&nbsp;HTML' });
    const acts = [];
    if (e.type === 'canvas' || e.type === 'layers') acts.push(h('button', { title: e.editable ? 'Bearbeiten' : 'Als Kopie bearbeiten', onclick: (ev) => { ev.stopPropagation(); editEffect(e); }, html: icon(e.editable ? 'edit' : 'copy') }));
    acts.push(h('button', { title: 'Exportieren', onclick: (ev) => { ev.stopPropagation(); act(() => api('fx:export', e.key), (p) => p && 'Exportiert: ' + p); }, html: icon('download') }));
    if (e.source === 'user') acts.push(h('button', { title: 'Löschen', onclick: async (ev) => { ev.stopPropagation(); if (await modal({ title: 'Effekt löschen?', text: `„${esc(e.name)}“ wird endgültig entfernt.`, okLabel: 'Löschen', danger: true })) act(() => api('fx:delete', e.key), 'Gelöscht'); }, html: icon('trash') }));
    return h('div.fx-tile' + (e.key === S.effect.key ? '.active' : ''), { onclick: () => api('effect:set', { key: e.key }), title: e.description || '' }, [
      thumb,
      h('div.tags', (e.requires || []).map((r) => h('span.tag', REQ_LABEL[r] || r))),
      h('div.acts', acts),
      h('div.tname', [h('span', esc(e.name))]),
    ]);
  },
  onPreview(p) { if (this.big) App.paint(this.big, p); },
};
async function importUrl() {
  const url = await modal({ title: 'Effekt aus dem Internet importieren', text: 'Link zu einer <b>.html</b>-Effektdatei (z.B. ein Community-Lightscript auf GitHub) oder einer AleRGB-<b>.json</b>. GitHub-Links werden automatisch in Rohdateien umgewandelt.', input: true, placeholder: 'https://github.com/…/effekt.html', okLabel: 'Importieren' });
  if (url) act(() => api('fx:importUrl', url.trim()), 'Effekt importiert und aktiviert').then((k) => api('effect:set', { key: k }));
}
async function editEffect(e) {
  if (e.type === 'layers') return App.openStudio('builder', { key: e.key, name: e.name, layers: JSON.parse(JSON.stringify(e.layers)) });
  if (e.type === 'canvas') { const code = await api('fx:getCode', e.key); return App.openStudio('code', { key: e.editable ? e.key : null, name: e.editable ? e.name : e.name + ' (Kopie)', html: code }); }
}
function throttle(fn, ms) { let last = 0, t; return (...a) => { const now = Date.now(); clearTimeout(t); if (now - last > ms) { last = now; fn(...a); } else t = setTimeout(() => { last = Date.now(); fn(...a); }, ms); }; }

// ======================================================================
// Layout
// ======================================================================
Pages.layout = {
  title: 'Layout', icon: 'layout',
  render(root) {
    const S = App.state;
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Layout'), h('p', 'Ordne deine Geräte auf der Leinwand so an, wie sie auf deinem Schreibtisch stehen – Effekte fließen dann realistisch über alle Geräte.')]),
      h('div.spacer'),
      h('button.btn', { onclick: () => act(() => api('layout:auto'), 'Automatisch angeordnet'), html: icon('grid') + 'Auto-Anordnen' }),
    ]));
    const devs = S.devices.filter((d) => d.settings.enabled);
    this.bg = h('canvas', { width: 64, height: 36 });
    const area = h('div.canvas-area', [this.bg, h('div.gridlines')]);
    this.items = new Map();
    this.sel = this.sel && devs.find((d) => d.id === this.sel) ? this.sel : null;
    const side = h('div.card.pad');
    const drawSide = () => {
      side.innerHTML = '';
      const d = devs.find((x) => x.id === this.sel);
      if (!d) { side.append(h('h2', 'Gerät wählen'), h('p.muted.small', 'Klicke ein Gerät auf der Leinwand an, um es zu verschieben (ziehen) oder zu skalieren (Ecke unten rechts). Tipp: Pfeiltasten verschieben fein, Umschalt + Pfeiltasten skalieren.')); return; }
      const r = d.settings.rect;
      const num = (k, label) => { const i = h('input', { type: 'number', step: 0.01, min: 0, max: 1, value: r[k].toFixed(3), onchange: () => { r[k] = Math.max(0, Math.min(1, Number(i.value))); api('device:update', d.id, { rect: r }); } }); return h('div', [h('label.small.muted', label), i]); };
      side.append(h('h2', esc(d.name)), h('p.muted.small', `${TYPE_LABEL[d.type] || d.type} · ${d.ledCount} LEDs`),
        h('div.grid', { style: { gridTemplateColumns: '1fr 1fr', gap: '10px' } }, [num('x', 'X'), num('y', 'Y'), num('w', 'Breite'), num('h', 'Höhe')]),
        h('div.row', { style: { marginTop: '14px' } }, [h('button.btn.sm', { onclick: () => api('device:identify', d.id), html: icon('zap') + 'Identifizieren' }), h('button.btn.sm', { onclick: () => { const a = d.aspect || 1; r.h = Math.min(1, (r.w * SpectraEffects.ASPECT) / a); api('device:update', d.id, { rect: r }); }, html: 'Seitenverhältnis' })]));
    };
    for (const d of devs) {
      const r = d.settings.rect;
      const cv = h('canvas'); const rs = h('div.rs');
      const el = h('div.ldev' + (d.id === this.sel ? '.sel' : ''), { tabindex: 0 }, [cv, h('div.lbl', esc(d.name)), rs]);
      const place = () => Object.assign(el.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
      place();
      el.addEventListener('pointerdown', (e) => {
        this.sel = d.id; area.querySelectorAll('.ldev').forEach((x) => x.classList.toggle('sel', x === el)); drawSide();
        const resize = e.target === rs; const A = area.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; const o = { ...r };
        el.setPointerCapture(e.pointerId);
        const mv = (ev) => {
          const dx = (ev.clientX - sx) / A.width, dy = (ev.clientY - sy) / A.height;
          if (resize) { r.w = Math.max(0.02, Math.min(1 - r.x, o.w + dx)); r.h = Math.max(0.02, Math.min(1 - r.y, o.h + dy)); }
          else { r.x = Math.max(0, Math.min(1 - r.w, o.x + dx)); r.y = Math.max(0, Math.min(1 - r.h, o.y + dy)); }
          place();
        };
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); App.lock = false; api('device:update', d.id, { rect: r }); drawSide(); };
        App.lock = true;
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
      });
      el.addEventListener('keydown', (e) => {
        const st = 0.005; const k = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key]; if (!k) return;
        e.preventDefault();
        if (e.shiftKey) { r.w = Math.max(0.02, r.w + k[0]); r.h = Math.max(0.02, r.h + k[1]); } else { r.x = Math.max(0, Math.min(1 - r.w, r.x + k[0])); r.y = Math.max(0, Math.min(1 - r.h, r.y + k[1])); }
        place(); clearTimeout(this._kt); this._kt = setTimeout(() => api('device:update', d.id, { rect: r }), 300);
      });
      this.items.set(d.id, { cv, d });
      area.appendChild(el);
    }
    drawSide();
    root.appendChild(h('div.layout-wrap', [h('div', [area, devs.length ? null : h('p.muted', { style: { marginTop: '12px' } }, 'Keine aktiven Geräte.')]), side]));
  },
  onPreview(p) {
    App.paint(this.bg, p);
    for (const [id, it] of this.items) { const c = p.devices[id]; drawLeds(it.cv, it.d.leds, c ? b64(c) : null, { pad: 6, r: Math.max(1.5, Math.min(5, 60 / Math.sqrt(it.d.ledCount))) }); }
  },
};

// ======================================================================
// Profile
// ======================================================================
Pages.profiles = {
  title: 'Profile', icon: 'bookmark',
  render(root) {
    const S = App.state;
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Profile'), h('p', 'Speichere Effekt, Layout, Helligkeit und Geräteeinstellungen als Profil – umschaltbar per Tray-Menü oder Hotkey.')]),
      h('div.spacer'),
      h('button.btn.primary', { onclick: async () => { const n = await modal({ title: 'Neues Profil', text: 'Speichert den aktuellen Zustand.', input: true, placeholder: 'z.B. Gaming, Film, Arbeit', okLabel: 'Speichern' }); if (n !== null) act(() => api('profile:save', n || undefined), 'Profil gespeichert'); }, html: icon('plus') + 'Aktuellen Zustand speichern' }),
    ]));
    if (!S.profiles.length) {
      root.appendChild(h('div.card.empty', [h('div.big', { html: icon('bookmark') }), h('h2', 'Noch keine Profile'), h('p', 'Stelle einen Effekt und dein Layout ein und speichere beides als Profil. Mit Strg+Alt+← / → wechselst du später blitzschnell zwischen Profilen.')]));
      return;
    }
    root.appendChild(h('div.grid', { style: { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } }, S.profiles.map((p) => {
      const fx = S.effects.find((e) => e.key === p.effect);
      const cv = h('canvas', { style: { width: '100%', aspectRatio: '16/6', display: 'block', borderRadius: '10px' } });
      if (fx && fx.type !== 'canvas') Thumbs.add(cv, fx.type === 'layers' ? { type: 'layers', layers: fx.layers } : { type: 'native', id: fx.id });
      const active = p.id === S.activeProfile;
      return h('div.card.pad', { style: active ? { boxShadow: '0 0 0 2px var(--accent)' } : {} }, [
        cv,
        h('div.row', { style: { marginTop: '12px' } }, [h('div.grow', [h('div', { style: { fontWeight: 600 } }, esc(p.name)), h('div.small.muted', esc(fx ? fx.name : p.effect))]), active ? h('span.pill.ok', 'Aktiv') : null]),
        h('div.row', { style: { marginTop: '12px' } }, [
          h('button.btn.sm.primary', { onclick: () => act(() => api('profile:apply', p.id), 'Profil angewendet'), html: icon('play') + 'Anwenden' }),
          h('button.btn.sm', { title: 'Mit aktuellem Zustand überschreiben', onclick: () => act(() => api('profile:save', null, p.id), 'Profil aktualisiert'), html: icon('save') }),
          h('button.btn.sm', { title: 'Umbenennen', onclick: async () => { const n = await modal({ title: 'Profil umbenennen', input: true, value: p.name }); if (n) api('profile:rename', p.id, n); }, html: icon('edit') }),
          h('button.btn.sm.danger', { title: 'Löschen', onclick: async () => { if (await modal({ title: 'Profil löschen?', text: esc(p.name), okLabel: 'Löschen', danger: true })) api('profile:delete', p.id); }, html: icon('trash') }),
        ]),
      ]);
    })));
  },
};

// ======================================================================
// Integrationen
// ======================================================================
const DRIVER_STYLE = {
  openrgb: ['ORGB', '#7c3aed'], razer: ['RZ', '#16a34a'], nollie: ['NL8', '#e11d48'], corsair: ['CR', '#eab308'], logitech: ['LG', '#0ea5e9'], steelseries: ['SS', '#f97316'],
  wled: ['WL', '#06b6d4'], hue: ['HUE', '#8b5cf6'], nanoleaf: ['NL', '#22c55e'], govee: ['GV', '#ef4444'], yeelight: ['YL', '#f59e0b'], simulator: ['DEMO', '#64748b'],
};
const STATUS_LABEL = { idle: 'Kein Gerät', ok: 'Verbunden', error: 'Fehler', connecting: 'Verbinde …', setup: 'Einrichtung nötig', stopped: 'Gestoppt', disabled: 'Deaktiviert', unsupported: 'Nicht verfügbar' };
Pages.integrations = {
  title: 'Integrationen', icon: 'plug', open: {},
  render(root) {
    const S = App.state;
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Integrationen'), h('p', 'Treiber für Hersteller-Software, OpenRGB und Smart-Home-Beleuchtung. Aktiviere nur, was du nutzt.')]),
      h('div.spacer'),
      h('button.btn', { onclick: () => App.go('diagnostics'), html: icon('activity') + 'Kompatibilitäts-Check' }),
    ]));
    root.appendChild(h('div.grid.drivers', S.drivers.map((d) => {
      const [abbr, col] = DRIVER_STYLE[d.id] || ['?', '#666'];
      const enabled = d.config.enabled;
      const vals = { ...d.config };
      const fields = (d.fields || []).map((f) => {
        let inp;
        if (f.type === 'bool') inp = toggle(!!vals[f.key], (v) => (vals[f.key] = v));
        else if (f.type === 'multi') inp = h('div.multi', f.options.map((o) => { const on = (vals[f.key] || []).includes(o); return h('span.chip.btnchip' + (on ? '.active' : ''), { onclick: (e) => { const arr = new Set(vals[f.key] || []); arr.has(o) ? arr.delete(o) : arr.add(o); vals[f.key] = [...arr]; e.target.classList.toggle('active'); } }, esc(TYPE_LABEL[o] || (o === 'chromalink' ? 'Chroma Link' : o === 'all' ? 'Alle (Fallback)' : o))); }));
        else if (f.type === 'channels') inp = channelEditor(vals, f);
        else if (f.type === 'file') { const i = h('input', { type: 'text', value: vals[f.key] || '', placeholder: 'C:\\…', oninput: () => (vals[f.key] = i.value) }); inp = h('div.row', { style: { flexWrap: 'nowrap' } }, [i, h('button.btn.sm', { onclick: async () => { const p = await api('dialog:file', [{ name: 'Programme/DLLs', extensions: ['exe', 'dll'] }]); if (p) { i.value = p; vals[f.key] = p; } } }, '…')]); }
        else { const i = h('input', { type: f.type === 'number' ? 'number' : 'text', value: vals[f.key] ?? '', oninput: () => (vals[f.key] = f.type === 'number' ? Number(i.value) : i.value) }); inp = i; }
        return h('div', [h('label', esc(f.label)), inp]);
      });
      const det = h('details', { open: !!this.open[d.id], ontoggle: () => (this.open[d.id] = det.open) }, [
        h('summary', 'Einstellungen & Hilfe'),
        h('div.fields', [
          h('div.help', { html: icon('info').replace('class="ic"', 'class="ic" style="float:left;margin-right:8px;color:var(--info)"') + esc(d.help) }),
          ...fields,
          h('div.row', [
            fields.length ? h('button.btn.sm.primary', { onclick: () => act(() => api('driver:update', d.id, vals), 'Gespeichert – Treiber neu gestartet'), html: icon('save') + 'Speichern' }) : null,
            ...(d.actions || []).map((a) => h('button.btn.sm', { onclick: () => act(() => api('driver:action', d.id, a.id), (r) => (r && r.message) || 'OK') }, esc(a.label))),
            enabled ? h('button.btn.sm.ghost', { onclick: () => act(() => api('driver:restart', d.id), 'Neu verbunden'), html: icon('refresh') + 'Neu verbinden' }) : null,
          ]),
        ]),
      ]);
      return h('div.card.pad.driver', [
        h('div.dh', [
          h('div.dlogo', { style: { background: col + '22', color: col, fontSize: abbr.length > 3 ? '11px' : '14px' } }, abbr),
          h('div.grow', [h('div.row', [h('b', esc(d.name)), h('span.pill.' + (enabled ? d.status : 'disabled'), STATUS_LABEL[enabled ? d.status : 'disabled'] || d.status)]), h('div.small.muted', esc(d.vendor) + (d.deviceCount ? ` · ${d.deviceCount} Gerät(e)` : ''))]),
          toggle(enabled, (v) => act(() => api('driver:update', d.id, { ...d.config, enabled: v }), v ? d.name + ' aktiviert' : d.name + ' deaktiviert')),
        ]),
        h('p.desc', esc(d.description)),
        enabled && d.message ? h('div.msg' + (d.status === 'error' ? '.error' : ''), esc(d.message)) : null,
        det,
      ]);
    })));
  },
};

/** Editor für ARGB-Kanäle (z.B. Nollie): Name, Art, LED-Anzahl und Lüfterzahl pro Kanal */
function channelEditor(vals, f) {
  const list = (Array.isArray(vals[f.key]) ? vals[f.key] : f.default).map((c) => ({ ...c }));
  vals[f.key] = list;
  const num = (c, k, max, w) => { const i = h('input', { type: 'number', min: 0, max, value: c[k] ?? 0, style: { width: w }, oninput: () => (c[k] = Math.max(0, Math.min(max, Number(i.value) || 0))) }); return i; };
  return h('div', { style: { display: 'grid', gap: '6px' } }, [
    h('div.small.dim', { style: { display: 'grid', gridTemplateColumns: 'minmax(80px, 1fr) 106px 58px 54px', gap: '6px' } }, ['Name', 'Art', 'LEDs', 'Lüfter'].map((t) => h('span', t))),
    ...list.map((c) => {
      const fans = num(c, 'fans', 20, '100%'); fans.disabled = c.kind !== 'ring';
      const kind = h('select', { onchange: () => { c.kind = kind.value; fans.disabled = c.kind !== 'ring'; } }, [h('option', { value: 'ring', selected: c.kind === 'ring' }, 'Lüfter-Ring'), h('option', { value: 'strip', selected: c.kind !== 'ring' }, 'LED-Strip')]);
      const name = h('input', { type: 'text', value: c.name || '', oninput: () => (c.name = name.value) });
      return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(80px, 1fr) 106px 58px 54px', gap: '6px' } }, [name, kind, num(c, 'leds', f.max || 999, '100%'), fans]);
    }),
    h('div.small.dim', 'Mehrere Lüfter in Reihe an einem Kanal: LEDs = Summe (z.B. 3 × 16 = 48), Lüfter = 3.'),
  ]);
}

// ======================================================================
// Diagnose
// ======================================================================
Pages.diagnostics = {
  title: 'Diagnose', icon: 'activity', result: null, running: false,
  render(root) {
    root.appendChild(h('div.page-head', [
      h('div', [h('h1', 'Kompatibilitäts-Check'), h('p', 'Findet angeschlossene RGB-Hardware, erkennt Konflikte mit anderer RGB-Software und sagt dir, welcher Treiber für welches Gerät am besten ist.')]),
      h('div.spacer'),
      h('button.btn.primary', { disabled: this.running, onclick: () => this.run(), html: icon('activity') + (this.running ? 'Prüfe …' : this.result ? 'Erneut prüfen' : 'Check starten') }),
    ]));
    const r = this.result;
    if (!r) {
      root.appendChild(h('div.card.empty', [h('div.big', { html: icon('activity') }), h('h2', this.running ? 'Analysiere System …' : 'Bereit'), h('p', 'Der Check liest die Liste angeschlossener USB-Geräte und laufender Prozesse aus. Es werden keine Daten versendet.')]));
    } else {
      const note = (lvl, html) => h('div.note.' + lvl, [h('span', { html: icon(lvl === 'ok' ? 'check' : lvl === 'info' ? 'info' : 'alert') }), h('div', { html })]);
      root.appendChild(h('div.section', [h('h3', `Empfehlungen (${r.items.length})`), r.items.length ? r.items.map((i) => note(i.level, esc(i.text))) : note('ok', 'Keine Probleme gefunden. 🎉')]));
      root.appendChild(h('div.section', [h('h3', `Erkannte RGB-Hardware (${r.hardware.length} Hersteller, ${r.usbCount} USB-Geräte gesamt)`),
        r.hardware.length ? h('div.hw', r.hardware.map((v) => h('div.card.pad', [
          h('div.row', [h('b.grow', esc(v.name)), h('span.pill.' + (v.active.length ? 'ok' : 'connecting'), v.active.length ? 'Treiber aktiv' : 'Nicht verbunden')]),
          h('div.small.muted', { style: { margin: '6px 0 10px' } }, 'USB-Hersteller-ID ' + v.vid + (v.devices.length ? ' · ' + esc(v.devices.join(', ')) : '')),
          h('div.small', [h('span.muted', 'Empfohlen: '), esc(v.route)]),
        ]))) : h('p.muted', 'Keine bekannten RGB-Hersteller per USB gefunden. Mainboard-, RAM- und GPU-RGB hängen meist nicht an USB, sondern am SMBus – diese findet OpenRGB.')]));
      root.appendChild(h('div.section', [h('h3', 'Laufende RGB-Software'),
        r.software.length ? r.software.map((s) => note(s.ok ? 'ok' : 'warn', `<b>${esc(s.name)}</b> <span class="dim">(${esc(s.process)})</span><br>${esc(s.tip)}`)) : h('p.muted', 'Keine bekannte RGB-Software aktiv.')]));
    }
    const logBox = h('div.card.log');
    root.appendChild(h('div.section', [h('h3', 'Protokoll'), logBox]));
    api('log:get').then((logs) => { logBox.innerHTML = logs.slice(-200).reverse().map((l) => `<div class="${l.level}">${new Date(l.t).toLocaleTimeString()} · ${esc(l.msg)}</div>`).join('') || '<div class="info">Leer</div>'; });
  },
  async run() { this.running = true; App.rerender(); try { this.result = await api('diag:run'); } catch (e) { toast(e.message, 'error'); } this.running = false; App.rerender(); },
};

// ======================================================================
// Einstellungen
// ======================================================================
Pages.settings = {
  title: 'Einstellungen', icon: 'settings',
  render(root) {
    const s = App.state.settings;
    const set = (k) => (v) => api('settings:update', { [k]: v });
    const item = (t, d, ctl) => h('div.item', [h('div.t', [h('div', t), h('div', d)]), ctl]);
    const fps = slider({ min: 10, max: 60, step: 5, value: s.fps }); const fv = h('b', { style: { width: '50px', textAlign: 'right' } }, s.fps + ' FPS');
    fps.addEventListener('input', () => (fv.textContent = fps.value + ' FPS')); fps.addEventListener('change', () => set('fps')(Number(fps.value)));
    const sm = slider({ min: 0, max: 1, step: 0.05, value: s.screenSmoothing }); sm.addEventListener('change', () => set('screenSmoothing')(Number(sm.value)));
    root.appendChild(h('div.page-head', [h('div', [h('h1', 'Einstellungen'), h('p', 'Verhalten, Leistung und Automatisierung.')])]));
    root.appendChild(h('h3', 'Allgemein'));
    root.appendChild(h('div.card.set-list', [
      item('Mit Windows starten', 'Startet AleRGB minimiert im Infobereich.', toggle(s.autostart, set('autostart'))),
      item('Minimiert starten', 'Beim Start nur das Tray-Symbol anzeigen.', toggle(s.startMinimized, set('startMinimized'))),
      item('Beim Schließen in den Infobereich', 'Effekte laufen im Hintergrund weiter.', toggle(s.closeToTray, set('closeToTray'))),
      item('Globale Hotkeys', 'Strg+Alt+L an/aus · Strg+Alt+←/→ Profile · Strg+Alt+↑/↓ Helligkeit', toggle(s.hotkeys, set('hotkeys'))),
    ]));
    root.appendChild(h('h3', { style: { marginTop: '26px' } }, 'Automatisch ausschalten'));
    root.appendChild(h('div.card.set-list', [
      item('Beim Sperren des PCs (Win+L)', 'LEDs aus, solange der Bildschirm gesperrt ist.', toggle(s.offOnLock, set('offOnLock'))),
      item('Im Standby / Ruhezustand', 'LEDs aus, wenn der PC schläft.', toggle(s.offOnSleep, set('offOnSleep'))),
      item('Beim Beenden', 'LEDs aus, wenn AleRGB geschlossen wird.', toggle(s.offOnExit, set('offOnExit'))),
    ]));
    root.appendChild(h('h3', { style: { marginTop: '26px' } }, 'Leistung & Eingaben'));
    root.appendChild(h('div.card.set-list', [
      item('Bildrate', 'Höher = flüssiger, aber mehr CPU-Last und USB-Verkehr. 30 FPS sind ideal.', h('div.row', [fps, fv])),
      item('Audio-Quelle', 'Für Audio-Effekte und Canvas-Effekte mit engine.audio.', h('select', { onchange: (e) => set('audioSource')(e.target.value) }, [h('option', { value: 'system', selected: s.audioSource === 'system' }, 'Systemsound (Loopback)'), h('option', { value: 'mic', selected: s.audioSource === 'mic' }, 'Mikrofon')])),
      item('Ambilight-Glättung', 'Verhindert Flackern bei schnellen Bildwechseln.', sm),
    ]));
    root.appendChild(h('p.small.dim', { style: { marginTop: '26px' } }, 'AleRGB 1.0 · Effekte und Einstellungen liegen in %APPDATA%\\alergb'));
  },
};
