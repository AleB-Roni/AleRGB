'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    fps: 30, brightness: 100, power: true, autostart: false, startMinimized: false, closeToTray: true,
    offOnLock: false, offOnSleep: true, offOnExit: true, hotkeys: true, audioSource: 'system', screenSmoothing: 0.5,
  },
  drivers: {},
  devices: {},
  effect: { key: 'native:aurora', params: {} },
  effectParams: {},
  profiles: [],
  activeProfile: null,
};

class Config {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    let data = {};
    try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    this.data = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...data };
    this.data.settings = { ...DEFAULTS.settings, ...(data.settings || {}) };
  }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 400);
  }
  flush() {
    clearTimeout(this._t);
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2)); fs.renameSync(this.file + '.tmp', this.file); } catch (e) { console.error(e); }
  }
}
module.exports = Config;
