// The only bridge between a note window and the main process. Pages get these functions and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sticky', {
  desktop: true,
  getNote: (id) => ipcRenderer.invoke('note:get', id),
  saveNote: (note) => ipcRenderer.invoke('note:save', note),
  newNote: (fromId) => ipcRenderer.invoke('note:new', fromId),
  deleteNote: (id) => ipcRenderer.invoke('note:delete', id),
  resize: (w, h) => ipcRenderer.invoke('note:resize', { w, h }),
  onCount: (callback) => {
    const listener = (_e, count) => callback(count);
    ipcRenderer.on('notes:count', listener);
    return () => ipcRenderer.removeListener('notes:count', listener);
  },
});
