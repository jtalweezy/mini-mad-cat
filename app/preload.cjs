'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('madcat', {
  onFrame(callback) { const listener = (_event, frame) => callback(frame); ipcRenderer.on('pet:frame', listener); return () => ipcRenderer.removeListener('pet:frame', listener); },
  onReaction(callback) { const listener=(_event,reaction)=>callback(reaction);ipcRenderer.on('pet:reaction',listener);return()=>ipcRenderer.removeListener('pet:reaction',listener); },
  onPreferences(callback) { const listener=(_event,preferences)=>callback(preferences);ipcRenderer.on('pet:preferences',listener);return()=>ipcRenderer.removeListener('pet:preferences',listener); },
  startDrag() { ipcRenderer.send('pet:drag-start'); },
  endDrag() { ipcRenderer.send('pet:drag-end'); },
  wave() { ipcRenderer.send('pet:wave'); },
  menu() { ipcRenderer.send('pet:menu'); }
});
