'use strict';
/** Govee LAN-API (UDP). Funktioniert mit allen Govee-Geräten, bei denen „LAN-Steuerung“ in der Govee-App aktiviert ist. */
const dgram = require('dgram');
const { Driver, Device, linearLeds } = require('./base');

class GoveeDevice extends Device {
  async write(c) {
    const r = c[0], g = c[1], b = c[2];
    const off = r + g + b < 6;
    if (off !== this.off) { this.off = off; this.cmd({ cmd: 'turn', data: { value: off ? 0 : 1 } }); if (off) return; }
    if (this.last && Math.abs(this.last[0] - r) + Math.abs(this.last[1] - g) + Math.abs(this.last[2] - b) < 4) return;
    this.last = [r, g, b];
    const m = Math.max(r, g, b) || 1;
    // Farbe normieren und Helligkeit separat senden → sattere Farben
    this.cmd({ cmd: 'colorwc', data: { color: { r: Math.round((r / m) * 255), g: Math.round((g / m) * 255), b: Math.round((b / m) * 255) }, colorTemInKelvin: 0 } });
    const bri = Math.max(1, Math.round((m / 255) * 100));
    if (bri !== this.bri) { this.bri = bri; this.cmd({ cmd: 'brightness', data: { value: bri } }); }
  }
  cmd(msg) { this.sock.send(Buffer.from(JSON.stringify({ msg })), 4003, this.ip); }
}

class GoveeDriver extends Driver {
  static meta = {
    id: 'govee', name: 'Govee (LAN)', vendor: 'Govee',
    description: 'Govee LED-Strips, Lampen, Glide, Lyra & Co. über die lokale LAN-API – ohne Cloud.',
    help: 'In der Govee-Home-App beim jeweiligen Gerät → Einstellungen → „LAN Control“ aktivieren. PC und Gerät müssen im selben Netz sein (Multicast 239.255.255.250 darf nicht blockiert werden).',
    defaultEnabled: true,
    fields: [{ key: 'hosts', label: 'Zusätzliche IPs (optional)', type: 'text', default: '' }],
  };
  async start() {
    this.setStatus('connecting', 'Suche Govee-Geräte …');
    this.listen = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.sock = dgram.createSocket('udp4');
    this.sock.on('error', () => {}); this.listen.on('error', (e) => this.setStatus('error', 'Port 4002 belegt: ' + e.message));
    this.listen.on('message', (m, r) => {
      try {
        const j = JSON.parse(m.toString()); if (j.msg.cmd !== 'scan') return;
        const d = j.msg.data; const id = 'govee:' + d.device;
        if (this.devices.has(id)) return;
        const dev = new GoveeDevice({ id, name: 'Govee ' + d.sku, vendor: 'Govee', type: 'light', driver: 'govee', leds: linearLeds(1), maxFps: 15, info: { ip: d.ip, sku: d.sku } });
        dev.ip = d.ip; dev.sock = this.sock;
        this.addDevice(dev);
        this.setStatus('ok', `${this.devices.size} Govee-Gerät(e)`);
      } catch {}
    });
    await new Promise((res) => this.listen.bind(4002, res));
    const scan = Buffer.from(JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } }));
    const send = () => {
      this.sock.send(scan, 4001, '239.255.255.250');
      String(this.config.hosts || '').split(/[,;\s]+/).filter(Boolean).forEach((h) => this.sock.send(scan, 4001, h));
    };
    send(); setTimeout(send, 1500);
    this.rescan = setInterval(send, 60000);
    setTimeout(() => { if (!this.devices.size) this.setStatus('ok', 'Keine Govee-Geräte gefunden (LAN Control aktiviert?)'); }, 4000);
  }
  async stop() { clearInterval(this.rescan); for (const s of [this.sock, this.listen]) try { s && s.close(); } catch {} this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = GoveeDriver;
