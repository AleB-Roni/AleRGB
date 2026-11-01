'use strict';
/** Razer Chroma SDK über die lokale REST-API von Razer Synapse (Port 54235). */
const { Driver, Device, matrixLeds, linearLeds, fetchJson, sleep } = require('./base');

const CATS = {
  keyboard: { name: 'Razer Tastatur', type: 'keyboard', w: 22, h: 6, effect: 'CHROMA_CUSTOM' },
  mouse: { name: 'Razer Maus', type: 'mouse', w: 7, h: 9, effect: 'CHROMA_CUSTOM2' },
  mousepad: { name: 'Razer Mauspad', type: 'mousepad', n: 15, effect: 'CHROMA_CUSTOM' },
  headset: { name: 'Razer Headset', type: 'headset', n: 5, effect: 'CHROMA_CUSTOM' },
  keypad: { name: 'Razer Keypad', type: 'keypad', w: 5, h: 4, effect: 'CHROMA_CUSTOM' },
  chromalink: { name: 'Razer Chroma Link', type: 'ledstrip', n: 5, effect: 'CHROMA_CUSTOM' },
};
const bgr = (c, i) => (c[i * 3 + 2] << 16) | (c[i * 3 + 1] << 8) | c[i * 3];

class RazerDevice extends Device {
  async write(c) {
    const d = this.def; let param;
    if (d.w) { param = []; for (let r = 0; r < d.h; r++) { const row = []; for (let k = 0; k < d.w; k++) row.push(bgr(c, r * d.w + k)); param.push(row); } }
    else { param = []; for (let i = 0; i < d.n; i++) param.push(bgr(c, i)); }
    await fetchJson(`${this.drv.uri}/${this.cat}`, { method: 'PUT', body: JSON.stringify({ effect: d.effect, param }) }, 1500);
  }
}

class RazerDriver extends Driver {
  static meta = {
    id: 'razer', name: 'Razer Chroma', vendor: 'Razer',
    description: 'Steuert alle Chroma-fähigen Razer-Geräte und Chroma-Link-Partnergeräte über Razer Synapse.',
    help: 'Razer Synapse installieren und das Modul „Chroma Connect“ aktivieren (Synapse → Module/Apps). In Chroma Studio unter „Connect“ Apps erlauben. Die Chroma-API kennt nur Gerätekategorien, nicht einzelne Modelle – deaktiviere Kategorien, die du nicht besitzt.',
    defaultEnabled: true,
    fields: [{ key: 'categories', label: 'Gerätekategorien', type: 'multi', options: Object.keys(CATS), default: ['keyboard', 'mouse', 'mousepad', 'headset', 'chromalink'] }],
  };
  async start() { this.stopped = false; this._loop(); }
  async _loop() {
    while (!this.stopped) {
      try {
        this.setStatus('connecting', 'Verbinde mit Razer Synapse …');
        const res = await fetchJson('http://localhost:54235/razer/chromasdk', {
          method: 'POST', body: JSON.stringify({
            title: 'Spectra RGB', description: 'Universelle RGB-Steuerung', author: { name: 'Spectra RGB', contact: 'https://github.com' },
            device_supported: Object.keys(CATS), category: 'application',
          }),
        });
        if (!res.uri) throw new Error('Keine Session-URI erhalten');
        this.uri = res.uri;
        await sleep(1500); // Synapse braucht einen Moment, bis die Session bereit ist
        this.hb = setInterval(() => fetchJson(`${this.uri}/heartbeat`, { method: 'PUT' }).catch(() => this._lost()), 5000);
        for (const cat of this.config.categories || []) {
          const d = CATS[cat]; if (!d) continue;
          const dev = new RazerDevice({ id: 'razer:' + cat, name: d.name, vendor: 'Razer', type: d.type, driver: 'razer', leds: d.w ? matrixLeds(d.w, d.h) : linearLeds(d.n), aspect: d.w ? d.w / d.h / 1.1 : null, maxFps: 25 });
          dev.def = d; dev.cat = cat; dev.drv = this;
          this.devices.set(dev.id, dev);
        }
        this.setStatus('ok', `Verbunden (Session ${res.sessionid})`);
        this.emit('changed');
        return;
      } catch (e) {
        this.setStatus('error', 'Razer Synapse / Chroma SDK nicht erreichbar – läuft Synapse mit Chroma Connect? (' + e.message + ')');
        await sleep(15000);
      }
    }
  }
  _lost() { if (this.stopped || this._reconnecting) return; this._reconnecting = true; clearInterval(this.hb); this.clearDevices(); setTimeout(() => { this._reconnecting = false; this._loop(); }, 3000); }
  async stop() {
    this.stopped = true; clearInterval(this.hb);
    if (this.uri) await fetchJson(this.uri, { method: 'DELETE' }, 1000).catch(() => {});
    this.uri = null; this.clearDevices(); this.setStatus('stopped');
  }
}
module.exports = RazerDriver;
