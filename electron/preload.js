'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  saveConfig: (config) => ipcRenderer.send('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  testDb: (dbUrl) => ipcRenderer.invoke('test-db', dbUrl),
  onServerStatus: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('server-status', handler)
    return () => ipcRenderer.removeListener('server-status', handler)
  },
})
