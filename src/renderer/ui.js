'use strict';
/* Kleine UI-Hilfsbibliothek */
const ICONS = {
  devices: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h0"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h0"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  up: '<path d="M18 15l-6-6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
  droplet: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
};
function icon(name) { return `<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg></span>`; }

/** h('div.card.pad', {onclick}, [children]) */
function h(sel, attrs, children) {
  if (Array.isArray(attrs) || typeof attrs === 'string' || attrs instanceof Node) { children = attrs; attrs = {}; }
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') continue;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  if (attrs && attrs.value !== undefined && attrs.value !== null) el.value = attrs.value;
  return el;
}
function append(el, c) {
  if (c === undefined || c === null || c === false) return;
  if (Array.isArray(c)) c.forEach((x) => append(el, x));
  else if (c instanceof Node) el.appendChild(c);
  else el.insertAdjacentHTML('beforeend', String(c));
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = '') {
  const t = h('div.toast' + (type ? '.' + type : ''), esc(msg));
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3200);
}
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok'); return r; }
  catch (e) { toast(e.message, 'error'); throw e; }
}
function modal({ title, text, input, placeholder, value, okLabel = 'OK', cancel = true, danger }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    let inp;
    const close = (v) => { bg.remove(); resolve(v); };
    const bg = h('div.modal-bg', { onclick: (e) => e.target === bg && close(null) }, [
      h('div.modal', [
        h('h2', esc(title)), text ? h('p', { html: text }) : null,
        input ? (inp = h('input', { type: 'text', placeholder: placeholder || '', value: value || '', onkeydown: (e) => { if (e.key === 'Enter') close(inp.value); if (e.key === 'Escape') close(null); } })) : null,
        h('div.row', [cancel ? h('button.btn.ghost', { onclick: () => close(null) }, 'Abbrechen') : null, h('button.btn' + (danger ? '.danger' : '.primary'), { onclick: () => close(input ? inp.value : true) }, esc(okLabel))]),
      ]),
    ]);
    root.appendChild(bg);
    if (inp) setTimeout(() => inp.focus(), 30);
  });
}
function rangeFill(el) { const p = ((el.value - el.min) / (el.max - el.min)) * 100; el.style.setProperty('--p', p + '%'); }
function slider(attrs) { const el = h('input', { type: 'range', ...attrs }); rangeFill(el); el.addEventListener('input', () => rangeFill(el)); return el; }
function toggle(checked, onchange) {
  const inp = h('input', { type: 'checkbox', checked, onchange: () => onchange(inp.checked) });
  return h('label.toggle', [inp, h('span')]);
}
function colorSwatch(value, onchange, onremove) {
  const sw = h('div.swatch', { style: { background: value } });
  const inp = h('input', { type: 'color', value, oninput: () => { sw.style.background = inp.value; onchange(inp.value, false); }, onchange: () => onchange(inp.value, true) });
  sw.appendChild(inp);
  if (onremove) sw.appendChild(h('span.x', { onclick: (e) => { e.preventDefault(); e.stopPropagation(); onremove(); } }, '✕'));
  return sw;
}

/** Rendert Effekt-Parameter. onChange(key, value, final) */
function paramControls(params, values, onChange) {
  const wrap = h('div.params');
  if (!params || !params.length) { wrap.appendChild(h('div.muted.small', 'Dieser Effekt hat keine Einstellungen.')); return wrap; }
  for (const p of params) {
    const v = values[p.key] !== undefined ? values[p.key] : p.default;
    if (p.type === 'range') {
      const fmt = (x) => (p.step < 1 ? Number(x).toFixed(p.step < 0.1 ? 2 : 1) : Math.round(x));
      const val = h('b', String(fmt(v)));
      const s = slider({ min: p.min, max: p.max, step: p.step || 1, value: v });
      s.addEventListener('input', () => { val.textContent = fmt(s.value); onChange(p.key, Number(s.value), false); });
      s.addEventListener('change', () => onChange(p.key, Number(s.value), true));
      wrap.appendChild(h('div.param', [h('label.pl', [esc(p.label), val]), s]));
    } else if (p.type === 'color') {
      wrap.appendChild(h('div.param.inline', [h('label.pl', esc(p.label)), colorSwatch(v, (c, f) => onChange(p.key, c, f))]));
    } else if (p.type === 'colors') {
      const list = v.slice();
      const box = h('div.colors');
      const draw = () => {
        box.innerHTML = '';
        list.forEach((c, i) => box.appendChild(colorSwatch(c, (nc, f) => { list[i] = nc; onChange(p.key, list.slice(), f); }, list.length > 1 ? () => { list.splice(i, 1); draw(); onChange(p.key, list.slice(), true); } : null)));
        if (list.length < 8) box.appendChild(h('div.swatch.add', { onclick: () => { list.push(SpectraEffects.toHex(SpectraEffects.hsv(Math.random(), 0.9, 1, [0, 0, 0]))); draw(); onChange(p.key, list.slice(), true); } }, '+'));
      };
      draw();
      wrap.appendChild(h('div.param', [h('label.pl', esc(p.label)), box]));
    } else if (p.type === 'select') {
      const s = h('select', { onchange: () => onChange(p.key, s.value, true) }, p.options.map((o) => h('option', { value: o.value, selected: o.value === v }, esc(o.label))));
      wrap.appendChild(h('div.param', [h('label.pl', esc(p.label)), s]));
    } else if (p.type === 'bool') {
      wrap.appendChild(h('div.param.inline', [h('label.pl', esc(p.label)), toggle(!!v, (c) => onChange(p.key, c, true))]));
    } else {
      const i = h('input', { type: 'text', value: v, onchange: () => onChange(p.key, i.value, true) });
      wrap.appendChild(h('div.param', [h('label.pl', esc(p.label)), i]));
    }
  }
  return wrap;
}

function b64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

/** Zeichnet LEDs eines Geräts (Positionen 0..1) mit Glow in ein Canvas */
function drawLeds(cv, leds, colors, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const pad = opts.pad ?? 18;
  let aw = W - pad * 2, ah = H - pad * 2;
  if (opts.aspect) { const a = opts.aspect; if (aw / ah > a) aw = ah * a; else ah = aw / a; }
  const ox = (W - aw) / 2, oy = (H - ah) / 2;
  const n = leds.length;
  const r = opts.r ?? Math.max(1.6, Math.min(7, Math.sqrt((aw * ah) / Math.max(1, n)) * 0.34));
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const p = leds[i]; const R = colors ? colors[i * 3] : 60, G = colors ? colors[i * 3 + 1] : 60, B = colors ? colors[i * 3 + 2] : 80;
    const x = ox + p.x * aw, y = oy + p.y * ah;
    if (opts.glow !== false) { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2); g.addColorStop(0, `rgba(${R},${G},${B},.55)`); g.addColorStop(1, `rgba(${R},${G},${B},0)`); ctx.fillStyle = g; ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4); }
    ctx.fillStyle = `rgb(${R},${G},${B})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

const TYPE_LABEL = { keyboard: 'Tastatur', mouse: 'Maus', mousepad: 'Mauspad', headset: 'Headset', motherboard: 'Mainboard', ram: 'Arbeitsspeicher', gpu: 'Grafikkarte', cooler: 'Kühler', ledstrip: 'LED-Strip', fan: 'Lüfter', light: 'Lampe', speaker: 'Lautsprecher', panels: 'Panels', matrix: 'Matrix', keypad: 'Keypad', case: 'Gehäuse', gamepad: 'Controller', other: 'Gerät' };
