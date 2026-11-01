'use strict';
/**
 * NZXT Kraken (X3 / Z3 / 2023 / 2023 Elite / 2024 Elite / 2024 Plus) – direkt per USB.
 * LCD: Helligkeit, Drehung, Bild, GIF, Flüssigkeitstemperatur · Pumpe & Lüfter: Kurven / feste Drehzahl · Messwerte.
 *
 * Protokoll nach liquidctl (liquidctl/driver/kraken3.py, GPL-3.0-or-later,
 * Tom Frey, Jonas Malaco, Shady Nawara und Mitwirkende). Eigene JavaScript-Implementierung.
 *   HID: 64-Byte-Reports, Antworten haben als erstes Byte Befehl + 1.
 *   Bilddaten: USB-Bulk-Endpoint 0x02 (Header 0x12 0xFA 0x01 0xE8 0xAB … + Typ + Länge).
 */
const EventEmitter = require('events');
let HID = null, usb = null;
try { HID = require('node-hid'); } catch {}
try { usb = require('usb'); } catch {}

const VID = 0x1e71;
const LCD_TOTAL_MEMORY = 24320; // in 1-KB-Blöcken
const MODELS = {
  0x2007: { name: 'NZXT Kraken X (X53/X63/X73)', family: 'x' },
  0x2014: { name: 'NZXT Kraken X (X53/X63/X73)', family: 'x' },
  0x3008: { name: 'NZXT Kraken Z (Z53/Z63/Z73)', family: 'z', res: 320, chunk: 512 },
  0x300c: { name: 'NZXT Kraken 2023 Elite', family: 'k23', res: 640, chunk: 2 * 1024 * 1024 },
  0x300e: { name: 'NZXT Kraken 2023', family: 'k23', res: 240, chunk: 2 * 1024 * 1024 },
  0x3012: { name: 'NZXT Kraken 2024 Elite RGB', family: 'k23', res: 640, chunk: 2 * 1024 * 1024 },
  0x3014: { name: 'NZXT Kraken 2024 Plus', family: 'k23', res: 240, chunk: 2 * 1024 * 1024 },
};
const SPEED = {
  x: { pump: [0x1, 0x0, 0x0] },
  z: { pump: [0x1, 0x0, 0x0], fan: [0x2, 0x0, 0x0] },
  k23: { pump: [0x1, 0x1, 0x0], fan: [0x2, 0x1, 0x1] },
};
const MIN_DUTY = { pump: 20, fan: 0 };
const CRITICAL = 59;

/** Lüfter-/Pumpenkurven (Temperatur °C → Leistung %) */
const PRESETS = {
  silent: { label: 'Leise', pump: [[20, 30], [35, 40], [45, 60], [55, 100]], fan: [[20, 20], [35, 30], [45, 50], [55, 100]] },
  balanced: { label: 'Ausgewogen', pump: [[20, 50], [35, 60], [45, 80], [55, 100]], fan: [[20, 30], [35, 45], [45, 70], [55, 100]] },
  performance: { label: 'Leistung', pump: [[20, 70], [35, 80], [45, 100], [55, 100]], fan: [[20, 50], [35, 65], [45, 90], [55, 100]] },
};

/** 40 Stützwerte für 20–59 °C aus einer Kurve; ab der kritischen Temperatur immer 100 % */
function curveDuties(points, min) {
  const pts = points.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let t = 20; t <= CRITICAL; t++) {
    let d;
    if (t >= CRITICAL) d = 100;
    else if (t <= pts[0][0]) d = pts[0][1];
    else if (t >= pts[pts.length - 1][0]) d = pts[pts.length - 1][1];
    else { const i = pts.findIndex((p) => p[0] >= t); const a = pts[i - 1], b = pts[i]; d = a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]); }
    out.push(Math.round(Math.max(min, Math.min(100, d))));
  }
  return out;
}

class Kraken extends EventEmitter {
  constructor(log) {
    super();
    this.log = log; this.hid = null; this.model = null; this.queue = Promise.resolve();
    this.status = null; this.lcd = null; this.fw = null; this.error = null;
  }

  // ---------------- Verbindung ----------------
  static find() {
    if (!HID) return null;
    return HID.devices().find((d) => d.vendorId === VID && MODELS[d.productId]) || null;
  }
  async connect() {
    if (!HID) { this.error = 'USB-HID-Modul fehlt'; return false; }
    const info = Kraken.find();
    if (!info) { this.error = null; return false; }
    try { this.hid = await HID.HIDAsync.open(info.path); }
    catch (e) { this.error = `Kraken gefunden, aber belegt (${e.message}). Bitte NZXT CAM beenden.`; return false; }
    this.info = info; this.pid = info.productId; this.model = MODELS[info.productId];
    this.hid.on('error', () => this._lost());
    try { await this.run(() => this._init()); this.error = null; }
    catch (e) { this.error = 'Initialisierung fehlgeschlagen: ' + e.message; }
    this.log('info', `${this.model.name} verbunden (Firmware ${this.fw ? this.fw.join('.') : '?'})`);
    return true;
  }
  _lost() { if (!this.hid) return; this.log('warn', 'Kraken getrennt'); this.hid = null; this.status = null; this.emit('changed'); }
  async close() { try { await this.closeBulk(); } catch {} try { this.hid && (await this.hid.close()); } catch {} this.hid = null; }
  get connected() { return !!this.hid; }
  get hasLcd() { return !!(this.model && this.model.res); }

  /** Befehle strikt nacheinander ausführen (Antworten würden sich sonst vermischen) */
  run(fn) { const p = this.queue.then(fn, fn); this.queue = p.catch(() => {}); return p; }

  // ---------------- HID ----------------
  async write(data) { const b = Buffer.alloc(64); Buffer.from(data).copy(b); await this.hid.write(b); }
  async read(timeout = 1000) { const d = await this.hid.read(timeout); return d && d.length ? [...d] : null; }
  async readUntil(match, attempts = 12) {
    for (let i = 0; i < attempts; i++) { const m = await this.read(); if (m && match(m)) return m; }
    throw new Error('Keine Antwort vom Gerät');
  }
  /** Schreibt und wartet auf die passende Antwort (erstes Byte = Befehl + 1; Status-Reports 0x75 werden übersprungen) */
  async request(data) { await this.write(data); return this.readUntil((m) => m[0] === data[0] + 1); }
  async clear() { for (let i = 0; i < 64; i++) if (!(await this.read(5))) return; }

  async _init() {
    await this.clear();
    await this.write([0x70, 0x02, 0x01, 0xb8, 0x01]); // Status-Intervall 0,5 s
    await this.write([0x70, 0x01]);
    const fw = await this.request([0x10, 0x01]);
    this.fw = [fw[0x11], fw[0x12], fw[0x13]];
    if (this.hasLcd) await this._readLcd();
  }
  async _readLcd() {
    const m = await this.request([0x30, 0x01]);
    this.lcd = { brightness: m[0x18], orientation: m[0x1a], res: this.model.res };
  }

  // ---------------- Messwerte ----------------
  async readStatus() {
    return this.run(async () => {
      await this.write([0x74, 0x01]);
      const m = await this.readUntil((x) => x[0] === 0x75);
      if (m[15] === 0xff && m[16] === 0xff) return this.status;
      this.status = { temp: m[15] + m[16] / 10, pumpRpm: (m[18] << 8) | m[17], pumpDuty: m[19] };
      if (this.model.family !== 'x') Object.assign(this.status, { fanRpm: (m[24] << 8) | m[23], fanDuty: m[25] });
      return this.status;
    });
  }

  // ---------------- Pumpe & Lüfter ----------------
  channels() { return Object.keys(SPEED[this.model.family]); }
  async setCurve(channel, points) {
    const cid = SPEED[this.model.family][channel]; if (!cid) throw new Error('Kanal nicht vorhanden: ' + channel);
    const duties = curveDuties(points, MIN_DUTY[channel]);
    return this.run(() => this.write([0x72, ...cid, ...duties]));
  }
  setFixed(channel, duty) { return this.setCurve(channel, [[20, duty], [CRITICAL - 1, duty]]); }

  // ---------------- LCD ----------------
  _needLcd() { if (!this.hasLcd) throw new Error('Dieses Modell hat kein Display.'); }
  async setBrightness(v) {
    this._needLcd(); v = Math.max(0, Math.min(100, Math.round(v)));
    return this.run(async () => { await this._readLcd(); await this.write([0x30, 0x02, 0x01, v, 0, 0, 1, this.lcd.orientation]); this.lcd.brightness = v; });
  }
  async setOrientation(deg) {
    this._needLcd(); const o = Math.round(((deg % 360) + 360) % 360 / 90) % 4;
    return this.run(async () => { await this._readLcd(); await this.write([0x30, 0x02, 0x01, this.lcd.brightness, 0, 0, 1, o]); this.lcd.orientation = o; });
  }
  /** Zurück zur eingebauten Anzeige der Flüssigkeitstemperatur */
  async showLiquid() { this._needLcd(); return this.run(() => this._switchBucket(0, 2)); }

  get isK23Fw2() { return this.pid === 0x300e && this.fw && this.fw[0] === 2; }
  get supportsGif() { return this.hasLcd && !this.isK23Fw2; }

  /** rgba: Uint8Array (res × res × 4), bereits gedreht/skaliert */
  async uploadImage(rgba) {
    this._needLcd();
    const n = this.model.res * this.model.res;
    if (rgba.length !== n * 4) throw new Error(`Bild muss ${this.model.res}×${this.model.res} Pixel haben.`);
    return this.run(async () => {
      if (this.isK23Fw2) {
        const data = Buffer.alloc(n * 2);
        for (let i = 0; i < n; i++) {
          const r = rgba[i * 4] >> 3, g = rgba[i * 4 + 1] >> 2, b = rgba[i * 4 + 2] >> 3;
          data[i * 2] = (r << 3) + (g >> 3); data[i * 2 + 1] = ((g & 0x7) << 5) + b;
        }
        const info = [0x06, 0, 0, 0, ...le32(data.length)];
        await this._sendFw2(data, info); await this._sendFw2(data, info); // zweimal nötig (wie NZXT CAM)
      } else {
        const data = Buffer.alloc(n * 4);
        for (let i = 0; i < n; i++) { data[i * 4] = rgba[i * 4]; data[i * 4 + 1] = rgba[i * 4 + 1]; data[i * 4 + 2] = rgba[i * 4 + 2]; }
        await this._sendData(data, [0x02, 0, 0, 0, ...le32(data.length)]);
      }
    });
  }
  /** gif: fertige GIF-Datei in LCD-Auflösung */
  async uploadGif(gif) {
    this._needLcd();
    if (!this.supportsGif) throw new Error('Diese Kraken-2023-Firmware (2.x) unterstützt keine GIFs – nur Standbilder.');
    if (gif.length / 1000 >= LCD_TOTAL_MEMORY) throw new Error(`GIF zu groß (${(gif.length / 1e6).toFixed(1)} MB, max. ~24 MB).`);
    return this.run(() => this._sendData(Buffer.from(gif), [0x01, 0, 0, 0, ...le32(gif.length)]));
  }

  // ---------------- Bulk-Transfer ----------------
  async openBulk() {
    if (this.bulk) return this.bulk;
    if (!usb) throw new Error('USB-Modul fehlt');
    const devs = usb.getDeviceList().filter((d) => d.deviceDescriptor.idVendor === VID && d.deviceDescriptor.idProduct === this.pid);
    if (!devs.length) throw new Error('Bulk-Schnittstelle des Kraken nicht gefunden.');
    let lastErr;
    for (const dev of devs) {
      try {
        dev.open();
        if (this.info.serialNumber && dev.deviceDescriptor.iSerialNumber) {
          const sn = await new Promise((res) => dev.getStringDescriptor(dev.deviceDescriptor.iSerialNumber, (e, s) => res(e ? null : s)));
          if (sn && sn !== this.info.serialNumber) { dev.close(); continue; }
        }
        for (const iface of dev.interfaces) {
          const ep = iface.endpoints.find((e) => e.direction === 'out' && (e.address & 0x7f) === 0x02 && e.transferType === usb.usb.LIBUSB_TRANSFER_TYPE_BULK);
          if (!ep) continue;
          try { if (process.platform === 'linux' && iface.isKernelDriverActive()) iface.detachKernelDriver(); } catch {}
          iface.claim();
          this.bulk = { dev, iface, ep };
          return this.bulk;
        }
        dev.close();
      } catch (e) { lastErr = e; try { dev.close(); } catch {} }
    }
    const hint = process.platform === 'win32'
      ? ' Unter Windows braucht die Display-Schnittstelle den WinUSB-Treiber: NZXT CAM einmal installiert haben genügt meist; sonst mit „Zadig“ für „NZXT Kraken … (Interface 1/2)“ WinUSB installieren.'
      : '';
    throw new Error('Kein Zugriff auf die Display-Schnittstelle' + (lastErr ? ` (${lastErr.message})` : '') + '.' + hint);
  }
  async closeBulk() {
    if (!this.bulk) return;
    const { dev, iface } = this.bulk; this.bulk = null;
    await new Promise((r) => iface.release(true, () => r()));
    try { dev.close(); } catch {}
  }
  async bulkWrite(buf) {
    const { ep } = await this.openBulk();
    await new Promise((res, rej) => ep.transfer(Buffer.from(buf), (e) => (e ? rej(e) : res())));
  }
  async _bulkData(header, data) {
    await this.bulkWrite(header);
    for (let i = 0; i < data.length; i += this.model.chunk) await this.bulkWrite(data.subarray(i, i + this.model.chunk));
  }

  async _sendFw2(data, info) {
    await this.request([0x36, 0x01, 0x00, 0x01, 0x06]);
    try { await this._bulkData([...HEADER, ...info], data); }
    finally { await this.request([0x36, 0x02]); await this.closeBulk(); }
  }

  async _sendData(data, info) {
    await this.openBulk(); // früh scheitern, bevor Speicher gelöscht wird
    try {
      await this.request([0x36, 0x03]);
      const buckets = [];
      for (let i = 0; i < 16; i++) buckets.push(await this.request([0x30, 0x04, i]));
      let idx = buckets.findIndex((b) => !b.slice(15).some((x) => x));
      idx = await this._prepareBucket(idx === -1 ? 0 : idx, idx === -1);
      const header = [...HEADER, ...info];
      const size = Math.ceil((header.length + data.length) / 1024);
      let start = this._memoryOffset(buckets, idx, size);
      if (start === -1) { await this._deleteAll(); idx = 0; start = [0, 0]; }
      const setup = await this.request([0x32, 0x01, idx, idx + 1, start[0], start[1], size & 0xff, (size >> 8) & 0xff, 0x01]);
      if (setup[14] !== 1) this.log('warn', 'Kraken: Speicherbereich konnte nicht vorbereitet werden');
      await this.request([0x36, 0x01, idx]);
      await this._bulkData(header, data);
      await this.write([0x36, 0x02]);
      if (!(await this._switchBucket(idx))) this.log('warn', 'Kraken: Umschalten auf das neue Bild fehlgeschlagen');
    } finally { await this.closeBulk(); }
  }
  async _deleteBucket(i) { await this.write([0x32, 0x02, i]); const m = await this.readUntil((x) => x[0] === 0x33 && x[1] === 0x02); return m[14] === 1; }
  async _prepareBucket(i, filled) {
    if (i >= 16) throw new Error('Kein freier Speicherplatz auf dem Display');
    if (!(await this._deleteBucket(i))) return this._prepareBucket(i + 1, true);
    if (filled) return this._prepareBucket(i, false);
    return i;
  }
  async _deleteAll() { await this._switchBucket(0, 2); for (let i = 0; i < 16; i++) await this._deleteBucket(i); }
  async _switchBucket(i, mode = 0x4) { const m = await this.request([0x38, 0x01, mode, i]); return m[14] === 1; }
  _memoryOffset(buckets, idx, size) {
    const cur = buckets[idx];
    const curOff = cur[17] | (cur[18] << 8), curSize = cur[19] | (cur[20] << 8);
    if (size <= curSize) return [cur[17], cur[18]];
    let minB = curOff, maxB = 0, overlap = false;
    buckets.forEach((b, i) => {
      const s = b[17] | (b[18] << 8), e = s + (b[19] | (b[20] << 8));
      if (e > maxB) maxB = e; if (s < minB) minB = s;
      if ((s > curOff && s < curOff + size) || (s < curOff && e > s) || (s === curOff && i !== idx)) overlap = true;
    });
    if (!overlap) return [cur[17], cur[18]];
    if (maxB + size < LCD_TOTAL_MEMORY) return [maxB & 0xff, (maxB >> 8) & 0xff];
    if (size < minB) return [0, 0];
    return -1;
  }

  toJSON() {
    return {
      connected: this.connected, error: this.error,
      model: this.model && this.model.name, family: this.model && this.model.family, fw: this.fw && this.fw.join('.'),
      lcd: this.hasLcd ? { ...this.lcd, res: this.model.res, gif: this.supportsGif } : null,
      channels: this.model ? this.channels() : [], status: this.status,
    };
  }
}
const HEADER = [0x12, 0xfa, 0x01, 0xe8, 0xab, 0xcd, 0xef, 0x98, 0x76, 0x54, 0x32, 0x10];
function le32(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]; }

module.exports = { Kraken, PRESETS, curveDuties, MODELS };
