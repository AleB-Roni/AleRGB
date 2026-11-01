'use strict';
/** SteelSeries GG / Engine über die GameSense-JSON-API. */
const fs = require('fs');
const path = require('path');
const { Driver, Device, matrixLeds, linearLeds, fetchJson, sleep } = require('./base');
const GAME = 'ALERGB';

class SSKeyboard extends Device {
  async write(c) {
    const bitmap = []; for (let i = 0; i < 132; i++) bitmap.push([c[i * 3], c[i * 3 + 1], c[i * 3 + 2]]);
    await this.drv.event('BITMAP', { bitmap });
  }
}
class SSZones extends Device {
  async write(c) {
    const frame = {}; this.zones.forEach((z, i) => (frame[z] = { red: c[i * 3], green: c[i * 3 + 1], blue: c[i * 3 + 2] }));
    await this.drv.event(this.ev, frame);
  }
}

class SteelSeriesDriver extends Driver {
  static meta = {
    id: 'steelseries', name: 'SteelSeries GG', vendor: 'SteelSeries',
    description: 'SteelSeries Tastaturen (per Taste), Mäuse und Headsets über die GameSense-Schnittstelle von SteelSeries GG.',
    help: 'SteelSeries GG installieren und laufen lassen. AleRGB erscheint danach in GG → Engine → Apps (GameSense) und kann dort aktiviert werden.',
    defaultEnabled: true,
    fields: [],
  };
  async start() {
    this.stopped = false;
    const props = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'SteelSeries', 'SteelSeries Engine 3', 'coreProps.json');
    while (!this.stopped) {
      try {
        if (!fs.existsSync(props)) throw new Error('SteelSeries GG nicht installiert (coreProps.json fehlt)');
        const { address } = JSON.parse(fs.readFileSync(props, 'utf8'));
        this.base = 'http://' + address;
        await this.post('game_metadata', { game: GAME, game_display_name: 'AleRGB', developer: 'AleRGB', deinitialize_timer_length_ms: 15000 });
        await this.post('bind_game_event', { game: GAME, event: 'BITMAP', value_optional: true, handlers: [{ 'device-type': 'rgb-per-key-zones', mode: 'bitmap' }] });
        await this.post('bind_game_event', { game: GAME, event: 'MOUSE', value_optional: true, handlers: ['wheel', 'logo'].map((z) => ({ 'device-type': 'mouse', zone: z, mode: 'context-color', 'context-frame-key': z })) });
        await this.post('bind_game_event', { game: GAME, event: 'HEADSET', value_optional: true, handlers: [{ 'device-type': 'headset', zone: 'earcups', mode: 'context-color', 'context-frame-key': 'earcups' }] });
        const kb = new SSKeyboard({ id: 'steelseries:keyboard', name: 'SteelSeries Tastatur', vendor: 'SteelSeries', type: 'keyboard', driver: 'steelseries', leds: matrixLeds(22, 6), aspect: 3.4, maxFps: 30 }); kb.drv = this;
        const ms = new SSZones({ id: 'steelseries:mouse', name: 'SteelSeries Maus', vendor: 'SteelSeries', type: 'mouse', driver: 'steelseries', leds: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }], maxFps: 30 }); ms.drv = this; ms.zones = ['wheel', 'logo']; ms.ev = 'MOUSE';
        const hs = new SSZones({ id: 'steelseries:headset', name: 'SteelSeries Headset', vendor: 'SteelSeries', type: 'headset', driver: 'steelseries', leds: linearLeds(1), maxFps: 30 }); hs.drv = this; hs.zones = ['earcups']; hs.ev = 'HEADSET';
        [kb, ms, hs].forEach((d) => this.devices.set(d.id, d));
        this.hb = setInterval(() => this.post('game_heartbeat', { game: GAME }).catch(() => {}), 10000);
        this.setStatus('ok', 'Verbunden mit GameSense (' + address + ')');
        this.emit('changed');
        return;
      } catch (e) {
        this.setStatus('error', e.message);
        await sleep(20000);
      }
    }
  }
  post(ep, body) { return fetchJson(`${this.base}/${ep}`, { method: 'POST', body: JSON.stringify(body) }, 1500); }
  event(ev, frame) { this.v = ((this.v || 0) + 1) % 100; return this.post('game_event', { game: GAME, event: ev, data: { value: this.v, frame } }); }
  async stop() { this.stopped = true; clearInterval(this.hb); if (this.base) await this.post('stop_game', { game: GAME }).catch(() => {}); this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = SteelSeriesDriver;
