'use strict';
/**
 * OpenRGB SDK-Client (TCP, Standardport 6742).
 * OpenRGB unterstützt hunderte Geräte direkt: ASUS Aura, MSI Mystic Light, Gigabyte RGB Fusion, ASRock,
 * Corsair, Razer, Logitech, SteelSeries, HyperX, NZXT, Cooler Master, Lian Li, RAM (G.Skill, Kingston,
 * Corsair, TeamGroup…), GPUs (ASUS, MSI, Gigabyte, EVGA, Zotac …) u.v.m.
 */
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');
const { Driver, Device, linearLeds, sleep } = require('./base');

const PKT = { COUNT: 0, DATA: 1, PROTO: 40, NAME: 50, LIST_UPDATED: 100, CUSTOM_MODE: 1100, UPDATE_LEDS: 1050 };
const CLIENT_PROTO = 3;
const TYPES = ['motherboard', 'ram', 'gpu', 'cooler', 'ledstrip', 'keyboard', 'mouse', 'mousepad', 'headset', 'headset', 'gamepad', 'light', 'speaker', 'virtual', 'storage', 'case', 'microphone', 'accessory', 'keypad', 'other'];

class Reader {
  constructor(b) { this.b = b; this.o = 0; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  str() { const n = this.u16(); const s = this.b.toString('utf8', this.o, this.o + Math.max(0, n - 1)); this.o += n; return s; }
  skip(n) { this.o += n; }
}

function parseController(buf, ver) {
  const r = new Reader(buf);
  r.u32(); // size
  const c = { type: r.i32(), name: r.str() };
  c.vendor = ver >= 1 ? r.str() : '';
  c.description = r.str(); c.version = r.str(); c.serial = r.str(); c.location = r.str();
  const nModes = r.u16(); c.activeMode = r.i32(); c.modes = [];
  for (let i = 0; i < nModes; i++) {
    const m = { name: r.str(), value: r.i32(), flags: r.u32() };
    r.skip(8); if (ver >= 3) r.skip(8); r.skip(8); // speed min/max, brightness min/max, colors min/max
    r.skip(4); if (ver >= 3) r.skip(4); r.skip(8); // speed, brightness, direction, color_mode
    const nc = r.u16(); r.skip(nc * 4);
    c.modes.push(m);
  }
  const nZones = r.u16(); c.zones = [];
  for (let i = 0; i < nZones; i++) {
    const z = { name: r.str(), type: r.i32() };
    z.min = r.u32(); z.max = r.u32(); z.count = r.u32();
    const mlen = r.u16();
    if (mlen > 0) {
      const h = r.u32(), w = r.u32(); const map = [];
      for (let k = 0; k < h * w; k++) map.push(r.u32());
      z.matrix = { w, h, map };
    }
    c.zones.push(z);
  }
  const nLeds = r.u16(); c.leds = [];
  for (let i = 0; i < nLeds; i++) { c.leds.push(r.str()); r.u32(); }
  return c;
}

/** Berechnet LED-Positionen: Matrix-Zonen exakt, lineare Zonen als Zeilen untereinander. */
function ledLayout(ctrl) {
  const pos = []; const zones = ctrl.zones.filter((z) => z.count > 0);
  const rows = zones.length || 1;
  zones.forEach((z, zi) => {
    const y0 = rows === 1 ? 0 : zi / rows, yh = rows === 1 ? 1 : 1 / rows;
    if (z.matrix && z.matrix.w * z.matrix.h > 0) {
      const tmp = new Array(z.count).fill(null);
      for (let r = 0; r < z.matrix.h; r++) for (let c = 0; c < z.matrix.w; c++) {
        const idx = z.matrix.map[r * z.matrix.w + c];
        if (idx !== 0xffffffff && idx < z.count) tmp[idx] = { x: z.matrix.w === 1 ? 0.5 : c / (z.matrix.w - 1), y: y0 + (z.matrix.h === 1 ? 0.5 : r / (z.matrix.h - 1)) * yh };
      }
      tmp.forEach((p, i) => pos.push(p || { x: i / Math.max(1, z.count - 1), y: y0 + yh / 2 }));
    } else {
      linearLeds(z.count, y0 + yh / 2).forEach((p) => pos.push(p));
    }
  });
  return pos;
}

class OpenRGBClient {
  constructor(log) { this.log = log; this.buf = Buffer.alloc(0); this.waiters = []; this.onListUpdated = null; this.onClose = null; }
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host, port });
      s.setNoDelay(true);
      const to = setTimeout(() => { s.destroy(); reject(new Error('Zeitüberschreitung')); }, 2500);
      s.once('connect', () => { clearTimeout(to); this.sock = s; resolve(); });
      s.once('error', (e) => { clearTimeout(to); reject(e); });
      s.on('data', (d) => this._data(d));
      s.on('close', () => { this.sock = null; this.waiters.forEach((w) => w.reject(new Error('Verbindung getrennt'))); this.waiters = []; this.onClose && this.onClose(); });
    });
  }
  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 16) {
      if (this.buf.toString('ascii', 0, 4) !== 'ORGB') { this.buf = Buffer.alloc(0); return; }
      const dev = this.buf.readUInt32LE(4), id = this.buf.readUInt32LE(8), size = this.buf.readUInt32LE(12);
      if (this.buf.length < 16 + size) return;
      const body = this.buf.subarray(16, 16 + size); this.buf = this.buf.subarray(16 + size);
      if (id === PKT.LIST_UPDATED) { this.onListUpdated && this.onListUpdated(); continue; }
      const i = this.waiters.findIndex((w) => w.id === id && w.dev === dev);
      if (i >= 0) { const w = this.waiters.splice(i, 1)[0]; clearTimeout(w.to); w.resolve(Buffer.from(body)); }
    }
  }
  send(dev, id, payload = Buffer.alloc(0)) {
    if (!this.sock) return false;
    const h = Buffer.alloc(16); h.write('ORGB', 0, 'ascii'); h.writeUInt32LE(dev, 4); h.writeUInt32LE(id, 8); h.writeUInt32LE(payload.length, 12);
    this.sock.write(Buffer.concat([h, payload]));
    return true;
  }
  request(dev, id, payload, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const w = { dev, id, resolve, reject };
      w.to = setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); reject(new Error('Keine Antwort (Paket ' + id + ')')); }, timeout);
      this.waiters.push(w);
      if (!this.send(dev, id, payload)) { clearTimeout(w.to); reject(new Error('Nicht verbunden')); }
    });
  }
  close() { if (this.sock) this.sock.destroy(); }
}

class OpenRGBDevice extends Device {
  constructor(o, client, index) { super(o); this.client = client; this.index = index; }
  async write(c) {
    const n = this.ledCount;
    const p = Buffer.alloc(4 + 2 + n * 4);
    p.writeUInt32LE(p.length, 0); p.writeUInt16LE(n, 4);
    for (let i = 0; i < n; i++) { p[6 + i * 4] = c[i * 3]; p[7 + i * 4] = c[i * 3 + 1]; p[8 + i * 4] = c[i * 3 + 2]; }
    this.client.send(this.index, PKT.UPDATE_LEDS, p);
  }
}

class OpenRGBDriver extends Driver {
  static meta = {
    id: 'openrgb', name: 'OpenRGB', vendor: 'Viele Hersteller',
    description: 'Universal-Treiber: Mainboards (ASUS, MSI, Gigabyte, ASRock), RAM, Grafikkarten, Lüfter-Controller, Tastaturen, Mäuse und mehr. Benötigt OpenRGB mit aktiviertem SDK-Server.',
    help: 'OpenRGB von openrgb.org laden, starten, Tab „SDK Server“ → „Start Server“. Tipp: In OpenRGB unter Einstellungen „Start at login“ + „Start Server“ + „Start minimized“ aktivieren, oder unten den Pfad zu OpenRGB.exe eintragen – dann startet Spectra es automatisch.',
    defaultEnabled: true,
    fields: [
      { key: 'host', label: 'Host', type: 'text', default: '127.0.0.1' },
      { key: 'port', label: 'Port', type: 'number', default: 6742 },
      { key: 'exePath', label: 'Pfad zu OpenRGB.exe (optional, Autostart)', type: 'file', default: '' },
    ],
  };
  async start() {
    this.stopped = false;
    this._loop();
  }
  async _loop() {
    let launched = false;
    while (!this.stopped) {
      try {
        await this._connect();
        return;
      } catch (e) {
        if (!launched && this.config.exePath && fs.existsSync(this.config.exePath)) {
          launched = true;
          this.log('info', 'Starte OpenRGB: ' + this.config.exePath);
          try { spawn(this.config.exePath, ['--server', '--startminimized'], { detached: true, stdio: 'ignore' }).unref(); } catch (err) { this.log('warn', err.message); }
          this.setStatus('connecting', 'OpenRGB wird gestartet …');
          await sleep(6000); continue;
        }
        this.setStatus('error', `Kein OpenRGB-Server auf ${this.config.host}:${this.config.port} (${e.code || e.message}). Neuer Versuch in 5 s.`);
        await sleep(5000);
      }
    }
  }
  async _connect() {
    this.setStatus('connecting', 'Verbinde …');
    const c = new OpenRGBClient(this.log);
    await c.connect(this.config.host || '127.0.0.1', Number(this.config.port) || 6742);
    this.client = c;
    let ver = 0;
    try { const b = await c.request(0, PKT.PROTO, u32(CLIENT_PROTO), 1000); ver = Math.min(CLIENT_PROTO, b.readUInt32LE(0)); } catch { ver = 0; }
    this.proto = ver;
    const name = Buffer.from('Spectra RGB\0'); c.send(0, PKT.NAME, name);
    c.onListUpdated = () => { clearTimeout(this._relist); this._relist = setTimeout(() => this._enumerate().catch((e) => this.log('warn', e.message)), 500); };
    c.onClose = () => { this.clearDevices(); if (!this.stopped) { this.setStatus('error', 'Verbindung zu OpenRGB verloren – verbinde neu …'); setTimeout(() => this._loop(), 3000); } };
    await this._enumerate();
  }
  async _enumerate() {
    const c = this.client;
    const n = (await c.request(0, PKT.COUNT)).readUInt32LE(0);
    this.devices.clear();
    this.empty = [];
    for (let i = 0; i < n; i++) {
      const data = await c.request(i, PKT.DATA, this.proto > 0 ? u32(this.proto) : Buffer.alloc(0), 5000);
      const ctrl = parseController(data, this.proto);
      const leds = ledLayout(ctrl);
      if (!leds.length) { this.empty.push(ctrl.name); continue; }
      c.send(i, PKT.CUSTOM_MODE);
      const hasMatrix = ctrl.zones.find((z) => z.matrix);
      const dev = new OpenRGBDevice({
        id: `openrgb:${(ctrl.serial || ctrl.location || ctrl.name).replace(/\s+/g, '_')}:${i}`,
        name: ctrl.name, vendor: ctrl.vendor || 'OpenRGB', type: TYPES[ctrl.type] || 'other', driver: 'openrgb', leds,
        aspect: hasMatrix ? hasMatrix.matrix.w / Math.max(1, hasMatrix.matrix.h) / 1.2 : null,
        maxFps: 60, info: { location: ctrl.location, zones: ctrl.zones.map((z) => `${z.name} (${z.count})`), modes: ctrl.modes.map((m) => m.name) },
      }, c, i);
      this.devices.set(dev.id, dev);
    }
    this.setStatus('ok', `${this.devices.size} Gerät(e) über OpenRGB (Protokoll v${this.proto})` + (this.empty.length ? ` · ${this.empty.length} ohne LEDs` : ''));
    this.emit('changed');
  }
  async stop() { this.stopped = true; clearTimeout(this._relist); if (this.client) { this.client.onClose = null; this.client.close(); } this.clearDevices(); this.setStatus('stopped'); }
  async diagnose() {
    const out = [];
    if (this.empty && this.empty.length) out.push({ level: 'warn', text: `Diese Geräte haben 0 LEDs konfiguriert: ${this.empty.join(', ')}. In OpenRGB bei der Zone „Resize“ die Anzahl der LEDs deines ARGB-Strips/Lüfters eintragen.` });
    return out;
  }
}
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }

module.exports = OpenRGBDriver;
module.exports._test = { parseController, ledLayout };
