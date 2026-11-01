'use strict';
const EventEmitter = require('events');

/** Erzeugt LED-Positionen auf einer Linie (normiert 0..1). */
function linearLeds(n, y = 0.5) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: n === 1 ? 0.5 : i / (n - 1), y });
  return out;
}
/** Erzeugt LED-Positionen als Matrix (Zeilen zuerst). */
function matrixLeds(w, h) {
  const out = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push({ x: w === 1 ? 0.5 : c / (w - 1), y: h === 1 ? 0.5 : r / (h - 1) });
  return out;
}
/** Ring (z.B. Lüfter) */
function ringLeds(n) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; out.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5 }); }
  return out;
}
/** Normiert beliebige Punktwolken auf 0..1 */
function normalize(points) {
  if (!points.length) return points;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const w = x1 - x0 || 1, h = y1 - y0 || 1;
  return points.map((p) => ({ x: x1 === x0 ? 0.5 : (p.x - x0) / w, y: y1 === y0 ? 0.5 : (p.y - y0) / h }));
}

class Device {
  /**
   * @param {object} o id, name, vendor, type, leds:[{x,y}], driver, aspect, maxFps, info
   */
  constructor(o) {
    Object.assign(this, { vendor: '', type: 'other', aspect: null, maxFps: 60, info: {} }, o);
    this.ledCount = this.leds.length;
    this._busy = false;
    this._pending = null;
    this._lastSent = 0;
  }
  /** Vom Engine aufgerufen; verhindert Rückstau langsamer Geräte. */
  push(colors) {
    const now = Date.now();
    if (this._busy || now - this._lastSent < 1000 / this.maxFps) { this._pending = colors; this._schedule(); return; }
    this._send(colors);
  }
  _schedule() {
    if (this._timer) return;
    const wait = Math.max(5, 1000 / this.maxFps - (Date.now() - this._lastSent));
    this._timer = setTimeout(() => { this._timer = null; if (this._pending && !this._busy) { const c = this._pending; this._pending = null; this._send(c); } else if (this._pending) this._schedule(); }, wait);
  }
  async _send(colors) {
    this._busy = true; this._lastSent = Date.now();
    try { await this.write(colors); this.lastError = null; }
    catch (e) { this.lastError = e.message; }
    finally { this._busy = false; }
  }
  /** colors: Uint8Array r,g,b,r,g,b... */
  async write(colors) {}
  toJSON() {
    return { id: this.id, name: this.name, vendor: this.vendor, type: this.type, driver: this.driver, ledCount: this.ledCount, leds: this.leds, aspect: this.aspect, info: this.info, lastError: this.lastError || null };
  }
}

class Driver extends EventEmitter {
  constructor(config, log) {
    super();
    this.config = config || {};
    this.log = (lvl, msg) => log(lvl, `[${this.constructor.meta.name}] ${msg}`);
    this.devices = new Map();
    this.status = 'stopped';
    this.message = '';
  }
  setStatus(status, message = '') {
    if (this.status === status && this.message === message) return;
    this.status = status; this.message = message; this.emit('changed');
  }
  addDevice(d) { this.devices.set(d.id, d); this.emit('changed'); }
  removeDevice(id) { if (this.devices.delete(id)) this.emit('changed'); }
  clearDevices() { if (this.devices.size) { this.devices.clear(); this.emit('changed'); } }
  async start() {}
  async stop() {}
  /** Treiber-spezifische Aktionen aus der UI (z.B. Pairing) */
  async action(name, args) { throw new Error('Unbekannte Aktion: ' + name); }
  /** Zusätzliche Infos für die Diagnose */
  async diagnose() { return []; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url, opts = {}, timeout = 3000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    return text ? JSON.parse(text) : {};
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Zeitüberschreitung bei ' + url);
    throw e;
  } finally { clearTimeout(t); }
}

module.exports = { Driver, Device, linearLeds, matrixLeds, ringLeds, normalize, sleep, fetchJson };
