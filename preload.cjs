// The only bridge between the pages and the main process. Pages get these functions and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('sticky', {
  desktop: true,
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  pin: (id) => ipcRenderer.invoke('note:pin', id),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onChanged: on('data:changed'),
  onNewNote: on('note:new'),
  onShowTasks: on('view:tasks'),
});
