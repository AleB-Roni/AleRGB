const { contextBridge, ipcRenderer, webUtils } = require('electron');
const EVENTS = ['state', 'preview', 'log'];
contextBridge.exposeInMainWorld('spectra', {
  invoke: async (ch, ...args) => {
    const r = await ipcRenderer.invoke(ch, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  on: (ch, cb) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (e, d) => cb(d)); },
  sendAudio: (a) => ipcRenderer.send('inputs:audio', a),
  sendScreen: (s) => ipcRenderer.send('inputs:screen', s),
  pathForFile: (f) => (webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(f) : f.path),
  platform: process.platform,
});
