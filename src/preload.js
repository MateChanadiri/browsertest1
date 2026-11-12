const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shell', {
  cmd: (name, arg) => ipcRenderer.send('cmd', name, arg),
  suggest: (text) => ipcRenderer.invoke('suggest', text),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onFocusUrl: (cb) => ipcRenderer.on('focus-url', () => cb())
});
