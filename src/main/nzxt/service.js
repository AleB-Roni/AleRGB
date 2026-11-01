'use strict';
/** Verbindet den Kraken automatisch, liest Messwerte und wendet gespeicherte Einstellungen an. */
const EventEmitter = require('events');
const { Kraken, PRESETS } = require('./kraken');

const DEFAULTS = { pump: { mode: 'preset', preset: 'balanced', duty: 70 }, fan: { mode: 'preset', preset: 'balanced', duty: 50 }, brightness: null, orientation: null, display: null };

class KrakenService extends EventEmitter {
  constructor(config, log) {
    super();
    this.config = config; this.log = log; this.k = null; this.busy = null; this.fails = 0;
  }
  get settings() { const s = this.config.get('kraken') || {}; return { ...DEFAULTS, ...s, pump: { ...DEFAULTS.pump, ...(s.pump || {}) }, fan: { ...DEFAULTS.fan, ...(s.fan || {}) } }; }
  save(patch) { this.config.set('kraken', { ...this.settings, ...patch }); }
  start() { this._tick(); this.timer = setInterval(() => this._tick(), 2000); }
  async _tick() {
    if (this._ticking) return; this._ticking = true;
    try {
      if (!this.k || !this.k.connected) {
        if (!Kraken.find()) { if (this.k) { this.k = null; this.emit('changed'); } return; }
        if (this.retryAt && Date.now() < this.retryAt) return;
        const k = new Kraken(this.log);
        k.on('changed', () => this.emit('changed'));
        if (await k.connect()) { this.k = k; this.lastProbe = k.probe; await this.applySaved(); }
        else { this.lastError = k.error; this.lastProbe = k.probe; this.retryAt = Date.now() + 15000; }
        this.emit('changed');
        return;
      }
      if (!this.busy) {
        try { await this.k.readStatus(); this.fails = 0; }
        catch (e) { if (++this.fails >= 3) { this.log('warn', 'Kraken antwortet nicht mehr – verbinde neu'); await this.k.close(); this.k = null; this.fails = 0; } }
        this.emit('changed');
      }
    } catch (e) { this.log('warn', 'Kraken: ' + e.message); }
    finally { this._ticking = false; }
  }
  async applySaved() {
    const s = this.settings;
    for (const ch of this.k.channels()) await this.applySpeed(ch, s[ch]).catch((e) => this.log('warn', `Kraken ${ch}: ${e.message}`));
    if (this.k.hasLcd && s.brightness !== null) await this.k.setBrightness(s.brightness).catch(() => {});
  }
  async applySpeed(ch, cfg) {
    if (cfg.mode === 'fixed') return this.k.setFixed(ch, cfg.duty);
    const p = PRESETS[cfg.preset] || PRESETS.balanced;
    return this.k.setCurve(ch, p[ch]);
  }
  _need() { if (!this.k || !this.k.connected) throw new Error('Kein NZXT Kraken verbunden.'); return this.k; }
  async setSpeed(ch, cfg) { const k = this._need(); const s = this.settings; s[ch] = { ...s[ch], ...cfg }; this.save({ [ch]: s[ch] }); await this.applySpeed(ch, s[ch]); this.emit('changed'); }
  async setBrightness(v) { const k = this._need(); await k.setBrightness(v); this.save({ brightness: v }); this.emit('changed'); }
  async setOrientation(deg) { const k = this._need(); await k.setOrientation(deg); this.save({ orientation: deg }); this.emit('changed'); }
  async showLiquid() { const k = this._need(); await k.showLiquid(); this.save({ display: 'liquid' }); this.emit('changed'); }
  async upload(kind, data, name) {
    const k = this._need();
    this.busy = kind; this.emit('changed');
    try {
      if (kind === 'gif') await k.uploadGif(Buffer.from(data)); else await k.uploadImage(new Uint8Array(data));
      this.save({ display: kind, displayName: name || null });
      this.log('info', `Kraken: ${kind === 'gif' ? 'GIF' : 'Bild'} übertragen (${(data.byteLength / 1024).toFixed(0)} KB)`);
    } finally { this.busy = null; this.emit('changed'); }
  }
  state() {
    const base = this.k ? this.k.toJSON() : { connected: false, error: this.lastError || null, probe: this.lastProbe || null };
    return { ...base, busy: this.busy, settings: this.settings, presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, { label: v.label, pump: v.pump, fan: v.fan }])) };
  }
  retry() { this.retryAt = 0; this.lastError = null; this._tick(); }
  async stop() { clearInterval(this.timer); if (this.k) await this.k.close(); }
}
module.exports = KrakenService;
