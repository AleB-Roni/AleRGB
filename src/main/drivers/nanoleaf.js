'use strict';
/** Nanoleaf (Shapes, Canvas, Elements, Lines, Light Panels) – External Control Streaming über UDP. */
const dgram = require('dgram');
const { Driver, Device, normalize, fetchJson } = require('./base');
const { browse } = require('../net/mdns');
const SKIP_SHAPES = new Set([1, 12, 16, 19, 20]); // Rhythm-Modul, Controller, Connectoren

class NanoleafDevice extends Device {
  async write(c) {
    const n = this.ids.length;
    if (this.v1) {
      const p = Buffer.alloc(1 + n * 7); p[0] = n;
      this.ids.forEach((id, i) => { const o = 1 + i * 7; p[o] = id; p[o + 1] = 1; p[o + 2] = c[i * 3]; p[o + 3] = c[i * 3 + 1]; p[o + 4] = c[i * 3 + 2]; p[o + 5] = 0; p[o + 6] = 1; });
      this.sock.send(p, 60222, this.host);
    } else {
      const p = Buffer.alloc(2 + n * 8); p.writeUInt16BE(n, 0);
      this.ids.forEach((id, i) => { const o = 2 + i * 8; p.writeUInt16BE(id, o); p[o + 2] = c[i * 3]; p[o + 3] = c[i * 3 + 1]; p[o + 4] = c[i * 3 + 2]; p[o + 5] = 0; p.writeUInt16BE(1, o + 6); });
      this.sock.send(p, 60222, this.host);
    }
  }
}

class NanoleafDriver extends Driver {
  static meta = {
    id: 'nanoleaf', name: 'Nanoleaf', vendor: 'Nanoleaf',
    description: 'Nanoleaf Shapes, Canvas, Elements, Lines und Light Panels – jedes Panel einzeln, mit echter Anordnung.',
    help: 'IP eintragen oder „Suchen“. Zum Koppeln den Power-Knopf am Controller 5–7 s gedrückt halten (LEDs blinken), dann innerhalb von 30 s „Koppeln“ klicken.',
    defaultEnabled: false,
    fields: [{ key: 'host', label: 'IP-Adresse', type: 'text', default: '' }, { key: 'token', label: 'Auth-Token (wird beim Koppeln gesetzt)', type: 'text', default: '' }],
    actions: [{ id: 'discover', label: 'Suchen' }, { id: 'pair', label: 'Koppeln' }],
  };
  async action(name) {
    if (name === 'discover') {
      const r = await browse('_nanoleafapi._tcp.local');
      if (!r.length) throw new Error('Kein Nanoleaf gefunden.');
      return { patch: { host: r[0].ip }, message: 'Gefunden: ' + r.map((x) => `${x.name} (${x.ip})`).join(', ') };
    }
    if (name === 'pair') {
      const r = await fetchJson(`http://${this.config.host}:16021/api/v1/new`, { method: 'POST' }).catch(() => { throw new Error('Pairing abgelehnt – Power-Knopf 5–7 s halten und erneut versuchen.'); });
      return { patch: { token: r.auth_token }, message: 'Erfolgreich gekoppelt!' };
    }
    return super.action(name);
  }
  async start() {
    const { host, token } = this.config;
    if (!host || !token) return this.setStatus('setup', 'Noch nicht eingerichtet – suchen und koppeln.');
    try {
      const base = `http://${host}:16021/api/v1/${token}`;
      const info = await fetchJson(base + '/');
      const v1 = /NL22/.test(info.model || '');
      await fetchJson(base + '/effects', { method: 'PUT', body: JSON.stringify({ write: { command: 'display', animType: 'extControl', extControlVersion: v1 ? 'v1' : 'v2' } }) });
      const panels = info.panelLayout.layout.positionData.filter((p) => !SKIP_SHAPES.has(p.shapeType));
      const pts = normalize(panels.map((p) => ({ x: p.x, y: -p.y })));
      const xs = panels.map((p) => p.x), ys = panels.map((p) => p.y);
      this.sock = dgram.createSocket('udp4'); this.sock.on('error', () => {});
      const d = new NanoleafDevice({ id: 'nanoleaf:' + (info.serialNo || host), name: info.name || 'Nanoleaf', vendor: 'Nanoleaf ' + (info.model || ''), type: 'panels', driver: 'nanoleaf', leds: pts, aspect: (Math.max(...xs) - Math.min(...xs) || 1) / (Math.max(...ys) - Math.min(...ys) || 1), maxFps: 30 });
      d.ids = panels.map((p) => p.panelId); d.v1 = v1; d.host = host; d.sock = this.sock;
      this.devices.set(d.id, d);
      this.setStatus('ok', `${panels.length} Panels (${v1 ? 'v1' : 'v2'}-Streaming)`);
      this.emit('changed');
    } catch (e) { this.setStatus('error', e.message); }
  }
  async stop() { try { this.sock && this.sock.close(); } catch {} this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = NanoleafDriver;
