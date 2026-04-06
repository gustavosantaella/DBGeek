const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dbConnect: (config) => ipcRenderer.invoke('db-connect', config),
  dbQuery: (config, query) => ipcRenderer.invoke('db-query', { config, query }),
  dbGetTables: (config) => ipcRenderer.invoke('db-get-tables', config),
  dbGetColumns: (config, table) => ipcRenderer.invoke('db-get-columns', { config, table }),
  dbDropTable: (config, table) => ipcRenderer.invoke('db-drop-table', { config, table })
});
