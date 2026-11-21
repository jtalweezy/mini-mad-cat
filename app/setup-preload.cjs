'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('connectionSetup', {
  list: () => ipcRenderer.invoke('integration:list'),
  save: selected => ipcRenderer.invoke('integration:save', selected),
  close: () => ipcRenderer.invoke('integration:close')
});
