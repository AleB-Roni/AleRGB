'use strict';
/**
 * Mainboard-Lüftersteuerung.
 * Startet den Lüfter-Dienst (AleRGB.FanHelper.exe, LibreHardwareMonitor + PawnIO) mit Adminrechten
 * und spricht mit ihm über eine lokale TCP-Verbindung (127.0.0.1 + Zufalls-Token).
 * Kurven, Glättung und Sicherheitsregeln laufen hier in AleRGB.
 */
const EventEmitter = require('events');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const PRESETS = {
  silent: { label: 'Leise', points: [[30, 25], [50, 35], [65, 55], [80, 100]] },
  balanced: { label: 'Ausgewogen', points: [[30, 35], [50, 50], [65, 70], [80, 100]] },
  performance: { label: 'Leistung', points: [[30, 50], [50, 65], [65, 85], [75, 100]] },
};
const CRITICAL = { cpu: 90, gpu: 88, liquid: 50 }; // Ab hier: alle gesteuerten Lüfter 100 %
const MIN_DUTY = 20; // Nie unter 20 % (Ausnahme: ausdrücklich „0 % erlauben“)

function interpolate(points, t) {
  const p = points.slice().sort((a, b) => a[0] - b[0]);
  if (t <= p[0][0]) return p[0][1];
  if (t >= p[p.length - 1][0]) return p[p.length - 1][1];
  const i = p.findIndex((x) => x[0] >= t); const a = p[i - 1], b = p[i];
  return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
}

class FanService extends EventEmitter {
  constructor(config, log, opts = {}) {
    super();
    this.config = config; this.log = log; this.opts = opts;
    this.status = 'stopped'; this.message = ''; this.sensors = []; this.controls = []; this.sock = null;
    this.applied = {}; this.extraSensors = () => [];
  }
  get settings() { return { autoStart: false, allowZero: false, fans: {}, ...(this.config.get('fans') || {}) }; }
  save(patch) { this.config.set('fans', { ...this.settings, ...patch }); this.emit('changed'); }

  helperPath() {
    const cands = [
      process.resourcesPath && path.join(process.resourcesPath, 'fanhelper', 'AleRGB.FanHelper.exe'),
      path.join(__dirname, '..', '..', '..', 'fanhelper', 'bin', 'AleRGB.FanHelper.exe'),
    ].filter(Boolean);
    return cands.find((p) => fs.existsSync(p)) || null;
  }
  pawnioInstalled() {
    if (process.platform !== 'win32') return Promise.resolve(false);
    return new Promise((res) => execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PawnIO'], { windowsHide: true }, (e) => res(!e)));
  }

  /** Startet den Dienst. Windows zeigt dabei die Benutzerkontensteuerung (UAC). */
  async start() {
    if (this.status === 'running' || this.status === 'starting') return;
    const exe = this.opts.helperCmd ? null : this.helperPath();
    if (process.platform !== 'win32' && !this.opts.helperCmd) return this._set('unsupported', 'Mainboard-Lüftersteuerung gibt es nur unter Windows.');
    if (!exe && !this.opts.helperCmd) return this._set('error', 'Lüfter-Dienst (AleRGB.FanHelper.exe) fehlt in der Installation.');
    this.token = crypto.randomBytes(16).toString('hex');
    this._set('starting', 'Warte auf Bestätigung der Windows-Benutzerkontensteuerung …');
    this.server = net.createServer((sock) => this._onConnect(sock));
    await new Promise((r) => this.server.listen(0, '127.0.0.1', r));
    const port = this.server.address().port;
    const args = ['--port', String(port), '--token', this.token];
    if (this.opts.helperCmd) {
      this.proc = spawn(this.opts.helperCmd[0], [...this.opts.helperCmd.slice(1), ...args], { stdio: 'ignore' });
    } else {
      // Startet mit Adminrechten (UAC). AleRGB selbst bleibt ein normales Programm.
      const ps = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList '${args.join("','")}' -Verb RunAs -WindowStyle Hidden`;
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
      this.proc.on('exit', (code) => { if (code && this.status === 'starting') this._fail('Die Benutzerkontensteuerung wurde abgelehnt – ohne Adminrechte kann der Mainboard-Chip nicht gesteuert werden.'); });
    }
    this.startTimer = setTimeout(() => { if (this.status === 'starting') this._fail('Der Lüfter-Dienst hat sich nicht gemeldet (Zeitüberschreitung).'); }, 90000);
  }
  _onConnect(sock) {
    let buf = '', authed = false;
    sock.setEncoding('utf8');
    sock.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (!authed) {
          if (msg.type !== 'hello' || msg.token !== this.token) { sock.destroy(); return; }
          authed = true; this.sock = sock; clearTimeout(this.startTimer);
          this.pawnio = msg.pawnio;
          this._set('running', msg.pawnio ? 'Verbunden' : 'Verbunden – aber der PawnIO-Treiber fehlt, daher sind evtl. keine Mainboard-Lüfter sichtbar.');
          this.server.close(); // keine weiteren Verbindungen annehmen
          this.ping = setInterval(() => this.send({ cmd: 'ping' }), 1000);
          this.loop = setInterval(() => this._regulate(), 1000);
          continue;
        }
        if (msg.type === 'state') { this.sensors = msg.sensors || []; this.controls = msg.controls || []; this.emit('changed'); }
        else if (msg.type === 'error') this.log('warn', 'Lüfter-Dienst: ' + msg.message);
      }
    });
    sock.on('close', () => { if (this.sock === sock) this._fail('Verbindung zum Lüfter-Dienst getrennt – das BIOS steuert die Lüfter wieder.'); });
    sock.on('error', () => {});
  }
  send(o) { if (this.sock) this.sock.write(JSON.stringify(o) + '\n'); }
  _set(status, message) { this.status = status; this.message = message; this.emit('changed'); }
  _fail(message) { this._cleanup(); this._set('error', message); this.log('warn', 'Lüfter: ' + message); }
  _cleanup() {
    clearInterval(this.ping); clearInterval(this.loop); clearTimeout(this.startTimer);
    try { this.server && this.server.close(); } catch {}
    try { this.sock && this.sock.destroy(); } catch {}
    this.sock = null; this.applied = {};
  }
  async stop() {
    if (this.sock) { this.send({ cmd: 'quit' }); await new Promise((r) => setTimeout(r, 300)); }
    this._cleanup(); this._set('stopped', '');
  }

  // ---------------- Sensoren ----------------
  allSensors() { return [...this.sensors.filter((s) => s.type === 'Temperature'), ...this.extraSensors()]; }
  sensorValue(id) { const s = this.allSensors().find((x) => x.id === id); return s && typeof s.value === 'number' ? s.value : null; }
  /** Wichtigste Temperaturen (für Kurven-Vorauswahl und Sicherheitsregel) */
  keyTemps() {
    const t = this.sensors.filter((s) => s.type === 'Temperature' && typeof s.value === 'number');
    const cpu = t.find((s) => /Cpu/i.test(s.hwType) && /Package|Tctl|Tdie|Core \(Tctl/i.test(s.name)) || t.find((s) => /Cpu/i.test(s.hwType));
    const gpu = t.find((s) => /Gpu/i.test(s.hwType) && /Core|GPU Core|Edge/i.test(s.name)) || t.find((s) => /Gpu/i.test(s.hwType));
    const liquid = this.extraSensors().find((s) => s.id === 'kraken:liquid');
    return { cpu, gpu, liquid };
  }
  defaultSensorId() { const k = this.keyTemps(); return (k.cpu && k.cpu.id) || (k.liquid && k.liquid.id) || null; }

  // ---------------- Regelung ----------------
  targetFor(ctrl, cfg) {
    if (!cfg || cfg.mode === 'bios' || !cfg.mode) return null;
    let duty;
    if (cfg.mode === 'fixed') duty = Number.isFinite(cfg.duty) ? cfg.duty : 50;
    else {
      const sid = cfg.sensor || this.defaultSensorId();
      const t = sid ? this.sensorValue(sid) : null;
      const pts = cfg.points || (PRESETS[cfg.preset] || PRESETS.balanced).points;
      duty = t === null ? 70 : interpolate(pts, t); // Sensor fehlt → sicherer Mittelwert
    }
    if (!Number.isFinite(duty)) return 100; // Im Zweifel kühlen, nie stoppen
    const min = this.settings.allowZero ? 0 : MIN_DUTY;
    return Math.max(min, Math.min(100, duty));
  }
  critical() {
    const k = this.keyTemps();
    if (k.cpu && k.cpu.value >= CRITICAL.cpu) return `CPU ${k.cpu.value} °C`;
    if (k.gpu && k.gpu.value >= CRITICAL.gpu) return `GPU ${k.gpu.value} °C`;
    if (k.liquid && k.liquid.value >= CRITICAL.liquid) return `Wasser ${k.liquid.value} °C`;
    return null;
  }
  _regulate() {
    if (!this.sock) return;
    const fans = this.settings.fans;
    const crit = this.critical();
    if (crit && !this.critWarned) { this.log('warn', `Lüfter: kritische Temperatur (${crit}) – alle gesteuerten Lüfter auf 100 %`); this.critWarned = true; }
    if (!crit) this.critWarned = false;
    for (const c of this.controls) {
      const cfg = fans[c.id];
      let target = this.targetFor(c, cfg);
      if (target === null) {
        if (this.applied[c.id] !== undefined) { this.send({ cmd: 'default', id: c.id }); delete this.applied[c.id]; }
        continue;
      }
      if (crit) target = 100;
      // Sanft regeln: max. 8 %/s runter, beliebig schnell hoch (Sicherheit)
      const prev = Number.isFinite(this.applied[c.id]) ? this.applied[c.id] : undefined;
      if (prev !== undefined && target < prev) target = Math.max(target, prev - 8);
      target = Math.round(target);
      if (prev === undefined || Math.abs(prev - target) >= 1) { this.send({ cmd: 'set', id: c.id, value: target }); this.applied[c.id] = target; }
    }
  }
  setFan(id, cfg) { const fans = { ...this.settings.fans }; fans[id] = { ...(fans[id] || {}), ...cfg }; this.save({ fans }); this._regulate(); }

  state() {
    const k = this.keyTemps();
    return {
      status: this.status, message: this.message, pawnio: this.pawnio, platform: process.platform,
      settings: this.settings, presets: PRESETS, critical: CRITICAL, minDuty: MIN_DUTY,
      controls: this.controls.map((c) => ({ ...c, target: this.applied[c.id] ?? null })),
      sensors: this.allSensors(), key: { cpu: k.cpu || null, gpu: k.gpu || null, liquid: k.liquid || null }, defaultSensor: this.defaultSensorId(),
    };
  }
}

module.exports = { FanService, interpolate, PRESETS };
