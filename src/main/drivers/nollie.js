'use strict';
/**
 * Nollie ARGB-Controller (Nollie 8 / Nollie 8 v2 / Nollie 8 OS2 / Prism 8 / Nollie 1) – direkt per USB-HID.
 * Weder OpenRGB noch die Nollie-Software werden benötigt.
 *
 * Protokoll (aus OpenRGB, Controllers/NollieController, GPL-2.0-or-later, Autor cnn1236661):
 *   65-Byte-Reports (Report-ID 0):
 *     [0]=0x00, [1]=packetId + channel * interval, danach bis zu 21 LEDs als G,R,B
 *     interval: Nollie 8 = 6 (6 × 21 = 126 LEDs pro Kanal), Nollie 1 = 30 (630 LEDs)
 *   Nach allen Kanälen: [1]=0xFF → Frame übernehmen.
 *   Nollie 1 erwartet vorher die LED-Anzahl: [1]=0xFE, [2]=0x03, danach uint16 LE pro Kanal.
 */
const { Driver, Device, linearLeds, ringLeds } = require('./base');
let HID = null;
try { HID = require('node-hid'); } catch { HID = null; }

const MODELS = [
  { vid: 0x16d2, pid: 0x1f01, name: 'Nollie 8', channels: 8, max: 126, interval: 6 },
  { vid: 0x16d5, pid: 0x1f01, name: 'Nollie 8 (OS2)', channels: 8, max: 126, interval: 6 },
  { vid: 0x16d5, pid: 0x2a08, name: 'Nollie 8 (OS2.1)', channels: 8, max: 126, interval: 6, iface: 2 },
  { vid: 0x16d5, pid: 0x2c08, name: 'Prism 8', channels: 8, max: 126, interval: 6, iface: 2 },
  { vid: 0x16d2, pid: 0x1f11, name: 'Nollie 1', channels: 1, max: 630, interval: 30, initLeds: true },
  { vid: 0x16d5, pid: 0x1f11, name: 'Nollie 1 (OS2)', channels: 1, max: 630, interval: 30, initLeds: true },
  { vid: 0x16d5, pid: 0x2a01, name: 'Nollie 1 (OS2.1)', channels: 1, max: 630, interval: 30, initLeds: true, iface: 2 },
];
const PER_PACKET = 21;

/** LED-Positionen je nach Kanal-Art: Strip, ein Lüfter-Ring oder mehrere Lüfter nebeneinander */
function channelLeds(ch) {
  const n = ch.leds;
  if (ch.kind === 'ring') {
    const fans = Math.max(1, Math.min(n, ch.fans || 1));
    const per = Math.floor(n / fans);
    const out = [];
    for (let f = 0; f < fans; f++) {
      const cnt = f === fans - 1 ? n - per * (fans - 1) : per;
      for (const p of ringLeds(cnt)) out.push({ x: (f + 0.1 + p.x * 0.8) / fans, y: 0.1 + p.y * 0.8 });
    }
    return out;
  }
  return linearLeds(n);
}

/** Ein Kanal = ein Gerät im Layout (z.B. „Lüfter vorne“ oder „LED-Strip“) */
class NollieChannel extends Device {
  async write(c) { this.ctrl.frame[this.channel] = c; this.ctrl.dirty = true; }
}

class NollieController {
  constructor(info, model, log) {
    this.info = info; this.model = model; this.log = log;
    this.frame = new Array(model.channels).fill(null);
    this.dirty = false; this.busy = false;
  }
  async open() {
    this.dev = await HID.HIDAsync.open(this.info.path);
    this.dev.on('error', (e) => { this.log('warn', `${this.model.name}: ${e.message}`); this.closed = true; });
  }
  async initLeds(counts) {
    if (!this.model.initLeds) return;
    const b = Buffer.alloc(65); b[1] = 0xfe; b[2] = 0x03;
    counts.forEach((n, i) => { b[3 + i * 2] = n & 0xff; b[4 + i * 2] = (n >> 8) & 0xff; });
    await this.dev.write(b);
  }
  /** Schreibt alle geänderten Kanäle und übernimmt den Frame. */
  async flush() {
    if (!this.dirty || this.busy || this.closed) return;
    this.busy = true; this.dirty = false;
    try {
      for (let ch = 0; ch < this.model.channels; ch++) {
        const c = this.frame[ch]; if (!c) continue;
        const n = c.length / 3;
        const packets = Math.ceil(n / PER_PACKET);
        for (let p = 0; p < packets; p++) {
          const b = Buffer.alloc(65);
          b[1] = p + ch * this.model.interval;
          const start = p * PER_PACKET, cnt = Math.min(PER_PACKET, n - start);
          for (let i = 0; i < cnt; i++) {
            const k = (start + i) * 3;
            b[2 + i * 3] = c[k + 1]; // G
            b[3 + i * 3] = c[k];     // R
            b[4 + i * 3] = c[k + 2]; // B
          }
          await this.dev.write(b);
        }
      }
      const u = Buffer.alloc(65); u[1] = 0xff;
      await this.dev.write(u);
    } catch (e) { this.log('warn', `${this.model.name}: Schreibfehler – ${e.message}`); }
    finally { this.busy = false; }
  }
  async close() { try { await this.dev.close(); } catch {} }
}

const DEFAULT_CHANNELS = Array.from({ length: 8 }, (_, i) => ({ name: `Kanal ${i + 1}`, leds: i < 3 ? 16 : 0, kind: i < 3 ? 'ring' : 'strip', fans: 1 }));

class NollieDriver extends Driver {
  static meta = {
    id: 'nollie', name: 'Nollie ARGB', vendor: 'Nollie',
    description: 'Nollie 8 / 8 v2 / Prism 8 / Nollie 1 ARGB-Controller – direkt per USB, ohne OpenRGB oder Nollie-Software. Jeder Kanal erscheint als eigenes Gerät im Layout.',
    help: 'Trage pro Kanal ein, wie viele LEDs angeschlossen sind (bei mehreren Lüftern in Reihe die Summe, z.B. 3 × 16 = 48) und wähle „Lüfter-Ring“ mit der Anzahl Lüfter. Die LED-Zahl steht im Datenblatt deiner Lüfter/Strips. Wichtig: SignalRGB, die Nollie-Software und den Nollie-Treiber in OpenRGB schließen bzw. deaktivieren – nur ein Programm darf den Controller ansteuern.',
    defaultEnabled: true,
    fields: [{ key: 'channels', label: 'Kanäle', type: 'channels', default: DEFAULT_CHANNELS, max: 126 }],
  };
  async start() {
    if (!HID) return this.setStatus('error', 'USB-HID-Modul „node-hid“ fehlt – npm install ausführen.');
    const found = [];
    for (const d of HID.devices()) {
      const m = MODELS.find((x) => x.vid === d.vendorId && x.pid === d.productId);
      if (!m) continue;
      if (m.iface !== undefined && d.interface !== m.iface) continue;
      if (found.some((f) => f.info.path === d.path)) continue;
      found.push({ info: d, model: m });
    }
    if (!found.length) return this.setStatus('idle', 'Kein Nollie-Controller angeschlossen.');
    this.ctrls = [];
    const chCfg = this.channelConfig();
    for (const [idx, { info, model }] of found.entries()) {
      const ctrl = new NollieController(info, model, this.log);
      try { await ctrl.open(); } catch (e) {
        this.setStatus('error', `${model.name} gefunden, aber belegt (${e.message}). Läuft SignalRGB, OpenRGB oder die Nollie-Software noch?`);
        continue;
      }
      this.ctrls.push(ctrl);
      const serial = info.serialNumber || String(idx);
      const chans = chCfg.slice(0, model.channels).map((c) => ({ ...c, leds: Math.max(0, Math.min(model.max, Number(c.leds) || 0)) }));
      await ctrl.initLeds(chans.map((c) => c.leds));
      chans.forEach((c, ch) => {
        if (!c.leds) return;
        const leds = channelLeds(c);
        const fans = c.kind === 'ring' ? Math.max(1, c.fans || 1) : 0;
        const dev = new NollieChannel({
          id: `nollie:${serial}:${ch}`, name: `${c.name || 'Kanal ' + (ch + 1)}${found.length > 1 ? ` (${model.name} ${idx + 1})` : ''}`,
          vendor: model.name, type: c.kind === 'ring' ? 'fan' : 'ledstrip', driver: 'nollie', leds,
          aspect: fans ? fans : null, maxFps: 60, info: { kanal: ch + 1, leds: c.leds },
        });
        dev.ctrl = ctrl; dev.channel = ch;
        this.devices.set(dev.id, dev);
      });
    }
    // Frames gesammelt mit bis zu 60 FPS an die Controller senden
    this.timer = setInterval(() => this.ctrls.forEach((c) => c.flush()), 16);
    if (this.ctrls.length) {
      const leds = [...this.devices.values()].reduce((a, d) => a + d.ledCount, 0);
      this.setStatus('ok', `${this.ctrls.map((c) => c.model.name).join(', ')} verbunden · ${this.devices.size} Kanal/Kanäle · ${leds} LEDs` + (this.devices.size ? '' : ' – trage unter Einstellungen die LED-Anzahl pro Kanal ein'));
    }
    this.emit('changed');
  }
  channelConfig() {
    const c = Array.isArray(this.config.channels) ? this.config.channels : DEFAULT_CHANNELS;
    return Array.from({ length: 8 }, (_, i) => ({ ...DEFAULT_CHANNELS[i], ...(c[i] || {}) }));
  }
  async stop() {
    clearInterval(this.timer);
    for (const c of this.ctrls || []) {
      // LEDs ausschalten, damit der Controller nicht mit dem letzten Bild stehen bleibt
      for (let ch = 0; ch < c.model.channels; ch++) if (c.frame[ch]) c.frame[ch] = new Uint8Array(c.frame[ch].length);
      c.dirty = true; c.busy = false;
      await c.flush().catch(() => {});
      await c.close();
    }
    this.ctrls = []; this.clearDevices(); this.setStatus('stopped');
  }
  async diagnose() {
    const out = [];
    if (this.ctrls && this.ctrls.length && !this.devices.size) out.push({ level: 'warn', text: 'Nollie-Controller verbunden, aber bei keinem Kanal ist eine LED-Anzahl eingetragen (Integrationen → Nollie ARGB → Einstellungen).' });
    return out;
  }
}

module.exports = NollieDriver;
module.exports._test = { MODELS, channelLeds, NollieController };
