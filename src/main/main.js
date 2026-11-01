'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, powerMonitor, dialog, desktopCapturer, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Config = require('./config');
const Core = require('./core');
const CanvasHost = require('./canvasHost');
const { EffectLibrary, parseHtmlEffect } = require('./effectLibrary');
const { runDiagnostics } = require('./diagnostics');
const KrakenService = require('./nzxt/service');

const DEMO = process.argv.includes('--demo');
const HIDDEN = process.argv.includes('--hidden');
if (process.env.ALERGB_USERDATA) app.setPath('userData', process.env.ALERGB_USERDATA);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let win, tray, core, config, library, canvas, kraken;
const logs = [];
function log(level, msg) {
  const e = { t: Date.now(), level, msg: String(msg) };
  logs.push(e); if (logs.length > 500) logs.shift();
  if (win && !win.isDestroyed()) win.webContents.send('log', e);
  if (level === 'error') console.error(msg); else if (process.env.ALERGB_DEBUG) console.log(`[${level}] ${msg}`);
}

const ICON = path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

function createWindow() {
  const s = config.get('settings');
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1000, minHeight: 640, show: false,
    backgroundColor: '#0a0b12', icon: ICON, title: 'AleRGB',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0b12', symbolColor: '#c9cbe0', height: 40 },
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!(HIDDEN || s.startMinimized)) win.show(); });
  win.on('close', (e) => { if (!app.isQuitting && config.get('settings').closeToTray) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // Bildschirm-/System-Audio-Aufnahme für Ambilight & Audio-Effekte ohne Auswahldialog
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((src) => cb({ video: src[0], audio: process.platform === 'win32' ? 'loopback' : undefined })).catch(() => cb({}));
  });
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('AleRGB');
  tray.on('click', () => { win.show(); win.focus(); });
  updateTray();
}
function updateTray() {
  if (!tray) return;
  const s = config.get('settings');
  const fav = library.list.filter((e) => ['native:rainbow', 'native:aurora', 'native:static', 'native:audio_spectrum', 'native:ambilight'].includes(e.key));
  const menu = Menu.buildFromTemplate([
    { label: 'AleRGB öffnen', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    { label: s.power ? 'Beleuchtung ausschalten' : 'Beleuchtung einschalten', click: () => setSettings({ power: !s.power }) },
    { label: 'Helligkeit', submenu: [100, 75, 50, 25, 10].map((v) => ({ label: v + ' %', type: 'radio', checked: s.brightness === v, click: () => setSettings({ brightness: v }) })) },
    { label: 'Effekt', submenu: fav.map((e) => ({ label: e.name, type: 'radio', checked: config.get('effect').key === e.key, click: () => core.setEffect({ key: e.key }) })) },
    { label: 'Profil', enabled: config.get('profiles').length > 0, submenu: config.get('profiles').map((p) => ({ label: p.name, type: 'radio', checked: config.get('activeProfile') === p.id, click: () => core.applyProfile(p.id) })) },
    { type: 'separator' },
    { label: 'Beenden', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function setSettings(patch) {
  const s = { ...config.get('settings'), ...patch };
  config.set('settings', s);
  if ('autostart' in patch && process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: !!s.autostart, args: ['--hidden'] });
  if ('hotkeys' in patch) registerHotkeys();
  core.emit('state');
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  if (!config.get('settings').hotkeys) return;
  const reg = (acc, fn) => { try { globalShortcut.register(acc, fn); } catch {} };
  reg('Control+Alt+L', () => setSettings({ power: !config.get('settings').power }));
  reg('Control+Alt+Right', () => core.cycleProfile(1));
  reg('Control+Alt+Left', () => core.cycleProfile(-1));
  reg('Control+Alt+Up', () => setSettings({ brightness: Math.min(100, config.get('settings').brightness + 10) }));
  reg('Control+Alt+Down', () => setSettings({ brightness: Math.max(0, config.get('settings').brightness - 10) }));
}

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

function setupIpc() {
  const h = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => { try { return { ok: true, data: await fn(...a) }; } catch (err) { log('error', `${ch}: ${err.message}`); return { ok: false, error: err.message }; } });
  h('state:get', () => core.state());
  h('device:update', (id, patch) => core.updateDevice(id, patch));
  h('device:identify', (id) => core.identifyDevice(id));
  h('layout:auto', () => core.autoLayout());
  h('effect:set', (spec) => { if (core._previewing || core._previewLayers) core.endPreview(); core.setEffect(spec); updateTray(); });
  h('settings:update', (patch) => { setSettings(patch); updateTray(); });
  h('driver:update', (id, patch) => core.updateDriver(id, patch));
  h('driver:restart', (id) => core.restartDriver(id));
  h('driver:action', (id, action, args) => core.driverAction(id, action, args));
  h('drivers:rescan', async () => { for (const id of core.drivers.keys()) if (core.drivers.get(id).config.enabled) await core.restartDriver(id); });
  h('profile:save', (name, id) => { const r = core.saveProfile(name, id); updateTray(); return r; });
  h('profile:apply', (id) => { core.applyProfile(id); updateTray(); });
  h('profile:delete', (id) => { core.deleteProfile(id); updateTray(); });
  h('profile:rename', (id, name) => { core.renameProfile(id, name); updateTray(); });
  h('diag:run', () => runDiagnostics(core));
  h('log:get', () => logs);
  // Effekt-Bibliothek
  h('fx:getCode', (key) => library.getCode(key));
  h('fx:saveCode', (key, name, html) => { const k = library.saveCode(key, name, html); core.endPreview(); core._canvasKey = null; core.setEffect({ key: k }); return k; });
  h('fx:saveLayers', (def, key) => { const k = library.saveLayers(def, key); core.endPreview(); core.setEffect({ key: k }); return k; });
  h('fx:previewCode', (html, props) => {
    const meta = parseHtmlEffect(html, 'Vorschau');
    const p = Object.fromEntries(meta.params.map((x) => [x.key, x.default]));
    core.previewCode(html, { ...p, ...(props || {}) });
    return meta.params;
  });
  h('fx:previewLayers', (def) => core.previewLayers(def));
  h('fx:endPreview', () => core.endPreview());
  h('fx:delete', (key) => { library.remove(key); if (config.get('effect').key === key) core.setEffect({ key: 'native:aurora' }); core.emit('state'); });
  h('fx:importFiles', async (paths) => {
    if (!paths || !paths.length) {
      const r = await dialog.showOpenDialog(win, { title: 'Effekt importieren', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Effekte', extensions: ['html', 'htm', 'json'] }] });
      if (r.canceled) return null; paths = r.filePaths;
    }
    let last = null; for (const p of paths) last = library.importFile(p);
    core.emit('state'); return last;
  });
  h('fx:importUrl', async (url) => { const k = await library.importUrl(url); core.emit('state'); return k; });
  h('fx:export', async (key) => {
    const e = library.get(key); const ext = e.type === 'canvas' ? 'html' : 'json';
    const r = await dialog.showSaveDialog(win, { defaultPath: `${e.name}.${ext}`, filters: [{ name: 'Effekt', extensions: [ext] }] });
    if (r.canceled) return null; library.exportTo(key, r.filePath); return r.filePath;
  });
  h('fx:openFolder', () => shell.openPath(library.userDir));
  h('dialog:file', async (filters) => { const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [] }); return r.canceled ? null : r.filePaths[0]; });
  h('app:open', (url) => shell.openExternal(url));
  // NZXT Kraken
  h('kraken:get', () => kraken.state());
  h('kraken:speed', (ch, cfg) => kraken.setSpeed(ch, cfg));
  h('kraken:brightness', (v) => kraken.setBrightness(v));
  h('kraken:orientation', (deg) => kraken.setOrientation(deg));
  h('kraken:liquid', () => kraken.showLiquid());
  h('kraken:upload', (kind, data, name) => kraken.upload(kind, data, name));
  // Eingaben aus dem Renderer (Audio-Analyse / Bildschirm)
  ipcMain.on('inputs:audio', (e, a) => { core.inputs.audio = a; canvas.setAudio(a); });
  ipcMain.on('inputs:screen', (e, s) => { core.inputs.screen = s; });
}

app.whenReady().then(async () => {
  config = new Config(app.getPath('userData'));
  library = new EffectLibrary(path.join(__dirname, '..', '..', 'assets', 'effects'), path.join(app.getPath('userData'), 'effects'), log);
  canvas = new CanvasHost(path.join(app.getPath('userData'), 'tmp'), log);
  core = new Core(config, library, canvas, log);
  if (!library.get(config.get('effect').key)) config.set('effect', { key: 'native:aurora', params: {} });
  setupIpc();
  createWindow();
  createTray();
  registerHotkeys();
  core.on('state', () => { clearTimeout(core._st); core._st = setTimeout(() => send('state', core.state()), 30); });
  core.on('preview', (p) => send('preview', p));
  await core.startDrivers({ demo: DEMO });
  core._applyEffect();
  core.start();
  kraken = new KrakenService(config, log);
  kraken.on('changed', () => send('kraken', kraken.state()));
  kraken.start();
  core.kraken = kraken;
  log('info', 'AleRGB gestartet');

  powerMonitor.on('lock-screen', () => { if (config.get('settings').offOnLock) core.blackout = true; });
  powerMonitor.on('unlock-screen', () => { core.blackout = false; });
  powerMonitor.on('suspend', () => { if (config.get('settings').offOnSleep) { core.blackout = true; core.renderFrame(); } });
  powerMonitor.on('resume', () => { core.blackout = false; setTimeout(() => { for (const id of core.drivers.keys()) if (core.drivers.get(id).config.enabled) core.restartDriver(id); }, 4000); });
});

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('window-all-closed', (e) => e.preventDefault && e.preventDefault());
let quitting = false;
app.on('before-quit', async (e) => {
  app.isQuitting = true;
  if (quitting) return;
  e.preventDefault(); quitting = true;
  globalShortcut.unregisterAll();
  try { config.flush(); core.stop(); if (kraken) await kraken.stop(); await Promise.race([core.stopAll(), new Promise((r) => setTimeout(r, 2500))]); } catch {}
  canvas.unload();
  app.exit(0);
});
