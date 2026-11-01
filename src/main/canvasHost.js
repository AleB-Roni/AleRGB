'use strict';
/**
 * Führt HTML-Canvas-Effekte in einem unsichtbaren, abgeschotteten Fenster aus und liefert die Pixel an die Engine.
 */
const { BrowserWindow, ipcMain, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SAMPLE_W = 96, SAMPLE_H = 60;

function shim(props, sw, sh) {
  return `<script>(function(){
  var S = window.__spectra; if (!S) return;
  var props = ${JSON.stringify(props)};
  for (var k in props) window[k] = props[k];
  var freq = new Array(200).fill(0);
  window.engine = window.engine || {};
  window.engine.audio = { level: -100, density: 0, freq: freq, bands: [], bass: 0, levelNorm: 0 };
  window.engine.width = 320; window.engine.height = 200;
  window.engine.getProperty = function(k){ return window[k]; };
  function pump(){
    var a = S.audio();
    if (a) { var e = window.engine.audio; e.level = a.db; e.levelNorm = a.level; e.density = a.density; e.bass = a.bass; e.bands = a.bands;
      for (var i = 0; i < 200; i++) freq[i] = a.freq[i] || 0; }
    var p = S.props();
    if (p) for (var k in p) { if (window[k] !== p[k]) { window[k] = p[k]; var cb = window['on' + k + 'Changed']; if (typeof cb === 'function') { try { cb(); } catch (err) { console.error(err); } } } }
  }
  var sc = document.createElement('canvas'); sc.width = ${sw}; sc.height = ${sh};
  var sx = sc.getContext('2d', { willReadFrequently: true });
  var last = 0;
  function sample(){
    var now = performance.now(); if (now - last < 30) return; last = now;
    var c = document.getElementById('exCanvas') || document.querySelector('canvas'); if (!c || !c.width) return;
    try { sx.clearRect(0,0,${sw},${sh}); sx.drawImage(c, 0, 0, ${sw}, ${sh}); S.frame(sx.getImageData(0, 0, ${sw}, ${sh}).data.buffer); } catch (err) {}
  }
  var nativeRaf = window.requestAnimationFrame.bind(window), queue = [], scheduled = false;
  function run(ts){ scheduled = false; pump(); var q = queue; queue = []; for (var i = 0; i < q.length; i++) { try { q[i](ts); } catch (err) { console.error(err); } } sample(); if (!queue.length) { scheduled = true; nativeRaf(run); } }
  window.requestAnimationFrame = function(cb){ queue.push(cb); if (!scheduled) { scheduled = true; nativeRaf(run); } return queue.length; };
  // Effekte, die setInterval statt rAF nutzen, werden ebenfalls abgetastet
  setInterval(function(){ if (!scheduled) { pump(); sample(); } }, 33);
})();</script>`;
}

class CanvasHost {
  constructor(tmpDir, log) {
    this.tmpDir = tmpDir; this.log = log; this.frame = null; this.props = {}; this.audio = null; this.win = null;
    fs.mkdirSync(tmpDir, { recursive: true });
    ipcMain.on('fx:frame', (e, buf) => { if (this.win && e.sender === this.win.webContents) this.frame = { w: SAMPLE_W, h: SAMPLE_H, data: new Uint8Array(buf) }; });
    ipcMain.handle('fx:get', () => ({ props: this.props, audio: this.audio }));
    const ses = session.fromPartition('spectra-effects');
    ses.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  }
  /** Lädt eine HTML-Datei oder Quelltext (für die Editor-Vorschau). */
  load({ file, html, baseDir, props }) {
    this.props = { ...props };
    const src = html ?? fs.readFileSync(file, 'utf8');
    const dir = baseDir || (file ? path.dirname(file) : this.tmpDir);
    const inject = `<base href="${pathToFileURL(dir + path.sep).href}">` + shim(this.props, SAMPLE_W, SAMPLE_H);
    let out = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, (m) => m + inject) : inject + src;
    const tmp = path.join(this.tmpDir, 'active-effect.html');
    fs.writeFileSync(tmp, out);
    this.frame = null;
    if (!this.win || this.win.isDestroyed()) {
      this.win = new BrowserWindow({
        show: false, width: 320, height: 200, useContentSize: true, paintWhenInitiallyHidden: true,
        webPreferences: { partition: 'spectra-effects', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.join(__dirname, '..', 'preload-effect.js') },
      });
      this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.win.webContents.on('will-navigate', (e) => e.preventDefault());
      this.win.webContents.on('console-message', (e, level, msg, line) => { if (level >= 2 && !/Electron Security Warning/.test(msg)) this.log('warn', `[Canvas-Effekt] ${msg} (Zeile ${line})`); });
      this.win.webContents.on('render-process-gone', () => this.log('error', 'Canvas-Effekt abgestürzt'));
    }
    this.win.loadFile(tmp).catch((e) => this.log('error', 'Canvas-Effekt: ' + e.message));
  }
  setProps(p) { this.props = { ...this.props, ...p }; }
  setAudio(a) { this.audio = a; }
  unload() { if (this.win && !this.win.isDestroyed()) this.win.destroy(); this.win = null; this.frame = null; }
  /** Bilineares Abtasten an normierter Position */
  sample(x, y, o) {
    const f = this.frame; if (!f) { o[0] = o[1] = o[2] = 0; return; }
    const fx = Math.min(f.w - 1.001, Math.max(0, x * (f.w - 1))), fy = Math.min(f.h - 1.001, Math.max(0, y * (f.h - 1)));
    const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, d = f.data, w = f.w;
    for (let c = 0; c < 3; c++) {
      const a = d[(y0 * w + x0) * 4 + c], b = d[(y0 * w + x0 + 1) * 4 + c], cc = d[((y0 + 1) * w + x0) * 4 + c], dd = d[((y0 + 1) * w + x0 + 1) * 4 + c];
      o[c] = (a * (1 - ax) + b * ax) * (1 - ay) + (cc * (1 - ax) + dd * ax) * ay;
    }
  }
}
module.exports = CanvasHost;
