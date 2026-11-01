'use strict';
/** Philips Hue Bridge (lokale REST-API). Gedrosselt auf ~10 Befehle/s, wie von Philips empfohlen. */
const { Driver, Device, linearLeds, fetchJson } = require('./base');
const { browse } = require('../net/mdns');

function rgbToXy(r, g, b) {
  const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
  r = f(r); g = f(g); b = f(b);
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028, Y = r * 0.283881 + g * 0.668433 + b * 0.047685, Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const s = X + Y + Z; if (!s) return { xy: [0.3127, 0.329], bri: 0 };
  return { xy: [+(X / s).toFixed(4), +(Y / s).toFixed(4)], bri: Math.round(Math.max(r, g, b) * 254) };
}

class HueLight extends Device {
  async write(c) { this.want = [c[0], c[1], c[2]]; }
}

class HueDriver extends Driver {
  static meta = {
    id: 'hue', name: 'Philips Hue', vendor: 'Signify',
    description: 'Hue-Lampen, Lightstrips, Play-Bars und Gradient-Lights über die Hue Bridge.',
    help: 'Bridge-IP eintragen oder „Bridge suchen“ klicken. Dann den runden Knopf auf der Bridge drücken und innerhalb von 30 s „Koppeln“ klicken. Hue ist durch die Bridge auf ca. 10 Updates/s begrenzt – ideal für langsame, ruhige Effekte und Ambilight.',
    defaultEnabled: false,
    fields: [
      { key: 'bridge', label: 'Bridge-IP', type: 'text', default: '' },
      { key: 'username', label: 'API-Schlüssel (wird beim Koppeln gesetzt)', type: 'text', default: '' },
    ],
    actions: [{ id: 'discover', label: 'Bridge suchen' }, { id: 'pair', label: 'Koppeln' }],
  };
  async action(name) {
    if (name === 'discover') {
      const local = await browse('_hue._tcp.local');
      let ips = local.map((s) => s.ip);
      if (!ips.length) try { ips = (await fetchJson('https://discovery.meethue.com/', {}, 4000)).map((b) => b.internalipaddress); } catch {}
      if (!ips.length) throw new Error('Keine Hue Bridge gefunden.');
      return { patch: { bridge: ips[0] }, message: 'Bridge gefunden: ' + ips.join(', ') };
    }
    if (name === 'pair') {
      if (!this.config.bridge) throw new Error('Zuerst Bridge-IP eintragen.');
      const r = await fetchJson(`http://${this.config.bridge}/api`, { method: 'POST', body: JSON.stringify({ devicetype: 'spectra_rgb#windows' }) });
      if (r[0] && r[0].error) throw new Error(r[0].error.type === 101 ? 'Bitte zuerst den Knopf auf der Bridge drücken.' : r[0].error.description);
      return { patch: { username: r[0].success.username }, message: 'Erfolgreich gekoppelt!' };
    }
    return super.action(name);
  }
  async start() {
    const { bridge, username } = this.config;
    if (!bridge || !username) return this.setStatus('setup', 'Noch nicht eingerichtet – Bridge suchen und koppeln.');
    try {
      const lights = await fetchJson(`http://${bridge}/api/${username}/lights`);
      if (Array.isArray(lights) && lights[0] && lights[0].error) throw new Error(lights[0].error.description);
      for (const [id, l] of Object.entries(lights)) {
        if (!l.state || l.state.xy === undefined) continue; // nur Farblampen
        const d = new HueLight({ id: `hue:${l.uniqueid || id}`, name: l.name, vendor: 'Philips Hue', type: 'light', driver: 'hue', leds: linearLeds(1), maxFps: 30, info: { model: l.modelid } });
        d.lid = id; this.devices.set(d.id, d);
      }
      this.setStatus('ok', `${this.devices.size} Farblampe(n)`);
      this.emit('changed');
      this.rr = 0;
      this.timer = setInterval(() => this._tick(), 110);
    } catch (e) { this.setStatus('error', e.message); }
  }
  _tick() {
    const list = [...this.devices.values()]; if (!list.length) return;
    for (let k = 0; k < list.length; k++) {
      const d = list[(this.rr + k) % list.length];
      if (!d.want) continue;
      const diff = d.sent ? Math.abs(d.sent[0] - d.want[0]) + Math.abs(d.sent[1] - d.want[1]) + Math.abs(d.sent[2] - d.want[2]) : 999;
      if (diff < 6) continue;
      this.rr = (this.rr + k + 1) % list.length; d.sent = d.want;
      const { xy, bri } = rgbToXy(...d.want);
      const body = bri < 2 ? { on: false, transitiontime: 1 } : { on: true, xy, bri, transitiontime: 1 };
      fetchJson(`http://${this.config.bridge}/api/${this.config.username}/lights/${d.lid}/state`, { method: 'PUT', body: JSON.stringify(body) }, 1000).catch(() => {});
      return;
    }
  }
  async stop() { clearInterval(this.timer); this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = HueDriver;
