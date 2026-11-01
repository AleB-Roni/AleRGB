/*
 * Spectra RGB – native Effekt-Bibliothek
 * Wird im Main-Prozess (Engine) UND im Renderer (Galerie-Vorschau) verwendet.
 *
 * Jeder Effekt liefert eine Funktion (x, y, t, inputs, out) -> schreibt RGB (0..255) in out[0..2].
 * x, y: normierte Canvas-Koordinaten 0..1 (Canvas hat 16:9-Seitenverhältnis)
 * t:    Zeit in Sekunden
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpectraEffects = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ASPECT = 16 / 9;
  const TAU = Math.PI * 2;

  // ---------- Hilfsfunktionen ----------
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = (v) => v - Math.floor(v);
  const smooth = (t) => t * t * (3 - 2 * t);

  function hex(h) {
    if (Array.isArray(h)) return h;
    h = String(h || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(c) {
    return '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  }
  // h, s, v in 0..1
  function hsv(h, s, v, out) {
    h = fract(h) * 6;
    const i = Math.floor(h), f = h - i;
    const p = v * (1 - s), q = v * (1 - s * f), u = v * (1 - s * (1 - f));
    let r, g, b;
    switch (i) {
      case 0: r = v; g = u; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = u; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = u; g = p; b = v; break;
      default: r = v; g = p; b = q;
    }
    out[0] = r * 255; out[1] = g * 255; out[2] = b * 255;
    return out;
  }
  // Farbverlauf über Liste, t 0..1, cyclic optional
  function gradient(cols, t, out, cyclic) {
    const n = cols.length;
    if (n === 1) { out[0] = cols[0][0]; out[1] = cols[0][1]; out[2] = cols[0][2]; return out; }
    let pos, i, f;
    if (cyclic) { pos = fract(t) * n; i = Math.floor(pos); f = pos - i; }
    else { pos = clamp(t) * (n - 1); i = Math.min(Math.floor(pos), n - 2); f = pos - i; }
    const a = cols[i % n], b = cols[(i + 1) % n];
    f = smooth(f);
    out[0] = lerp(a[0], b[0], f); out[1] = lerp(a[1], b[1], f); out[2] = lerp(a[2], b[2], f);
    return out;
  }
  function hash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  // 3D Value-Noise
  function hash3(x, y, z) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    const n000 = hash3(xi, yi, zi), n100 = hash3(xi + 1, yi, zi);
    const n010 = hash3(xi, yi + 1, zi), n110 = hash3(xi + 1, yi + 1, zi);
    const n001 = hash3(xi, yi, zi + 1), n101 = hash3(xi + 1, yi, zi + 1);
    const n011 = hash3(xi, yi + 1, zi + 1), n111 = hash3(xi + 1, yi + 1, zi + 1);
    return lerp(
      lerp(lerp(n000, n100, xf), lerp(n010, n110, xf), yf),
      lerp(lerp(n001, n101, xf), lerp(n011, n111, xf), yf),
      zf
    );
  }
  function fbm(x, y, z) {
    return noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 1.3) * 0.3 + noise3(x * 4.3, y * 4.3, z * 1.7) * 0.1;
  }

  // ---------- Parameter-Bausteine ----------
  const P = {
    speed: (d = 1, max = 5) => ({ key: 'speed', label: 'Geschwindigkeit', type: 'range', min: 0, max, step: 0.05, default: d }),
    scale: (d = 1) => ({ key: 'scale', label: 'Größe / Dichte', type: 'range', min: 0.1, max: 5, step: 0.05, default: d }),
    angle: (d = 0) => ({ key: 'angle', label: 'Richtung (°)', type: 'range', min: 0, max: 360, step: 1, default: d }),
    color: (key, label, d) => ({ key, label, type: 'color', default: d }),
    colors: (d, label = 'Farben') => ({ key: 'colors', label, type: 'colors', default: d }),
    sens: (d = 1) => ({ key: 'sensitivity', label: 'Empfindlichkeit', type: 'range', min: 0.1, max: 4, step: 0.05, default: d }),
  };

  // ---------- Effekte ----------
  const EFFECTS = [
    {
      id: 'static', name: 'Statisch', category: 'Basis', icon: 'circle',
      description: 'Eine einzelne, ruhige Farbe auf allen Geräten.',
      params: [P.color('color', 'Farbe', '#7c3aed')],
      make(p) { const c = hex(p.color); return (x, y, t, i, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }; },
    },
    {
      id: 'breathing', name: 'Atmen', category: 'Basis', icon: 'wind',
      description: 'Sanftes Ein- und Ausblenden, wechselt durch deine Farben.',
      params: [P.colors(['#00e5ff', '#7c3aed', '#ff2bd6']), P.speed(0.5, 3)],
      make(p) {
        const cols = p.colors.map(hex); const c = [0, 0, 0];
        return (x, y, t, i, o) => {
          const ph = t * p.speed * 0.5;
          const idx = Math.floor(ph) % cols.length;
          const b = Math.pow(Math.sin(fract(ph) * Math.PI), 2);
          const col = cols[idx];
          o[0] = col[0] * b; o[1] = col[1] * b; o[2] = col[2] * b;
        };
      },
    },
    {
      id: 'rainbow', name: 'Regenbogenwelle', category: 'Basis', icon: 'rainbow',
      description: 'Der Klassiker: ein Regenbogen fließt über alle Geräte.',
      params: [P.speed(0.4, 3), P.scale(1), P.angle(0), { key: 'saturation', label: 'Sättigung', type: 'range', min: 0, max: 1, step: 0.01, default: 1 }],
      make(p) {
        const a = (p.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        return (x, y, t, i, o) => hsv((x * ca + y * sa) * p.scale - t * p.speed, p.saturation, 1, o);
      },
    },
    {
      id: 'spectrum', name: 'Spektrum-Zyklus', category: 'Basis', icon: 'refresh',
      description: 'Alle LEDs wechseln synchron durch das Farbspektrum.',
      params: [P.speed(0.15, 2)],
      make(p) { return (x, y, t, i, o) => hsv(t * p.speed, 1, 1, o); },
    },
    {
      id: 'gradient', name: 'Farbverlauf-Welle', category: 'Basis', icon: 'gradient',
      description: 'Dein eigener Farbverlauf, der über das Setup wandert.',
      params: [P.colors(['#ff006e', '#8338ec', '#3a86ff']), P.speed(0.25, 3), P.scale(1), P.angle(0)],
      make(p) {
        const cols = p.colors.map(hex), a = (p.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        return (x, y, t, i, o) => gradient(cols, (x * ca + y * sa) * p.scale * 0.5 - t * p.speed * 0.3, o, true);
      },
    },
    {
      id: 'aurora', name: 'Polarlicht', category: 'Natur', icon: 'sparkles',
      description: 'Fließende, organische Lichtvorhänge wie Nordlichter.',
      params: [P.colors(['#00ffa3', '#00b3ff', '#7c3aed', '#ff2bd6']), P.speed(0.3, 2), P.scale(1.2)],
      make(p) {
        const cols = p.colors.map(hex);
        return (x, y, t, i, o) => {
          const n = fbm(x * 2.2 * p.scale, y * 0.8 * p.scale, t * p.speed * 0.4);
          const b = clamp(Math.pow(fbm(x * 1.5 * p.scale + 9, y * 3 * p.scale, t * p.speed * 0.6 + 4), 1.6) * 1.9);
          gradient(cols, n * 1.6, o, true);
          o[0] *= b; o[1] *= b; o[2] *= b;
        };
      },
    },
    {
      id: 'fire', name: 'Feuer', category: 'Natur', icon: 'flame',
      description: 'Lodernde Flammen – unten heiß, oben glimmend.',
      params: [P.speed(1, 3), { key: 'intensity', label: 'Intensität', type: 'range', min: 0.2, max: 2, step: 0.05, default: 1 },
        P.colors(['#000000', '#7a0000', '#ff3d00', '#ff9e00', '#fff3b0'], 'Glut-Palette')],
      make(p) {
        const pal = p.colors.map(hex);
        return (x, y, t, i, o) => {
          const n = fbm(x * 5, y * 3 + t * p.speed * 1.6, t * p.speed * 0.7);
          const heat = clamp((n * 1.25 - (1 - y) * 0.75) * p.intensity + 0.15);
          gradient(pal, heat, o, false);
        };
      },
    },
    {
      id: 'ocean', name: 'Ozean', category: 'Natur', icon: 'waves',
      description: 'Tiefblaue Wellen mit glitzernden Schaumkronen.',
      params: [P.speed(0.6, 3), P.scale(1), P.colors(['#001d3d', '#003566', '#0077b6', '#48cae4', '#caf0f8'])],
      make(p) {
        const pal = p.colors.map(hex);
        return (x, y, t, i, o) => {
          const w = Math.sin(x * 6 * p.scale + t * p.speed) * 0.5 + Math.sin(x * 11 * p.scale - t * p.speed * 1.3 + y * 4) * 0.25;
          const n = noise3(x * 4 * p.scale, y * 4 * p.scale, t * p.speed * 0.5);
          gradient(pal, clamp(0.35 + w * 0.3 + n * 0.45 - y * 0.25), o, false);
        };
      },
    },
    {
      id: 'starfield', name: 'Sternenhimmel', category: 'Natur', icon: 'star',
      description: 'Zufällig funkelnde Sterne auf einem dunklen Hintergrund.',
      params: [P.color('bg', 'Hintergrund', '#05031a'), P.colors(['#ffffff', '#9bd1ff', '#ffd6f5'], 'Sternfarben'), P.speed(1, 4),
        { key: 'density', label: 'Dichte', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.35 }],
      make(p) {
        const bg = hex(p.bg), cols = p.colors.map(hex);
        return (x, y, t, i, o) => {
          const cx = Math.floor(x * 48), cy = Math.floor(y * 27);
          const h = hash(cx, cy);
          let b = 0, col = cols[0];
          if (h < p.density) {
            const ph = hash(cy, cx) * TAU;
            b = Math.pow(Math.max(0, Math.sin(t * p.speed * (0.6 + h * 2) + ph)), 12);
            col = cols[Math.floor(hash(cx + 3, cy + 7) * cols.length)];
          }
          o[0] = lerp(bg[0], col[0], b); o[1] = lerp(bg[1], col[1], b); o[2] = lerp(bg[2], col[2], b);
        };
      },
    },
    {
      id: 'plasma', name: 'Plasma', category: 'Psychedelisch', icon: 'blob',
      description: 'Klassischer Demoszene-Plasmaeffekt – hypnotisch.',
      params: [P.speed(0.8, 3), P.scale(1), { key: 'saturation', label: 'Sättigung', type: 'range', min: 0, max: 1, step: 0.01, default: 1 }],
      make(p) {
        return (x, y, t, i, o) => {
          const X = x * ASPECT * 6 * p.scale, Y = y * 6 * p.scale, T = t * p.speed;
          const v = Math.sin(X + T) + Math.sin((Y + T) * 0.5) + Math.sin((X + Y + T) * 0.5) +
            Math.sin(Math.sqrt((X - 5) * (X - 5) + (Y - 3) * (Y - 3)) + T);
          hsv(v / 4 + T * 0.05, p.saturation, 1, o);
        };
      },
    },
    {
      id: 'ripple', name: 'Wellenringe', category: 'Psychedelisch', icon: 'target',
      description: 'Ringe breiten sich von einem Punkt im Setup aus.',
      params: [P.colors(['#00f5d4', '#9b5de5', '#f15bb5']), P.speed(1, 4),
        { key: 'freq', label: 'Ringdichte', type: 'range', min: 1, max: 20, step: 0.5, default: 6 },
        { key: 'cx', label: 'Zentrum X', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
        { key: 'cy', label: 'Zentrum Y', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 }],
      make(p) {
        const cols = p.colors.map(hex);
        return (x, y, t, i, o) => {
          const dx = (x - p.cx) * ASPECT, dy = y - p.cy, d = Math.sqrt(dx * dx + dy * dy);
          gradient(cols, d * p.freq * 0.3 - t * p.speed * 0.4, o, true);
          const b = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(d * p.freq * TAU * 0.5 - t * p.speed * 3), 2);
          o[0] *= b; o[1] *= b; o[2] *= b;
        };
      },
    },
    {
      id: 'vortex', name: 'Hyper-Spirale', category: 'Psychedelisch', icon: 'spiral',
      description: 'Eine rotierende Regenbogen-Spirale in der Mitte deines Setups.',
      params: [P.speed(0.6, 3), { key: 'arms', label: 'Arme', type: 'range', min: 1, max: 8, step: 1, default: 3 },
        { key: 'twist', label: 'Verdrehung', type: 'range', min: 0, max: 10, step: 0.1, default: 3 }],
      make(p) {
        return (x, y, t, i, o) => {
          const dx = (x - 0.5) * ASPECT, dy = y - 0.5;
          const a = Math.atan2(dy, dx) / TAU, d = Math.sqrt(dx * dx + dy * dy);
          hsv(a * p.arms + d * p.twist - t * p.speed, 1, clamp(0.25 + d * 1.6), o);
        };
      },
    },
    {
      id: 'scanner', name: 'Scanner', category: 'Animation', icon: 'scan',
      description: 'Ein Lichtbalken gleitet hin und her (Knight-Rider-Style).',
      params: [P.color('color', 'Farbe', '#ff1744'), P.color('bg', 'Hintergrund', '#0a0000'), P.speed(1, 4),
        { key: 'width', label: 'Breite', type: 'range', min: 0.02, max: 0.5, step: 0.01, default: 0.12 },
        { key: 'vertical', label: 'Vertikal', type: 'bool', default: false }],
      make(p) {
        const c = hex(p.color), bg = hex(p.bg);
        return (x, y, t, i, o) => {
          const pos = 0.5 - 0.5 * Math.cos(t * p.speed * 1.5);
          const d = Math.abs((p.vertical ? y : x) - pos);
          const b = Math.exp(-(d * d) / (p.width * p.width * 0.5));
          o[0] = lerp(bg[0], c[0], b); o[1] = lerp(bg[1], c[1], b); o[2] = lerp(bg[2], c[2], b);
        };
      },
    },
    {
      id: 'matrix', name: 'Matrix-Regen', category: 'Animation', icon: 'code',
      description: 'Herabfallende digitale Zeichenspuren.',
      params: [P.color('color', 'Farbe', '#00ff66'), P.color('bg', 'Hintergrund', '#000a03'), P.speed(1, 4),
        { key: 'columns', label: 'Spalten', type: 'range', min: 8, max: 80, step: 1, default: 32 }],
      make(p) {
        const c = hex(p.color), bg = hex(p.bg);
        return (x, y, t, i, o) => {
          const col = Math.floor(x * p.columns);
          const sp = 0.4 + hash(col, 1) * 0.8;
          const head = fract(t * p.speed * sp * 0.35 + hash(col, 2)) * 1.6 - 0.2;
          const d = head - y;
          let b = d >= 0 ? Math.exp(-d * 6) : 0;
          if (d >= 0 && d < 0.035) b = 1.4; // heller Kopf
          o[0] = lerp(bg[0], Math.min(255, c[0] + (b > 1 ? 180 : 0)), Math.min(b, 1));
          o[1] = lerp(bg[1], c[1], Math.min(b, 1));
          o[2] = lerp(bg[2], Math.min(255, c[2] + (b > 1 ? 180 : 0)), Math.min(b, 1));
        };
      },
    },
    {
      id: 'police', name: 'Blaulicht', category: 'Animation', icon: 'siren',
      description: 'Abwechselnde Blitze in zwei Farben – links/rechts.',
      params: [P.color('a', 'Farbe links', '#ff0033'), P.color('b', 'Farbe rechts', '#0044ff'), P.speed(1, 3)],
      make(p) {
        const A = hex(p.a), B = hex(p.b);
        return (x, y, t, i, o) => {
          const ph = fract(t * p.speed * 1.2);
          const left = x < 0.5;
          const on = left ? (ph < 0.5 && fract(ph * 6) < 0.5) : (ph >= 0.5 && fract(ph * 6) < 0.5);
          const c = left ? A : B;
          o[0] = on ? c[0] : 0; o[1] = on ? c[1] : 0; o[2] = on ? c[2] : 0;
        };
      },
    },
    {
      id: 'heartbeat', name: 'Herzschlag', category: 'Animation', icon: 'heart',
      description: 'Doppelter Puls wie ein Herzschlag, von innen nach außen.',
      params: [P.color('color', 'Farbe', '#ff1f5a'), { key: 'bpm', label: 'BPM', type: 'range', min: 30, max: 180, step: 1, default: 70 }],
      make(p) {
        const c = hex(p.color);
        return (x, y, t, i, o) => {
          const dx = (x - 0.5) * ASPECT, dy = y - 0.5, d = Math.sqrt(dx * dx + dy * dy);
          const ph = fract(t * p.bpm / 60 - d * 0.35);
          const b = Math.max(Math.exp(-Math.pow((ph - 0.05) * 22, 2)), 0.7 * Math.exp(-Math.pow((ph - 0.25) * 22, 2)));
          const v = 0.06 + b * 0.94;
          o[0] = c[0] * v; o[1] = c[1] * v; o[2] = c[2] * v;
        };
      },
    },
    {
      id: 'candle', name: 'Kerzenschein', category: 'Natur', icon: 'candle',
      description: 'Warmes, unregelmäßiges Flackern – gemütlich.',
      params: [P.color('color', 'Farbe', '#ff8a1f'), { key: 'flicker', label: 'Flackern', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 }],
      make(p) {
        const c = hex(p.color);
        return (x, y, t, i, o) => {
          const n = fbm(x * 3, y * 3, t * 3);
          const b = 1 - p.flicker * 0.75 * n;
          o[0] = c[0] * b; o[1] = c[1] * b * (0.85 + 0.15 * n); o[2] = c[2] * b;
        };
      },
    },
    // ---------- Audio ----------
    {
      id: 'audio_spectrum', name: 'Audio-Spektrum', category: 'Audio', icon: 'bars', requires: ['audio'],
      description: 'Equalizer-Balken: Bass links, Höhen rechts – reagiert auf deinen PC-Sound.',
      params: [P.colors(['#00e676', '#ffea00', '#ff1744'], 'Pegel-Farben'), P.color('bg', 'Hintergrund', '#05010f'), P.sens(1.2),
        { key: 'mirror', label: 'Gespiegelt (Bass in der Mitte)', type: 'bool', default: false }],
      make(p) {
        const cols = p.colors.map(hex), bg = hex(p.bg);
        return (x, y, t, inp, o) => {
          const bands = inp && inp.audio && inp.audio.bands;
          const n = bands ? bands.length : 0;
          let lvl = 0;
          if (n) {
            const xx = p.mirror ? Math.abs(x - 0.5) * 2 : x;
            lvl = clamp(bands[Math.min(n - 1, Math.floor(xx * n))] * p.sensitivity);
          }
          const h = 1 - y;
          if (h <= lvl) { gradient(cols, h, o, false); }
          else { o[0] = bg[0]; o[1] = bg[1]; o[2] = bg[2]; }
        };
      },
    },
    {
      id: 'audio_pulse', name: 'Bass-Puls', category: 'Audio', icon: 'pulse', requires: ['audio'],
      description: 'Jeder Bass-Schlag lässt das ganze Setup aufleuchten.',
      params: [P.colors(['#ff00c8', '#00d0ff', '#7c4dff']), P.sens(1.5), P.speed(0.1, 1)],
      make(p) {
        const cols = p.colors.map(hex);
        return (x, y, t, inp, o) => {
          const bass = inp && inp.audio ? clamp(inp.audio.bass * p.sensitivity) : 0;
          gradient(cols, t * p.speed + x * 0.3, o, true);
          const b = 0.04 + Math.pow(bass, 1.5) * 0.96;
          o[0] *= b; o[1] *= b; o[2] *= b;
        };
      },
    },
    {
      id: 'audio_wave', name: 'Schallwelle', category: 'Audio', icon: 'target', requires: ['audio'],
      description: 'Lautstärke erzeugt Farbringe, die von der Mitte aus pulsieren.',
      params: [P.sens(1.3), P.speed(0.2, 2)],
      make(p) {
        return (x, y, t, inp, o) => {
          const lvl = inp && inp.audio ? clamp(inp.audio.level * p.sensitivity) : 0;
          const dx = (x - 0.5) * ASPECT, dy = y - 0.5, d = Math.sqrt(dx * dx + dy * dy) / 1.0;
          const edge = lvl * 1.05;
          const b = d < edge ? 1 - (d / Math.max(edge, 0.001)) * 0.6 : 0.03;
          hsv(t * p.speed + d * 0.8, 1, b, o);
        };
      },
    },
    // ---------- Bildschirm / System ----------
    {
      id: 'ambilight', name: 'Bildschirm-Sync', category: 'Ambilight', icon: 'monitor', requires: ['screen'],
      description: 'Übernimmt die Farben deines Bildschirms (Ambilight) – perfekt für Filme & Spiele.',
      params: [{ key: 'saturation', label: 'Farbverstärkung', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1.3 },
        { key: 'mode', label: 'Modus', type: 'select', default: 'map', options: [{ value: 'map', label: 'Position abbilden' }, { value: 'avg', label: 'Durchschnittsfarbe' }] }],
      make(p) {
        return (x, y, t, inp, o) => {
          const s = inp && inp.screen;
          if (!s || !s.data) { o[0] = o[1] = o[2] = 0; return; }
          let r, g, b;
          if (p.mode === 'avg') { r = s.avg[0]; g = s.avg[1]; b = s.avg[2]; }
          else {
            const px = Math.min(s.w - 1, Math.floor(x * s.w)), py = Math.min(s.h - 1, Math.floor(y * s.h));
            const k = (py * s.w + px) * 3; r = s.data[k]; g = s.data[k + 1]; b = s.data[k + 2];
          }
          const l = (r + g + b) / 3;
          o[0] = clamp(l + (r - l) * p.saturation, 0, 255); o[1] = clamp(l + (g - l) * p.saturation, 0, 255); o[2] = clamp(l + (b - l) * p.saturation, 0, 255);
        };
      },
    },
    {
      id: 'sysmon', name: 'System-Monitor', category: 'System', icon: 'cpu', requires: ['system'],
      description: 'Zeigt CPU- oder RAM-Auslastung als Farbe und Füllbalken.',
      params: [{ key: 'metric', label: 'Messwert', type: 'select', default: 'cpu', options: [{ value: 'cpu', label: 'CPU-Last' }, { value: 'mem', label: 'RAM-Auslastung' }] },
        P.colors(['#00e676', '#ffea00', '#ff1744'], 'Farbskala'), { key: 'bar', label: 'Als Füllbalken', type: 'bool', default: true }],
      make(p) {
        const cols = p.colors.map(hex), c = [0, 0, 0];
        return (x, y, t, inp, o) => {
          const v = inp && inp.system ? clamp(inp.system[p.metric] || 0) : 0;
          gradient(cols, v, c, false);
          const b = p.bar ? (x <= v ? 1 : 0.08) : 1;
          o[0] = c[0] * b; o[1] = c[1] * b; o[2] = c[2] * b;
        };
      },
    },
  ];

  const BY_ID = {};
  EFFECTS.forEach((e) => (BY_ID[e.id] = e));

  function defaults(effect) {
    const d = {};
    (effect.params || []).forEach((p) => (d[p.key] = Array.isArray(p.default) ? p.default.slice() : p.default));
    return d;
  }
  function withDefaults(effect, params) {
    const d = defaults(effect);
    if (params) for (const k in params) if (k in d && params[k] !== undefined && params[k] !== null) d[k] = params[k];
    if (Array.isArray(d.colors) && d.colors.length === 0) d.colors = ['#ffffff'];
    return d;
  }

  // ---------- Ebenen-Mischung (Effekt-Baukasten) ----------
  const BLEND = {
    normal: (a, b) => b,
    add: (a, b) => Math.min(255, a + b),
    screen: (a, b) => 255 - ((255 - a) * (255 - b)) / 255,
    multiply: (a, b) => (a * b) / 255,
    max: (a, b) => (a > b ? a : b),
    min: (a, b) => (a < b ? a : b),
    difference: (a, b) => Math.abs(a - b),
  };
  const BLEND_MODES = [
    { value: 'normal', label: 'Normal' }, { value: 'add', label: 'Addieren' }, { value: 'screen', label: 'Negativ multiplizieren' },
    { value: 'multiply', label: 'Multiplizieren' }, { value: 'max', label: 'Aufhellen' }, { value: 'min', label: 'Abdunkeln' },
    { value: 'difference', label: 'Differenz' },
  ];

  /**
   * Kompiliert eine Effekt-Beschreibung zu einer Render-Funktion.
   * spec: { type:'native', id, params } | { type:'layers', layers:[{id, params, blend, opacity, mask:{x0,x1,y0,y1}, enabled}] }
   */
  function compile(spec) {
    if (!spec) return compile({ type: 'native', id: 'rainbow' });
    if (spec.type === 'layers') {
      const layers = (spec.layers || []).filter((l) => l.enabled !== false && BY_ID[l.id]).map((l) => ({
        fn: BY_ID[l.id].make(withDefaults(BY_ID[l.id], l.params)),
        blend: BLEND[l.blend] || BLEND.normal,
        opacity: l.opacity === undefined ? 1 : clamp(l.opacity),
        mask: l.mask || null,
      }));
      const tmp = [0, 0, 0];
      return (x, y, t, inp, o) => {
        o[0] = o[1] = o[2] = 0;
        for (let k = 0; k < layers.length; k++) {
          const L = layers[k];
          if (L.mask && (x < L.mask.x0 || x > L.mask.x1 || y < L.mask.y0 || y > L.mask.y1)) continue;
          L.fn(x, y, t, inp, tmp);
          const a = L.opacity;
          o[0] = lerp(o[0], L.blend(o[0], tmp[0]), a);
          o[1] = lerp(o[1], L.blend(o[1], tmp[1]), a);
          o[2] = lerp(o[2], L.blend(o[2], tmp[2]), a);
        }
      };
    }
    const e = BY_ID[spec.id] || BY_ID.rainbow;
    return e.make(withDefaults(e, spec.params));
  }

  function requirements(spec) {
    const set = new Set();
    if (!spec) return [];
    if (spec.type === 'layers') (spec.layers || []).forEach((l) => l.enabled !== false && BY_ID[l.id] && (BY_ID[l.id].requires || []).forEach((r) => set.add(r)));
    else if (spec.type === 'canvas') { (spec.requires || ['audio']).forEach((r) => set.add(r)); }
    else if (BY_ID[spec.id]) (BY_ID[spec.id].requires || []).forEach((r) => set.add(r));
    return [...set];
  }

  return { ASPECT, EFFECTS, BY_ID, BLEND_MODES, compile, requirements, defaults, withDefaults, hex, toHex, hsv, gradient, clamp, noise3 };
});
