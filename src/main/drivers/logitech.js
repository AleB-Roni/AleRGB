'use strict';
/** Logitech G HUB / LGS über das LED SDK (LogitechLedEnginesWrapper.dll bzw. sdk_legacy_led_x64.dll aus G HUB). */
const { Driver, Device, matrixLeds, linearLeds } = require('./base');
const { koffi, findDll } = require('./dll');

let api = null;
const T_RGB = 2, T_PERKEY = 4;
const ZONE_DEV = { mouse: { type: 1, zones: 2, name: 'Logitech Maus' }, mousepad: { type: 2, zones: 3, name: 'Logitech Mauspad' }, headset: { type: 3, zones: 2, name: 'Logitech Headset' }, speaker: { type: 4, zones: 4, name: 'Logitech Lautsprecher' } };
const pct = (v) => Math.round((v / 255) * 100);

function loadApi(dll) {
  if (api) return api;
  const lib = koffi.load(dll);
  api = {
    init: lib.func('bool LogiLedInitWithName(const char *name)'),
    target: lib.func('bool LogiLedSetTargetDevice(int target)'),
    setAll: lib.func('bool LogiLedSetLighting(int r, int g, int b)'),
    bitmap: lib.func('bool LogiLedSetLightingFromBitmap(uint8_t *bitmap)'),
    zone: lib.func('bool LogiLedSetLightingForTargetZone(int deviceType, int zone, int r, int g, int b)'),
    shutdown: lib.func('void LogiLedShutdown()'),
  };
  return api;
}

class LogiKeyboard extends Device {
  async write(c) {
    const bm = Buffer.alloc(21 * 6 * 4);
    for (let i = 0; i < 126; i++) { bm[i * 4] = c[i * 3 + 2]; bm[i * 4 + 1] = c[i * 3 + 1]; bm[i * 4 + 2] = c[i * 3]; bm[i * 4 + 3] = 255; }
    api.target(T_PERKEY); api.bitmap(bm);
  }
}
class LogiZones extends Device {
  async write(c) { api.target(T_RGB); for (let z = 0; z < this.ledCount; z++) api.zone(this.ltype, z, pct(c[z * 3]), pct(c[z * 3 + 1]), pct(c[z * 3 + 2])); }
}
class LogiAll extends Device {
  async write(c) { api.target(T_RGB); api.setAll(pct(c[0]), pct(c[1]), pct(c[2])); }
}

class LogitechDriver extends Driver {
  static meta = {
    id: 'logitech', name: 'Logitech G HUB', vendor: 'Logitech',
    description: 'Logitech G Tastaturen (per Taste), Mäuse, Headsets, Mauspads und Lautsprecher über das LIGHTSYNC LED SDK.',
    help: 'G HUB installieren → Einstellungen → „Spielen und Anwendungen erlauben, die Beleuchtung zu steuern“ aktivieren. Die DLL (sdk_legacy_led_x64.dll) liefert G HUB mit; alternativ LogitechLedEnginesWrapper.dll aus dem Logitech LED SDK in den Ordner „sdk“ legen.',
    defaultEnabled: true,
    fields: [
      { key: 'dllPath', label: 'Pfad zur LED-SDK-DLL (optional)', type: 'file', default: '' },
      { key: 'devices', label: 'Gerätetypen', type: 'multi', options: ['keyboard', 'mouse', 'headset', 'mousepad', 'speaker', 'all'], default: ['keyboard', 'mouse', 'headset'] },
    ],
  };
  async start() {
    if (process.platform !== 'win32') return this.setStatus('unsupported', 'Nur unter Windows verfügbar.');
    if (!koffi) return this.setStatus('error', 'FFI-Modul „koffi“ fehlt – npm install ausführen.');
    const dll = findDll(['LogitechLedEnginesWrapper.dll', 'sdk_legacy_led_x64.dll'], ['C:\\Program Files\\LGHUB', 'C:\\Program Files\\Logitech Gaming Software\\SDK\\LED\\x64'], this.config.dllPath);
    if (!dll) return this.setStatus('error', 'Logitech LED-SDK-DLL nicht gefunden (siehe Hilfe).');
    try {
      const a = loadApi(dll);
      if (!a.init('Spectra RGB')) throw new Error('LogiLedInit fehlgeschlagen – läuft G HUB und ist die App-Steuerung erlaubt?');
      const sel = this.config.devices || [];
      if (sel.includes('keyboard')) this.devices.set('logitech:keyboard', new LogiKeyboard({ id: 'logitech:keyboard', name: 'Logitech Tastatur', vendor: 'Logitech', type: 'keyboard', driver: 'logitech', leds: matrixLeds(21, 6), aspect: 3.2, maxFps: 30 }));
      for (const k of Object.keys(ZONE_DEV)) if (sel.includes(k)) {
        const z = ZONE_DEV[k]; const d = new LogiZones({ id: 'logitech:' + k, name: z.name, vendor: 'Logitech', type: k, driver: 'logitech', leds: linearLeds(z.zones), maxFps: 30 }); d.ltype = z.type; this.devices.set(d.id, d);
      }
      if (sel.includes('all')) this.devices.set('logitech:all', new LogiAll({ id: 'logitech:all', name: 'Logitech (alle RGB-Geräte)', vendor: 'Logitech', type: 'other', driver: 'logitech', leds: linearLeds(1), maxFps: 30 }));
      this.setStatus('ok', 'Verbunden über ' + require('path').basename(dll));
      this.emit('changed');
    } catch (e) { this.setStatus('error', e.message); }
  }
  async stop() { if (api) try { api.shutdown(); } catch {} this.clearDevices(); this.setStatus('stopped'); }
}
module.exports = LogitechDriver;
