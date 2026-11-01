'use strict';
/**
 * Geräteverwaltung + Render-Engine.
 * Jedes Gerät hat ein Rechteck auf der gemeinsamen Leinwand (16:9, normiert). Die LEDs werden dort
 * positioniert, sodass Effekte über alle Geräte hinweg synchron laufen (wie bei SignalRGB/Canvas-Layouts).
 */
const EventEmitter = require('events');
const os = require('os');
const FX = require('../shared/effects');
const DRIVERS = require('./drivers');

const PREVIEW_W = 64, PREVIEW_H = 36;

class Core extends EventEmitter {
  constructor(config, library, canvasHost, log) {
    super();
    this.config = config; this.library = library; this.canvas = canvasHost; this.log = log;
    this.drivers = new Map();
    this.inputs = { audio: null, screen: null, system: { cpu: 0, mem: 0 } };
    this.identify = new Map();
    this.blackout = false;
    this.compiled = new Map();
    this.t0 = Date.now();
    this._cpuPrev = os.cpus();
    this.frameBuffers = new Map();
  }

  // ---------------- Treiber ----------------
  driverConfig(meta) {
    const all = this.config.get('drivers');
    const c = all[meta.id] || {};
    const d = { enabled: meta.defaultEnabled };
    for (const f of meta.fields || []) d[f.key] = f.default;
    return { ...d, ...c };
  }
  async startDrivers(opts = {}) {
    for (const D of DRIVERS) {
      const cfg = this.driverConfig(D.meta);
      if (opts.demo && D.meta.id === 'simulator') cfg.enabled = true;
      const drv = new D(cfg, this.log);
      drv.on('changed', () => this._devicesChanged());
      this.drivers.set(D.meta.id, drv);
      if (cfg.enabled) this._startDriver(drv);
    }
  }
  _startDriver(drv) {
    drv.setStatus('connecting', 'Startet …');
    Promise.resolve().then(() => drv.start()).catch((e) => { drv.setStatus('error', e.message); this.log('error', `${drv.constructor.meta.name}: ${e.message}`); });
  }
  async updateDriver(id, patch) {
    const drv = this.drivers.get(id); if (!drv) throw new Error('Unbekannter Treiber');
    const all = this.config.get('drivers');
    all[id] = { ...this.driverConfig(drv.constructor.meta), ...patch };
    this.config.set('drivers', all);
    await this.restartDriver(id);
  }
  async restartDriver(id) {
    const old = this.drivers.get(id); const D = old.constructor;
    await old.stop().catch(() => {}); old.removeAllListeners();
    const cfg = this.driverConfig(D.meta);
    const drv = new D(cfg, this.log);
    drv.on('changed', () => this._devicesChanged());
    this.drivers.set(id, drv);
    if (cfg.enabled) this._startDriver(drv); else drv.setStatus('disabled', 'Deaktiviert');
    this._devicesChanged();
  }
  async driverAction(id, action, args) {
    const drv = this.drivers.get(id);
    const res = await drv.action(action, args);
    if (res && res.patch) await this.updateDriver(id, { ...this.driverConfig(drv.constructor.meta), ...res.patch });
    return res;
  }
  async stopAll() {
    if (this.config.get('settings').offOnExit) { this.blackout = true; this.renderFrame(); await new Promise((r) => setTimeout(r, 150)); }
    await Promise.all([...this.drivers.values()].map((d) => d.stop().catch(() => {})));
  }

  // ---------------- Geräte ----------------
  allDevices() { const out = []; for (const d of this.drivers.values()) for (const dev of d.devices.values()) out.push(dev); return out; }
  deviceSettings(dev) {
    const all = this.config.get('devices');
    if (!all[dev.id]) { all[dev.id] = { enabled: true, brightness: 100, rect: null, override: null }; this.config.save(); }
    const s = all[dev.id];
    if (!s.rect) { s.rect = this._autoRect(dev); this.config.save(); }
    return s;
  }
  _autoRect(dev, slot) {
    // Sinnvolle Startposition je nach Gerätetyp
    const t = dev.type;
    const a = dev.aspect || (dev.leds.length > 1 && dev.leds.every((p) => p.y === dev.leds[0].y) ? 30 : 1.5);
    const place = {
      keyboard: [0.22, 0.62, 0.42], mouse: [0.7, 0.66, 0.06], mousepad: [0.18, 0.55, 0.62], headset: [0.82, 0.55, 0.1],
      ledstrip: [0.05, 0.06, 0.9], motherboard: [0.4, 0.2, 0.2], ram: [0.6, 0.16, 0.025], gpu: [0.35, 0.42, 0.3],
      fan: [0.06, 0.16, 0.11], cooler: [0.45, 0.25, 0.1], light: [0.88, 0.1, 0.08], panels: [0.6, 0.05, 0.3], matrix: [0.6, 0.05, 0.3],
    }[t] || [0.4, 0.4, 0.15];
    const sameType = this.allDevices().filter((d) => d.type === t);
    const idx = Math.max(0, sameType.indexOf(dev));
    const w = place[2], h = Math.min(0.9, (w * FX.ASPECT) / a);
    let x = place[0] + idx * (w + (t === 'ram' ? 0.05 : 0.02)), y = place[1];
    if (x + w > 1) { x = 0.05 + ((x + w) % 0.9); y = Math.min(0.9, y + h + 0.02); }
    return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
  }
  updateDevice(id, patch) {
    const all = this.config.get('devices');
    all[id] = { ...(all[id] || {}), ...patch };
    this.config.set('devices', all);
    if ('override' in patch) this.compiled.delete('dev:' + id);
    this.emit('state');
  }
  autoLayout() {
    const all = this.config.get('devices');
    const devs = this.allDevices();
    devs.forEach((d) => { if (all[d.id]) all[d.id].rect = null; });
    devs.forEach((d) => { all[d.id] = all[d.id] || { enabled: true, brightness: 100 }; all[d.id].rect = this._autoRect(d); });
    this.config.set('devices', all); this.emit('state');
  }
  identifyDevice(id) { this.identify.set(id, Date.now() + 3000); }
  _devicesChanged() { clearTimeout(this._dc); this._dc = setTimeout(() => this.emit('state'), 50); }

  // ---------------- Effekte ----------------
  setEffect(spec) {
    const cur = this.config.get('effect');
    const key = spec.key || cur.key;
    const entry = this.library.get(key);
    if (!entry) throw new Error('Unbekannter Effekt: ' + key);
    const remembered = this.config.get('effectParams')[key] || {};
    const params = spec.params !== undefined ? { ...remembered, ...spec.params } : key === cur.key ? cur.params : remembered;
    this.config.set('effect', { key, params });
    this.config.get('effectParams')[key] = params; this.config.save();
    this._applyEffect();
    this.emit('state');
  }
  _applyEffect() {
    const { key, params } = this.config.get('effect');
    const e = this.library.get(key) || this.library.get('native:aurora');
    this.compiled.delete('global');
    if (e.type === 'canvas') {
      const props = {};
      for (const p of e.params) props[p.key] = params[p.key] !== undefined ? params[p.key] : p.default;
      if (this._canvasKey !== key || this._canvasMtime !== e.mtime) { this.canvas.load({ file: e.file, props }); this._canvasKey = key; }
      else this.canvas.setProps(props);
    } else if (this._canvasKey && !this._previewing) { this.canvas.unload(); this._canvasKey = null; }
  }
  /** Live-Vorschau für den Code-Editor (ohne zu speichern). */
  previewCode(html, props) {
    this._previewing = true; this._previewLayers = null; this._canvasKey = '__preview__';
    this.canvas.load({ html, props: props || {}, baseDir: this.library.userDir });
    this.compiled.delete('global');
  }
  /** Live-Vorschau für den Baukasten (ohne zu speichern). */
  previewLayers(def) {
    if (this._previewing) { this._previewing = false; this._canvasKey = null; this.canvas.unload(); }
    this._previewLayers = def; this.compiled.delete('global');
  }
  endPreview() { if (this._previewing) this.canvas.unload(); this._previewing = false; this._previewLayers = null; this._canvasKey = null; this._applyEffect(); }
  activeRequirements() {
    if (this._previewing) return ['audio'];
    const req = new Set();
    const add = (spec) => FX.requirements(spec).forEach((r) => req.add(r));
    if (this._previewLayers) add(this._previewLayers);
    const { key } = this.config.get('effect'); const e = this.library.get(key);
    if (e) (e.requires || []).forEach((r) => req.add(r));
    for (const s of Object.values(this.config.get('devices'))) if (s.override && s.override.type === 'native') add({ type: 'native', id: s.override.id });
    return [...req];
  }
  _fnFor(cacheKey, specFn) {
    let f = this.compiled.get(cacheKey);
    if (!f) { f = specFn(); this.compiled.set(cacheKey, f); }
    return f;
  }
  _globalFn() {
    return this._fnFor('global', () => {
      if (this._previewLayers) return FX.compile(this._previewLayers);
      if (this._previewing) return (x, y, t, i, o) => this.canvas.sample(x, y, o);
      const { key, params } = this.config.get('effect');
      const e = this.library.get(key);
      if (!e) return FX.compile(null);
      if (e.type === 'canvas') return (x, y, t, i, o) => this.canvas.sample(x, y, o);
      if (e.type === 'layers') return FX.compile({ type: 'layers', layers: e.layers });
      return FX.compile({ type: 'native', id: e.id, params });
    });
  }

  // ---------------- Render-Schleife ----------------
  start() {
    const loop = () => {
      const fps = clamp(this.config.get('settings').fps || 30, 5, 120);
      this._timer = setTimeout(loop, 1000 / fps);
      try { this.renderFrame(); } catch (e) { this.log('error', 'Render: ' + e.stack); }
    };
    loop();
    this._sys = setInterval(() => this._sampleSystem(), 1000);
    this._prev = setInterval(() => this.emit('preview', this._previewPayload()), 66);
  }
  stop() { clearTimeout(this._timer); clearInterval(this._sys); clearInterval(this._prev); }
  _sampleSystem() {
    const now = os.cpus(); let idle = 0, total = 0;
    now.forEach((c, i) => { const p = this._cpuPrev[i] || c; for (const k in c.times) total += c.times[k] - p.times[k]; idle += c.times.idle - p.times.idle; });
    this._cpuPrev = now;
    const cpu = total ? 1 - idle / total : 0;
    this.inputs.system = { cpu: this.inputs.system.cpu * 0.5 + cpu * 0.5, mem: 1 - os.freemem() / os.totalmem() };
  }
  renderFrame() {
    const t = (Date.now() - this.t0) / 1000;
    const st = this.config.get('settings');
    const power = st.power && !this.blackout;
    const gb = (st.brightness ?? 100) / 100;
    const g = this._globalFn();
    const o = [0, 0, 0];
    const now = Date.now();
    this.lastColors = this.lastColors || new Map();
    for (const dev of this.allDevices()) {
      const s = this.deviceSettings(dev);
      let buf = this.frameBuffers.get(dev.id);
      if (!buf || buf.length !== dev.ledCount * 3) { buf = new Uint8Array(dev.ledCount * 3); this.frameBuffers.set(dev.id, buf); }
      const ident = this.identify.get(dev.id);
      if (!s.enabled) { if (!dev._wasOff) { buf.fill(0); dev.push(buf); dev._wasOff = true; } continue; }
      dev._wasOff = false;
      let fn = g;
      if (s.override) {
        fn = this._fnFor('dev:' + dev.id, () => s.override.type === 'static' ? FX.compile({ type: 'native', id: 'static', params: { color: s.override.color } }) : FX.compile({ type: 'native', id: s.override.id, params: s.override.params }));
      }
      const b = gb * (s.brightness ?? 100) / 100;
      const r = s.rect;
      for (let i = 0; i < dev.ledCount; i++) {
        const p = dev.leds[i];
        if (!power) { o[0] = o[1] = o[2] = 0; }
        else if (ident && ident > now) { const on = Math.floor(now / 250) % 2 === 0; o[0] = o[1] = o[2] = on ? 255 : 0; }
        else fn(r.x + p.x * r.w, r.y + p.y * r.h, t, this.inputs, o);
        buf[i * 3] = clamp(o[0] * b, 0, 255); buf[i * 3 + 1] = clamp(o[1] * b, 0, 255); buf[i * 3 + 2] = clamp(o[2] * b, 0, 255);
      }
      dev.push(buf);
    }
    this._lastT = t;
  }
  _previewPayload() {
    // Leinwand-Vorschau des globalen Effekts + aktuelle Gerätefarben (gedrosselt)
    const g = this._globalFn(); const t = this._lastT || 0; const o = [0, 0, 0];
    const st = this.config.get('settings'); const on = st.power && !this.blackout; const b = (st.brightness ?? 100) / 100;
    const img = new Uint8Array(PREVIEW_W * PREVIEW_H * 3);
    if (on) for (let y = 0; y < PREVIEW_H; y++) for (let x = 0; x < PREVIEW_W; x++) {
      g(x / (PREVIEW_W - 1), y / (PREVIEW_H - 1), t, this.inputs, o);
      const k = (y * PREVIEW_W + x) * 3; img[k] = clamp(o[0] * b, 0, 255); img[k + 1] = clamp(o[1] * b, 0, 255); img[k + 2] = clamp(o[2] * b, 0, 255);
    }
    const devices = {};
    for (const [id, buf] of this.frameBuffers) devices[id] = Buffer.from(buf).toString('base64');
    return { w: PREVIEW_W, h: PREVIEW_H, img: Buffer.from(img).toString('base64'), devices, system: this.inputs.system };
  }

  // ---------------- Profile ----------------
  saveProfile(name, id) {
    const profiles = this.config.get('profiles');
    const snap = { effect: this.config.get('effect'), devices: JSON.parse(JSON.stringify(this.config.get('devices'))), brightness: this.config.get('settings').brightness };
    let p = id && profiles.find((x) => x.id === id);
    if (p) Object.assign(p, snap, name ? { name } : {});
    else { p = { id: 'p' + Date.now().toString(36), name: name || 'Profil ' + (profiles.length + 1), ...snap }; profiles.push(p); }
    this.config.set('profiles', profiles); this.config.set('activeProfile', p.id); this.emit('state');
    return p.id;
  }
  applyProfile(id) {
    const p = this.config.get('profiles').find((x) => x.id === id); if (!p) return;
    const devs = this.config.get('devices');
    for (const k in p.devices) devs[k] = { ...(devs[k] || {}), ...p.devices[k] };
    this.config.set('devices', devs);
    this.config.get('settings').brightness = p.brightness ?? 100;
    this.config.set('activeProfile', id);
    this.compiled.clear();
    if (this.library.get(p.effect.key)) { this.config.set('effect', p.effect); this._applyEffect(); }
    this.emit('state');
  }
  cycleProfile(dir = 1) {
    const ps = this.config.get('profiles'); if (!ps.length) return;
    const i = ps.findIndex((p) => p.id === this.config.get('activeProfile'));
    this.applyProfile(ps[(i + dir + ps.length) % ps.length].id);
  }
  deleteProfile(id) { this.config.set('profiles', this.config.get('profiles').filter((p) => p.id !== id)); this.emit('state'); }
  renameProfile(id, name) { const p = this.config.get('profiles').find((x) => x.id === id); if (p) { p.name = name; this.config.save(); this.emit('state'); } }

  // ---------------- Zustand für die UI ----------------
  state() {
    return {
      devices: this.allDevices().map((d) => ({ ...d.toJSON(), settings: this.deviceSettings(d) })),
      drivers: [...this.drivers.values()].map((d) => ({ ...d.constructor.meta, status: d.status, message: d.message, config: d.config, deviceCount: d.devices.size })),
      settings: this.config.get('settings'),
      effect: this.config.get('effect'),
      effects: this.library.publicList(),
      profiles: this.config.get('profiles').map(({ id, name, effect }) => ({ id, name, effect: effect.key })),
      activeProfile: this.config.get('activeProfile'),
      requirements: this.activeRequirements(),
      blend: FX.BLEND_MODES,
    };
  }
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
module.exports = Core;
