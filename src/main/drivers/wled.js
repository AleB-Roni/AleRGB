'use strict';
/** WLED (ESP8266/ESP32 LED-Controller) – Echtzeit über UDP (DNRGB, Port 21324). */
const dgram = require('dgram');
const { Driver, Device, linearLeds, matrixLeds, fetchJson } = require('./base');
const { browse } = require('../net/mdns');

class WledDevice extends Device {
  async write(c) {
    const n = this.ledCount, CH = 489;
    for (let s = 0; s < n; s += CH) {
      const cnt = Math.min(CH, n - s);
      const p = Buffer.alloc(4 + cnt * 3);
      p[0] = 4; p[1] = 2; p.writeUInt16BE(s, 2);
      for (let i = 0; i < cnt * 3; i++) p[4 + i] = c[s * 3 + i];
      this.sock.send(p, 21324, this.host);
    }
  }
}

class WledDriver extends Driver {
  static meta = {
    id: 'wled', name: 'WLED', vendor: 'WLED / DIY',
    description: 'LED-Strips, Matrizen und Ambilight-Controller mit WLED-Firmware (ESP8266/ESP32) – auch viele fertige Produkte (z.B. Athom, QuinLED, GLEDOPTO).',
    help: 'Geräte werden per mDNS automatisch gefunden. Falls nicht: IP-Adressen manuell eintragen. In WLED unter Config → Sync → „Realtime“ den UDP-Empfang aktiviert lassen.',
    defaultEnabled: true,
    fields: [
      { key: 'hosts', label: 'IP-Adressen (kommagetrennt)', type: 'text', default: '' },
      { key: 'discover', label: 'Automatisch im Netzwerk suchen', type: 'bool', default: true },
    ],
  };
  async start() {
    this.sock = dgram.createSocket('udp4'); this.sock.on('error', () => {});
    this.setStatus('connecting', 'Suche WLED-Geräte …');
    const hosts = new Set(String(this.config.hosts || '').split(/[,;\s]+/).filter(Boolean));
    if (this.config.discover !== false) (await browse('_wled._tcp.local')).forEach((s) => hosts.add(s.ip));
    const errors = [];
    await Promise.all([...hosts].map(async (h) => {
      try {
        const info = await fetchJson(`http://${h}/json/info`, {}, 2500);
        const n = info.leds.count; const m = info.leds.matrix;
        const dev = new WledDevice({ id: 'wled:' + (info.mac || h), name: info.name || 'WLED', vendor: 'WLED ' + (info.ver || ''), type: m ? 'matrix' : 'ledstrip', driver: 'wled', leds: m ? matrixLeds(m.w, m.h) : linearLeds(n), aspect: m ? m.w / m.h : null, maxFps: 60, info: { ip: h, leds: n } });
        dev.host = h; dev.sock = this.sock;
        this.devices.set(dev.id, dev);
      } catch (e) { errors.push(`${h}: ${e.message}`); }
    }));
    this.setStatus(this.devices.size || !errors.length ? 'ok' : 'error', this.devices.size ? `${this.devices.size} WLED-Gerät(e)` : errors.length ? errors.join('; ') : 'Keine WLED-Geräte gefunden');
    this.emit('changed');
  }
  async stop() { try { this.sock && this.sock.close(); } catch {} this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = WledDriver;
