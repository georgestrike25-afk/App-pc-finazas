// Puente mínimo y seguro entre la página y la app de escritorio.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('finanzasDesktop', {
  /** Datos para conectar el celular: código FP1-…, direcciones, espacio y token. */
  pairing: () => ipcRenderer.invoke('finanzas:pairing'),
  copy: (text) => ipcRenderer.invoke('finanzas:copy', String(text)),
});
