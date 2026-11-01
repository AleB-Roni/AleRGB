'use strict';
/**
 * Effekt-Bibliothek: native Effekte, Ebenen-Effekte (Baukasten) und HTML-Canvas-Effekte.
 *
 * HTML-Canvas-Format (kompatibel zu den meisten Community-„Lightscripts“, z.B. für SignalRGB):
 *   <head>
 *     <title>Mein Effekt</title>
 *     <meta description="..."/>  <meta publisher="..."/>
 *     <meta property="speed" label="Geschwindigkeit" type="number" min="1" max="10" default="5">
 *     <meta property="farbe" label="Farbe" type="color" default="#ff0000">
 *     <meta property="modus" label="Modus" type="combobox" values="A,B,C" default="A">
 *     <meta property="an" label="Schalter" type="boolean" default="1">
 *   </head>
 *   <body><canvas id="exCanvas" width="320" height="200"></canvas><script>…</script></body>
 * Properties stehen als globale Variablen zur Verfügung, on<Name>Changed() wird bei Änderungen aufgerufen,
 * Audio liegt in engine.audio (level, density, freq[200]).
 */
const fs = require('fs');
const path = require('path');
const FX = require('../shared/effects');

function attrs(s) {
  const o = {}; const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g; let m;
  while ((m = re.exec(s))) o[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5];
  return o;
}
function decode(s) { return String(s || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"); }

function parseHtmlEffect(html, fallbackName) {
  const meta = { params: [] };
  const t = /<title>([\s\S]*?)<\/title>/i.exec(html);
  meta.name = t ? decode(t[1].trim()) : fallbackName;
  const re = /<meta\b([^>]*)>/gi; let m;
  while ((m = re.exec(html))) {
    const a = attrs(m[1]);
    if (a.description && !a.property) meta.description = decode(a.description);
    if (a.publisher) meta.publisher = decode(a.publisher);
    if (a.property) {
      const type = (a.type || 'number').toLowerCase(); const key = a.property; const label = decode(a.label || key);
      let p;
      if (type === 'number' || type === 'hue') {
        const min = parseFloat(a.min ?? 0), max = parseFloat(a.max ?? (type === 'hue' ? 360 : 100));
        const step = a.step ? parseFloat(a.step) : (String(a.min).includes('.') || String(a.max).includes('.') ? (max - min) / 100 : 1);
        p = { key, label, type: 'range', min, max, step, default: parseFloat(a.default ?? min) };
      } else if (type === 'boolean') p = { key, label, type: 'bool', default: a.default === '1' || a.default === 'true' };
      else if (type === 'color') p = { key, label, type: 'color', default: a.default || '#ffffff' };
      else if (type === 'combobox' || type === 'list') {
        const vals = decode(a.values || '').split(',').map((s) => s.trim()).filter(Boolean);
        p = { key, label, type: 'select', options: vals.map((v) => ({ value: v, label: v })), default: a.default || vals[0] };
      } else p = { key, label, type: 'text', default: decode(a.default || '') };
      p.origType = type;
      meta.params.push(p);
    }
  }
  meta.usesAudio = /engine\.audio|AudioContext|getUserMedia/.test(html);
  meta.usesScreen = /engine\.vision|engine\.screen/.test(html);
  return meta;
}

class EffectLibrary {
  constructor(builtinDir, userDir, log) {
    this.builtinDir = builtinDir; this.userDir = userDir; this.log = log;
    fs.mkdirSync(userDir, { recursive: true });
    this.reload();
  }
  reload() {
    const list = [];
    for (const e of FX.EFFECTS) list.push({ key: 'native:' + e.id, type: 'native', id: e.id, name: e.name, category: e.category, description: e.description, params: e.params, requires: e.requires || [], source: 'builtin', icon: e.icon });
    const scan = (dir, source) => {
      let files = []; try { files = fs.readdirSync(dir); } catch {}
      for (const f of files) {
        const full = path.join(dir, f);
        try {
          if (/\.html?$/i.test(f)) {
            const html = fs.readFileSync(full, 'utf8');
            const meta = parseHtmlEffect(html, f.replace(/\.html?$/i, ''));
            list.push({ key: `canvas:${source}:${f}`, type: 'canvas', file: full, name: meta.name, category: source === 'builtin' ? 'Canvas' : 'Eigene & Importierte', description: meta.description || (meta.publisher ? 'von ' + meta.publisher : 'HTML-Canvas-Effekt'), publisher: meta.publisher, params: meta.params, requires: [...(meta.usesAudio ? ['audio'] : []), ...(meta.usesScreen ? ['screen'] : [])], source, editable: source === 'user' });
          } else if (/\.json$/i.test(f) && source === 'user') {
            const def = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (def.type !== 'layers') continue;
            const req = FX.requirements(def);
            list.push({ key: 'layers:' + f, type: 'layers', file: full, name: def.name || f, category: 'Eigene & Importierte', description: def.description || `${def.layers.length} Ebene(n)`, params: [], layers: def.layers, requires: req, source, editable: true });
          }
        } catch (e) { this.log('warn', `Effekt ${f} konnte nicht geladen werden: ${e.message}`); }
      }
    };
    scan(this.builtinDir, 'builtin');
    scan(this.userDir, 'user');
    this.list = list;
    this.byKey = Object.fromEntries(list.map((e) => [e.key, e]));
    return list;
  }
  get(key) { return this.byKey[key]; }
  safeName(name, ext) {
    const base = String(name || 'effekt').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'effekt';
    let f = base + ext, i = 2;
    while (fs.existsSync(path.join(this.userDir, f))) f = `${base}_${i++}${ext}`;
    return f;
  }
  validateHtml(html) {
    if (!/<canvas/i.test(html) && !/createElement\(\s*['"]canvas/i.test(html)) throw new Error('Keine <canvas> gefunden – das ist kein Canvas-Effekt.');
    if (html.length > 5 * 1024 * 1024) throw new Error('Datei zu groß.');
  }
  importHtml(html, nameHint) {
    this.validateHtml(html);
    const meta = parseHtmlEffect(html, nameHint);
    const f = this.safeName(meta.name || nameHint, '.html');
    fs.writeFileSync(path.join(this.userDir, f), html);
    this.reload();
    return 'canvas:user:' + f;
  }
  importFile(file) {
    const txt = fs.readFileSync(file, 'utf8');
    if (/\.json$/i.test(file)) {
      const def = JSON.parse(txt); if (def.type !== 'layers' || !Array.isArray(def.layers)) throw new Error('Unbekanntes JSON-Format.');
      return this.saveLayers(def);
    }
    return this.importHtml(txt, path.basename(file).replace(/\.html?$/i, ''));
  }
  async importUrl(url) {
    if (!/^https?:\/\//i.test(url)) throw new Error('Bitte eine http(s)-URL angeben.');
    // GitHub-Seiten automatisch auf Rohdatei umbiegen
    url = url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/$2/');
    const res = await fetch(url); if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/\.(html?|json)$/i, '');
    if (/^\s*\{/.test(txt)) { const def = JSON.parse(txt); return this.saveLayers(def); }
    return this.importHtml(txt, name);
  }
  saveCode(key, name, html) {
    this.validateHtml(html);
    let f;
    const ex = key && this.get(key);
    if (ex && ex.source === 'user' && ex.type === 'canvas') f = path.basename(ex.file);
    else f = this.safeName(name, '.html');
    fs.writeFileSync(path.join(this.userDir, f), html);
    this.reload();
    return 'canvas:user:' + f;
  }
  saveLayers(def, key) {
    const clean = { type: 'layers', name: def.name || 'Mein Effekt', description: def.description || '', layers: (def.layers || []).filter((l) => FX.BY_ID[l.id]).map((l) => ({ id: l.id, params: l.params || {}, blend: l.blend || 'normal', opacity: l.opacity ?? 1, enabled: l.enabled !== false, mask: l.mask || null })) };
    if (!clean.layers.length) throw new Error('Mindestens eine Ebene nötig.');
    const ex = key && this.get(key);
    const f = ex && ex.source === 'user' && ex.type === 'layers' ? path.basename(ex.file) : this.safeName(clean.name, '.json');
    fs.writeFileSync(path.join(this.userDir, f), JSON.stringify(clean, null, 2));
    this.reload();
    return 'layers:' + f;
  }
  getCode(key) { const e = this.get(key); if (!e || e.type !== 'canvas') throw new Error('Kein Canvas-Effekt'); return fs.readFileSync(e.file, 'utf8'); }
  remove(key) { const e = this.get(key); if (!e || e.source !== 'user') throw new Error('Nur eigene Effekte können gelöscht werden.'); fs.unlinkSync(e.file); this.reload(); }
  exportTo(key, dest) {
    const e = this.get(key); if (!e) throw new Error('Unbekannter Effekt');
    if (e.file) fs.copyFileSync(e.file, dest);
    else fs.writeFileSync(dest, JSON.stringify({ type: 'layers', name: e.name, layers: [{ id: e.id, params: {}, blend: 'normal', opacity: 1 }] }, null, 2));
  }
  publicList() { return this.list.map(({ file, ...rest }) => rest); }
}

module.exports = { EffectLibrary, parseHtmlEffect };
