'use strict';
/* global ICONS */
/**
 * Realistische Gerätevorschau: zeichnet je Gerätetyp eine Silhouette (Tastatur, Maus, Lüfter, RAM, GPU …)
 * und lässt die LEDs mit weichem Glow darauf leuchten.
 */
const TYPE_INFO = {
  keyboard: { label: 'Tastatur', cat: 'Peripherie', icon: 'keyboard' },
  keypad: { label: 'Keypad', cat: 'Peripherie', icon: 'keyboard' },
  mouse: { label: 'Maus', cat: 'Peripherie', icon: 'mouse' },
  mousepad: { label: 'Mauspad', cat: 'Peripherie', icon: 'mousepad' },
  headset: { label: 'Headset', cat: 'Peripherie', icon: 'headset' },
  speaker: { label: 'Lautsprecher', cat: 'Peripherie', icon: 'speaker' },
  gamepad: { label: 'Controller', cat: 'Peripherie', icon: 'gamepad' },
  motherboard: { label: 'Mainboard', cat: 'PC-Komponenten', icon: 'board' },
  gpu: { label: 'Grafikkarte', cat: 'PC-Komponenten', icon: 'gpu' },
  ram: { label: 'Arbeitsspeicher', cat: 'PC-Komponenten', icon: 'ram' },
  fan: { label: 'Lüfter', cat: 'PC-Komponenten', icon: 'fan' },
  cooler: { label: 'CPU-Kühler / AIO', cat: 'PC-Komponenten', icon: 'pump' },
  case: { label: 'Gehäuse', cat: 'PC-Komponenten', icon: 'board' },
  storage: { label: 'Speicher', cat: 'PC-Komponenten', icon: 'ram' },
  ledstrip: { label: 'LED-Strip', cat: 'Beleuchtung', icon: 'strip' },
  light: { label: 'Lampe', cat: 'Beleuchtung', icon: 'bulb' },
  panels: { label: 'Licht-Panels', cat: 'Beleuchtung', icon: 'panels' },
  matrix: { label: 'LED-Matrix', cat: 'Beleuchtung', icon: 'panels' },
  other: { label: 'Gerät', cat: 'Sonstiges', icon: 'devices' },
};
const CATEGORIES = ['Peripherie', 'PC-Komponenten', 'Beleuchtung', 'Sonstiges'];
const typeInfo = (t) => TYPE_INFO[t] || TYPE_INFO.other;

Object.assign(ICONS, {
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M6 14h0M18 14h0M10 14h4"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
  mousepad: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M5 16h14"/>',
  headset: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/>',
  speaker: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M12 6h0"/>',
  gamepad: '<path d="M6 12h4M8 10v4M15 13h0M18 11h0"/><rect x="2" y="6" width="20" height="12" rx="6"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="6" height="6"/><path d="M16 7v10M7 17h6"/>',
  gpu: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M4 17v3"/>',
  ram: '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7V4M11 7V4M15 7V4M19 17v3M5 17v3M8 11h8"/>',
  fan: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="2"/><path d="M12 10c0-3 1-5 4-5M14 12c3 0 5 1 5 4M12 14c0 3-1 5-4 5M10 12c-3 0-5-1-5-4"/>',
  pump: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v2M12 19v2"/>',
  strip: '<rect x="2" y="10" width="20" height="4" rx="1"/><path d="M5 12h0M9 12h0M13 12h0M17 12h0"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.7V17H8v-2.3A7 7 0 0 1 12 2z"/>',
  panels: '<path d="M12 2l5 3v6l-5 3-5-3V5zM7 11l5 3v6l-5 3-5-3v-6zM17 11l5 3v6l-5 3-5-3v-6z"/>',
});

const DevViz = {
  /** Durchschnittsfarbe (für Akzent-Icon) */
  avg(colors) {
    if (!colors || !colors.length) return [90, 90, 120];
    let r = 0, g = 0, b = 0; const n = colors.length / 3;
    for (let i = 0; i < colors.length; i += 3) { r += colors[i]; g += colors[i + 1]; b += colors[i + 2]; }
    return [r / n, g / n, b / n];
  },

  draw(cv, dev, colors, t = performance.now() / 1000) {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const col = (i) => (colors ? [colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]] : [55, 55, 75]);
    const shape = this.shapeFor(dev);
    const body = this.fit(W, H, shape.aspect, shape.pad ?? 22);
    // LED-Bereich innerhalb des Gehäuses
    const area = shape.area ? shape.area(body) : inset(body, Math.min(body.w, body.h) * 0.08);
    const pts = dev.leds.map((p) => ({ x: area.x + p.x * area.w, y: area.y + p.y * area.h }));
    const avg = this.avg(colors);

    // 1) Unterboden-Leuchten (Licht fällt auf den „Tisch“)
    const halo = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    halo.addColorStop(0, rgba(avg, 0.28)); halo.addColorStop(1, rgba(avg, 0));
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

    // 2) Gehäuse
    shape.body(ctx, body, t);

    // 3) Licht auf der Oberfläche (weich, wie durch Diffusor)
    ctx.save();
    if (shape.clip) { shape.clip(ctx, body); ctx.clip(); }
    ctx.globalCompositeOperation = 'lighter';
    const spread = shape.spread ? shape.spread(body, pts.length) : Math.max(10, Math.sqrt((area.w * area.h) / Math.max(1, pts.length)) * 1.4);
    for (let i = 0; i < pts.length; i++) {
      const c = col(i), p = pts[i];
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, spread);
      g.addColorStop(0, rgba(c, 0.55)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(p.x - spread, p.y - spread, spread * 2, spread * 2);
    }
    ctx.restore();

    // 4) Die LEDs selbst bzw. Tasten / Diffusor
    (shape.leds || this.dotLeds)(ctx, pts, col, area, dev);

    // 5) Details über dem Licht (z.B. Lüfterblätter, Tastenbeschriftung)
    if (shape.over) shape.over(ctx, body, t, avg);
  },

  fit(W, H, aspect, pad) {
    let w = W - pad * 2, hh = H - pad * 2;
    if (w / hh > aspect) w = hh * aspect; else hh = w / aspect;
    return { x: (W - w) / 2, y: (H - hh) / 2, w, h: hh };
  },

  dotLeds(ctx, pts, col, area) {
    const r = Math.max(1.6, Math.min(5, Math.sqrt((area.w * area.h) / Math.max(1, pts.length)) * 0.22));
    for (let i = 0; i < pts.length; i++) {
      const c = col(i);
      ctx.fillStyle = rgba(lighten(c, 0.35), 1);
      ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, r, 0, 6.283); ctx.fill();
    }
  },

  shapeFor(dev) {
    const n = dev.ledCount;
    const linear = n > 1 && dev.leds.every((p) => Math.abs(p.y - dev.leds[0].y) < 1e-6);
    const vertical = n > 1 && dev.leds.every((p) => Math.abs(p.x - dev.leds[0].x) < 1e-6);
    const t = dev.type;
    if (t === 'keyboard' || t === 'keypad') return SHAPES.keyboard(dev);
    if (t === 'mouse') return SHAPES.mouse;
    if (t === 'mousepad') return SHAPES.mousepad;
    if (t === 'headset') return SHAPES.headset;
    if (t === 'fan') return SHAPES.fan(dev);
    if (t === 'cooler') return SHAPES.pump;
    if (t === 'ram' || vertical) return SHAPES.ram;
    if (t === 'gpu') return SHAPES.gpu;
    if (t === 'motherboard' && !linear) return SHAPES.board;
    if (t === 'light') return n <= 3 ? SHAPES.bulb : SHAPES.strip;
    if (t === 'panels') return SHAPES.panels(dev);
    if (t === 'ledstrip' || linear) return SHAPES.strip;
    if (t === 'matrix') return SHAPES.matrix(dev);
    return SHAPES.generic(dev);
  },
};

// ---------------- Zeichen-Helfer ----------------
function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function lighten(c, k) { return [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k]; }
function inset(r, d) { return { x: r.x + d, y: r.y + d, w: r.w - d * 2, h: r.h - d * 2 }; }
function rrect(ctx, r, rad) { ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, rad); }
function shell(ctx, r, rad, top = '#24273a', bottom = '#121420') {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; rrect(ctx, r, rad); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
}

const SHAPES = {
  keyboard(dev) {
    // Tastenraster aus den LED-Positionen ableiten
    const xs = [...new Set(dev.leds.map((p) => p.x.toFixed(3)))].length, ys = [...new Set(dev.leds.map((p) => p.y.toFixed(3)))].length;
    const aspect = dev.aspect || Math.max(2.4, Math.min(4.2, (xs / Math.max(1, ys)) * 0.95));
    return {
      aspect, pad: 18,
      area: (b) => inset(b, Math.min(b.w, b.h) * 0.11),
      body: (ctx, b) => shell(ctx, b, Math.min(b.w, b.h) * 0.08, '#20222f', '#0d0e16'),
      clip: (ctx, b) => rrect(ctx, b, Math.min(b.w, b.h) * 0.08),
      spread: (b, n) => Math.max(8, Math.sqrt((b.w * b.h) / Math.max(1, n)) * 1.1),
      leds: (ctx, pts, col, area) => {
        const kw = Math.max(3, (area.w / Math.max(1, xs - 1)) * 0.8), kh = Math.max(3, (area.h / Math.max(1, ys - 1)) * 0.78);
        for (let i = 0; i < pts.length; i++) {
          const c = col(i), p = pts[i];
          ctx.fillStyle = '#16171f'; ctx.beginPath(); ctx.roundRect(p.x - kw / 2, p.y - kh / 2, kw, kh, Math.min(kw, kh) * 0.22); ctx.fill();
          // Licht scheint unter der Taste hervor + leuchtende Beschriftung
          ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = rgba(lighten(c, 0.25), 0.9); ctx.fillRect(p.x - kw * 0.14, p.y - kh * 0.14, kw * 0.28, kh * 0.28);
        }
      },
    };
  },
  mouse: {
    aspect: 0.62, pad: 16,
    area: (b) => ({ x: b.x + b.w * 0.18, y: b.y + b.h * 0.12, w: b.w * 0.64, h: b.h * 0.76 }),
    body: (ctx, b) => {
      shell(ctx, b, b.w * 0.5, '#262939', '#0f1019');
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x + b.w / 2, b.y + 4); ctx.lineTo(b.x + b.w / 2, b.y + b.h * 0.38); ctx.stroke();
      ctx.fillStyle = '#0b0c12'; ctx.beginPath(); ctx.roundRect(b.x + b.w / 2 - b.w * 0.07, b.y + b.h * 0.12, b.w * 0.14, b.h * 0.16, 6); ctx.fill();
    },
    clip: (ctx, b) => rrect(ctx, b, b.w * 0.5),
    spread: (b) => b.w * 0.45,
  },
  mousepad: {
    aspect: 1.9, pad: 14,
    area: (b) => inset(b, 6),
    body: (ctx, b) => { shell(ctx, b, 12, '#191b27', '#11121b'); ctx.strokeStyle = 'rgba(255,255,255,0.04)'; for (let y = b.y + 10; y < b.y + b.h; y += 6) { ctx.beginPath(); ctx.moveTo(b.x + 8, y); ctx.lineTo(b.x + b.w - 8, y); ctx.stroke(); } },
    spread: () => 26,
  },
  headset: {
    aspect: 1.35, pad: 14,
    area: (b) => ({ x: b.x + b.w * 0.12, y: b.y + b.h * 0.72, w: b.w * 0.76, h: 1 }),
    body: (ctx, b) => {
      ctx.strokeStyle = '#2a2d3e'; ctx.lineWidth = Math.max(6, b.w * 0.06);
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h * 0.62, b.w * 0.4, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      for (const s of [0.12, 0.88]) { const g = ctx.createLinearGradient(0, b.y + b.h * 0.5, 0, b.y + b.h); g.addColorStop(0, '#272a3a'); g.addColorStop(1, '#10111a'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(b.x + b.w * s, b.y + b.h * 0.72, b.w * 0.13, b.h * 0.24, 0, 0, 6.283); ctx.fill(); }
    },
    spread: (b) => b.w * 0.2,
  },
  fan(dev) {
    const per = dev.leds.length;
    const fans = Math.max(1, Math.round((dev.aspect || 1)));
    return {
      aspect: fans, pad: 12,
      // LED-Ring liegt im Lüfterkreis, nicht auf dem Rahmen
      area: (b) => ({ x: b.x + b.h * 0.1, y: b.y + b.h * 0.1, w: b.w - b.h * 0.2, h: b.h * 0.8 }),
      body: (ctx, b) => {
        for (let f = 0; f < fans; f++) {
          const r = { x: b.x + (b.w / fans) * f + 3, y: b.y + 3, w: b.w / fans - 6, h: b.h - 6 };
          shell(ctx, r, r.w * 0.12, '#1d1f2c', '#101119');
          ctx.fillStyle = '#07080d'; ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.42, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#2a2d3d'; for (const [cx, cy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) { ctx.beginPath(); ctx.arc(r.x + r.w * cx, r.y + r.h * cy, r.w * 0.035, 0, 6.283); ctx.fill(); }
        }
      },
      spread: (b) => (b.w / fans) * 0.16,
      leds: (ctx, pts, col) => { for (let i = 0; i < pts.length; i++) { const c = col(i); ctx.fillStyle = rgba(lighten(c, 0.3), 1); ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.6, 0, 6.283); ctx.fill(); } },
      over: (ctx, b, t, avg) => {
        for (let f = 0; f < fans; f++) {
          const cx = b.x + (b.w / fans) * (f + 0.5), cy = b.y + b.h / 2, R = (b.w / fans) * 0.32;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2.2 + f);
          for (let k = 0; k < 7; k++) { ctx.rotate((Math.PI * 2) / 7); ctx.fillStyle = 'rgba(30,32,46,0.92)'; ctx.beginPath(); ctx.ellipse(R * 0.55, 0, R * 0.48, R * 0.17, 0.5, 0, 6.283); ctx.fill(); }
          ctx.restore();
          const hub = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.32); hub.addColorStop(0, rgba(lighten(avg, 0.2), 0.9)); hub.addColorStop(1, '#14151f');
          ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, 6.283); ctx.fill();
        }
      },
    };
  },
  pump: {
    aspect: 1, pad: 14, area: (b) => inset(b, b.w * 0.06),
    body: (ctx, b) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; ctx.fillStyle = '#151722'; ctx.beginPath(); ctx.arc(cx, cy, b.w / 2, 0, 6.283); ctx.fill(); ctx.fillStyle = '#07080d'; ctx.beginPath(); ctx.arc(cx, cy, b.w * 0.38, 0, 6.283); ctx.fill(); },
    spread: (b) => b.w * 0.18,
  },
  ram: {
    aspect: 0.26, pad: 10,
    area: (b) => ({ x: b.x + b.w * 0.5, y: b.y + b.h * 0.05, w: 0, h: b.h * 0.42 }),
    body: (ctx, b) => {
      shell(ctx, b, 4, '#262938', '#121420');
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.globalAlpha = 0.08; ctx.fillRect(b.x + b.w * 0.15, b.y + b.h * 0.05, b.w * 0.7, b.h * 0.42); ctx.globalAlpha = 1;
      ctx.fillStyle = '#b8902e'; for (let y = b.y + b.h * 0.92; y < b.y + b.h - 2; y += 3) ctx.fillRect(b.x + 3, y, b.w - 6, 1.5);
    },
    clip: (ctx, b) => rrect(ctx, b, 4),
    spread: (b) => b.w * 0.75,
    leds: () => {},
  },
  gpu: {
    aspect: 3.2, pad: 14,
    area: (b) => ({ x: b.x + b.w * 0.05, y: b.y + b.h * 0.08, w: b.w * 0.9, h: b.h * 0.08 }),
    body: (ctx, b) => {
      shell(ctx, b, 8, '#23263a', '#0e0f18');
      for (const fx of [0.2, 0.5, 0.8]) { const cx = b.x + b.w * fx, cy = b.y + b.h * 0.58, R = b.h * 0.32; ctx.fillStyle = '#08090e'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke(); }
    },
    clip: (ctx, b) => rrect(ctx, b, 8),
    spread: () => 22,
  },
  board: {
    aspect: 0.85, pad: 14, area: (b) => inset(b, 10),
    body: (ctx, b) => {
      shell(ctx, b, 4, '#1b1f2b', '#0f121a');
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.strokeRect(b.x + b.w * 0.3, b.y + b.h * 0.18, b.w * 0.3, b.w * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 4; i++) ctx.fillRect(b.x + b.w * (0.68 + i * 0.06), b.y + b.h * 0.12, b.w * 0.03, b.h * 0.4);
      ctx.fillRect(b.x + b.w * 0.12, b.y + b.h * 0.62, b.w * 0.7, b.h * 0.05); ctx.fillRect(b.x + b.w * 0.12, b.y + b.h * 0.76, b.w * 0.7, b.h * 0.05);
    },
    spread: () => 20,
  },
  strip: {
    aspect: 10, pad: 18,
    area: (b) => ({ x: b.x + 6, y: b.y + b.h / 2, w: b.w - 12, h: 0 }),
    body: (ctx, b) => { const r = { x: b.x, y: b.y + b.h * 0.3, w: b.w, h: b.h * 0.4 }; shell(ctx, r, r.h / 2, '#1d1f2c', '#11121b'); },
    spread: (b, n) => Math.max(12, (b.w / Math.max(1, n)) * 2.2),
    leds: (ctx, pts, col, area) => { const s = Math.max(2, Math.min(6, area.w / Math.max(1, pts.length) * 0.55)); for (let i = 0; i < pts.length; i++) { const c = col(i); ctx.fillStyle = rgba(lighten(c, 0.4), 1); ctx.fillRect(pts[i].x - s / 2, pts[i].y - s / 2, s, s); } },
  },
  bulb: {
    aspect: 0.8, pad: 16, area: (b) => ({ x: b.x + b.w / 2, y: b.y + b.h * 0.38, w: 0, h: 0 }),
    body: (ctx, b) => { ctx.fillStyle = '#2a2d3c'; ctx.beginPath(); ctx.roundRect(b.x + b.w * 0.36, b.y + b.h * 0.74, b.w * 0.28, b.h * 0.2, 4); ctx.fill(); },
    spread: (b) => b.w * 0.75,
    leds: (ctx, pts, col, area) => { const c = col(0); const p = pts[0] || { x: area.x, y: area.y }; const g = ctx.createRadialGradient(p.x, p.y - 4, 2, p.x, p.y, 40); g.addColorStop(0, rgba(lighten(c, 0.6), 1)); g.addColorStop(1, rgba(c, 0.85)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, 6.283); ctx.fill(); },
  },
  panels(dev) {
    return {
      aspect: dev.aspect || 1.6, pad: 16, area: (b) => inset(b, 14),
      body: () => {},
      spread: (b, n) => Math.sqrt((b.w * b.h) / Math.max(1, n)) * 0.9,
      leds: (ctx, pts, col, area) => {
        const r = Math.max(6, Math.sqrt((area.w * area.h) / Math.max(1, pts.length)) * 0.42);
        for (let i = 0; i < pts.length; i++) { const c = col(i), p = pts[i]; ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k + Math.PI / 6; ctx[k ? 'lineTo' : 'moveTo'](p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = rgba(c, 0.9); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke(); }
      },
    };
  },
  matrix(dev) {
    return { aspect: dev.aspect || 2, pad: 14, area: (b) => inset(b, 8), body: (ctx, b) => shell(ctx, b, 6, '#14151f', '#0c0d14'), spread: () => 8 };
  },
  generic(dev) {
    return { aspect: dev.aspect || 1.6, pad: 18, area: (b) => inset(b, 12), body: (ctx, b) => shell(ctx, b, 10), spread: (b, n) => Math.max(12, Math.sqrt((b.w * b.h) / Math.max(1, n)) * 1.2) };
  },
};
