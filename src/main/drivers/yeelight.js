'use strict';
/** Yeelight (Xiaomi) – Discovery per SSDP, Steuerung im „Music Mode“ (ohne Befehls-Limit). */
const dgram = require('dgram');
const net = require('net');
const { Driver, Device, linearLeds, sleep } = require('./base');

class YeeDevice extends Device {
  async write(c) {
    if (!this.music) return;
    const r = c[0], g = c[1], b = c[2], m = Math.max(r, g, b);
    if (m < 3) { if (!this.off) { this.off = true; this.send('set_power', ['off', 'sudden', 0]); } return; }
    if (this.off) { this.off = false; this.send('set_power', ['on', 'sudden', 0]); }
    const rgb = (Math.round((r / m) * 255) << 16) | (Math.round((g / m) * 255) << 8) | Math.round((b / m) * 255);
    if (rgb !== this.lrgb) { this.lrgb = rgb; this.send('set_rgb', [rgb || 1, 'sudden', 0]); }
    const bri = Math.max(1, Math.round((m / 255) * 100));
    if (bri !== this.lbri) { this.lbri = bri; this.send('set_bright', [bri, 'sudden', 0]); }
  }
  send(method, params) { this.id = (this.id || 0) + 1; try { this.music.write(JSON.stringify({ id: this.id, method, params }) + '\r\n'); } catch {} }
}

class YeelightDriver extends Driver {
  static meta = {
    id: 'yeelight', name: 'Yeelight', vendor: 'Xiaomi / Yeelight',
    description: 'Yeelight-Farblampen und Lightstrips im lokalen Netzwerk.',
    help: 'In der Yeelight-App beim Gerät „LAN-Steuerung“ aktivieren. Die Windows-Firewall muss eingehende Verbindungen für Spectra erlauben (Music Mode).',
    defaultEnabled: false,
    fields: [],
  };
  async start() {
    this.setStatus('connecting', 'Suche Yeelight-Geräte …');
    const found = new Map();
    const s = dgram.createSocket('udp4');
    s.on('message', (m) => {
      const t = m.toString(); const loc = /Location: yeelight:\/\/([\d.]+):(\d+)/i.exec(t); const id = /\nid: (\S+)/i.exec(t);
      const model = /\nmodel: (\S+)/i.exec(t); const name = /\nname: (.*)\r/i.exec(t); const sup = /\nsupport: (.*)\r/i.exec(t);
      if (loc && id && sup && /set_rgb/.test(sup[1])) found.set(id[1], { ip: loc[1], port: +loc[2], model: model && model[1], name: name && name[1].trim() });
    });
    s.on('error', () => {});
    await new Promise((r) => s.bind(0, r));
    const q = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1982\r\nMAN: "ssdp:discover"\r\nST: wifi_bulb\r\n');
    s.send(q, 1982, '239.255.255.250'); await sleep(1500); s.send(q, 1982, '239.255.255.250'); await sleep(1500);
    s.close();
    for (const [id, f] of found) {
      try {
        const d = new YeeDevice({ id: 'yeelight:' + id, name: f.name || 'Yeelight ' + (f.model || ''), vendor: 'Yeelight', type: 'light', driver: 'yeelight', leds: linearLeds(1), maxFps: 25, info: { ip: f.ip } });
        await this._music(d, f);
        this.devices.set(d.id, d);
      } catch (e) { this.log('warn', `${f.ip}: ${e.message}`); }
    }
    this.setStatus('ok', found.size ? `${this.devices.size} Yeelight-Gerät(e)` : 'Keine Yeelight-Geräte gefunden (LAN-Steuerung aktiviert?)');
    this.emit('changed');
  }
  _music(d, f) {
    return new Promise((resolve, reject) => {
      const ctl = net.createConnection(f.port, f.ip);
      const to = setTimeout(() => { ctl.destroy(); reject(new Error('Zeitüberschreitung')); }, 4000);
      ctl.on('error', (e) => { clearTimeout(to); reject(e); });
      ctl.on('connect', () => {
        const srv = net.createServer((sock) => { clearTimeout(to); d.music = sock; sock.on('error', () => {}); sock.on('close', () => (d.music = null)); ctl.end(); resolve(); });
        srv.listen(0, () => {
          d.server = srv;
          ctl.write(JSON.stringify({ id: 1, method: 'set_music', params: [1, ctl.localAddress.replace('::ffff:', ''), srv.address().port] }) + '\r\n');
        });
      });
    });
  }
  async stop() { for (const d of this.devices.values()) { try { d.music && d.music.end(); d.server && d.server.close(); } catch {} } this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = YeelightDriver;
