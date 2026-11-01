'use strict';
/** Corsair iCUE SDK v4 (iCUESDK.x64_2019.dll) via FFI. Benötigt laufendes iCUE (4.31+ / 5.x). */
const { Driver, Device, normalize, sleep } = require('./base');
const { koffi, findDll } = require('./dll');

const TYPE = { 1: 'keyboard', 2: 'mouse', 4: 'mousepad', 8: 'headset', 16: 'headset', 32: 'fan', 64: 'ledstrip', 128: 'ram', 256: 'motherboard', 512: 'gpu', 1024: 'cooler', 2048: 'touchbar', 4096: 'gamepad' };
let api = null;

function loadApi(dll) {
  if (api) return api;
  const lib = koffi.load(dll);
  const Version = koffi.struct('CorsairVersion', { major: 'int', minor: 'int', patch: 'int' });
  const Details = koffi.struct('CorsairSessionDetails', { clientVersion: Version, serverVersion: Version, serverHostVersion: Version });
  const StateChanged = koffi.struct('CorsairSessionStateChanged', { state: 'int', details: Details });
  const DeviceInfo = koffi.struct('CorsairDeviceInfo', { type: 'int', id: koffi.array('char', 128, 'String'), serial: koffi.array('char', 128, 'String'), model: koffi.array('char', 128, 'String'), ledCount: 'int', channelCount: 'int' });
  koffi.struct('CorsairDeviceFilter', { deviceTypeMask: 'int' });
  const LedPos = koffi.struct('CorsairLedPosition', { id: 'uint32', cx: 'double', cy: 'double' });
  koffi.struct('CorsairLedColor', { id: 'uint32', r: 'uint8', g: 'uint8', b: 'uint8', a: 'uint8' });
  const Handler = koffi.proto('void CorsairSessionStateChangedHandler(void *context, const CorsairSessionStateChanged *eventData)');
  api = {
    DeviceInfo, LedPos, Handler,
    connect: lib.func('int CorsairConnect(CorsairSessionStateChangedHandler *cb, void *context)'),
    disconnect: lib.func('int CorsairDisconnect()'),
    getDevices: lib.func('int CorsairGetDevices(const CorsairDeviceFilter *filter, int sizeMax, void *devices, _Out_ int *size)'),
    getLedPositions: lib.func('int CorsairGetLedPositions(const char *deviceId, int sizeMax, void *ledPositions, _Out_ int *size)'),
    setLedColors: lib.func('int CorsairSetLedColors(const char *deviceId, int size, const CorsairLedColor *ledsColors)'),
    requestControl: lib.func('int CorsairRequestControl(const char *deviceId, int accessLevel)'),
    releaseControl: lib.func('int CorsairReleaseControl(const char *deviceId)'),
  };
  return api;
}

class CorsairDevice extends Device {
  async write(c) {
    const arr = this.luids.map((id, i) => ({ id, r: c[i * 3], g: c[i * 3 + 1], b: c[i * 3 + 2], a: 255 }));
    const err = api.setLedColors(this.cid, arr.length, arr);
    if (err) throw new Error('CorsairSetLedColors Fehler ' + err);
  }
}

class CorsairDriver extends Driver {
  static meta = {
    id: 'corsair', name: 'Corsair iCUE', vendor: 'Corsair',
    description: 'Alle iCUE-Geräte (Tastaturen, Mäuse, Headsets, Lüfter, Commander/Lighting Node, RAM, AIOs) über das offizielle iCUE SDK.',
    help: 'iCUE installieren → Einstellungen → „SDK aktivieren“ (Software and Games Integration). iCUESDK.x64_2019.dll von github.com/CorsairOfficial/cue-sdk (Releases) in den Ordner „sdk“ von AleRGB legen oder Pfad unten eintragen. Hinweis: Nicht gleichzeitig mit dem OpenRGB-Corsair-Treiber verwenden.',
    defaultEnabled: true,
    fields: [
      { key: 'dllPath', label: 'Pfad zu iCUESDK.x64_2019.dll (optional)', type: 'file', default: '' },
      { key: 'exclusive', label: 'Exklusive Kontrolle (iCUE-Effekte pausieren)', type: 'bool', default: true },
    ],
  };
  async start() {
    this.stopped = false;
    if (process.platform !== 'win32') return this.setStatus('unsupported', 'Nur unter Windows verfügbar.');
    if (!koffi) return this.setStatus('error', 'FFI-Modul „koffi“ fehlt – npm install ausführen.');
    const dll = findDll(['iCUESDK.x64_2019.dll'], ['C:\\Program Files\\Corsair\\CORSAIR iCUE 5 Software', 'C:\\Program Files\\Corsair\\CORSAIR iCUE 4 Software'], this.config.dllPath);
    if (!dll) return this.setStatus('error', 'iCUESDK.x64_2019.dll nicht gefunden (siehe Hilfe).');
    try {
      const a = loadApi(dll);
      this.cb = koffi.register((ctx, ev) => { /* Statuswechsel – wir pollen zusätzlich */ }, koffi.pointer(a.Handler));
      const e = a.connect(this.cb, null);
      if (e) throw new Error('CorsairConnect Fehler ' + e);
      this.setStatus('connecting', 'Warte auf iCUE …');
      for (let tries = 0; tries < 20 && !this.stopped; tries++) {
        await sleep(750);
        if (this._enumerate()) return;
      }
      this.setStatus('error', 'iCUE antwortet nicht. Läuft iCUE und ist das SDK in den iCUE-Einstellungen aktiviert?');
    } catch (e) { this.setStatus('error', e.message); }
  }
  _enumerate() {
    const a = api; const max = 64;
    const buf = koffi.alloc(a.DeviceInfo, max); const n = [0];
    const err = a.getDevices({ deviceTypeMask: -1 }, max, buf, n);
    if (err) { koffi.free(buf); return false; }
    const infos = n[0] ? [].concat(koffi.decode(buf, a.DeviceInfo, n[0])) : [];
    koffi.free(buf);
    for (const d of infos) {
      if (!d.ledCount) continue;
      const pb = koffi.alloc(a.LedPos, 512); const pn = [0];
      a.getLedPositions(d.id, 512, pb, pn);
      const pos = pn[0] ? [].concat(koffi.decode(pb, a.LedPos, pn[0])) : [];
      koffi.free(pb);
      if (!pos.length) continue;
      if (this.config.exclusive !== false) a.requestControl(d.id, 1);
      const pts = normalize(pos.map((p) => ({ x: p.cx, y: p.cy })));
      const xs = pos.map((p) => p.cx), ys = pos.map((p) => p.cy);
      const aspect = (Math.max(...xs) - Math.min(...xs) || 1) / (Math.max(...ys) - Math.min(...ys) || 1);
      const dev = new CorsairDevice({ id: 'corsair:' + (d.serial || d.id), name: 'Corsair ' + d.model, vendor: 'Corsair', type: TYPE[d.type] || 'other', driver: 'corsair', leds: pts, aspect: Math.min(6, Math.max(0.3, aspect)), maxFps: 60 });
      dev.cid = d.id; dev.luids = pos.map((p) => p.id);
      this.devices.set(dev.id, dev);
    }
    this.setStatus('ok', `${this.devices.size} Corsair-Gerät(e) über iCUE SDK`);
    this.emit('changed');
    return true;
  }
  async stop() {
    this.stopped = true;
    if (api) { for (const d of this.devices.values()) try { api.releaseControl(d.cid); } catch {} try { api.disconnect(); } catch {} }
    this.clearDevices(); this.setStatus('stopped');
  }
}
module.exports = CorsairDriver;
