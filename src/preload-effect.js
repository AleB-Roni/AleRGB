// Preload für Canvas-Effekte (sandboxed). Stellt nur Frame-Übergabe, Properties und Audio bereit.
const { contextBridge, ipcRenderer } = require('electron');
let props = null, audio = null;
async function poll() { try { const r = await ipcRenderer.invoke('fx:get'); props = r.props; audio = r.audio; } catch {} setTimeout(poll, 33); }
poll();
contextBridge.exposeInMainWorld('__spectra', {
  frame: (buf) => ipcRenderer.send('fx:frame', buf),
  props: () => props,
  audio: () => audio,
});
