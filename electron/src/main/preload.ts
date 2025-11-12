import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  agentStart: () => ipcRenderer.invoke('agent:start'),
  agentStop: () => ipcRenderer.invoke('agent:stop'),
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  deviceGetInfo: () => ipcRenderer.invoke('device:getInfo'),
  syncthingStartForProject: (projectId: string, localPath?: string) => ipcRenderer.invoke('syncthing:startForProject', { projectId, localPath }),
  syncthingStopForProject: (projectId: string) => ipcRenderer.invoke('syncthing:stopForProject', projectId),
  syncthingStatusForProject: (projectId: string) => ipcRenderer.invoke('syncthing:statusForProject', projectId),
  fsListDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
  // Secure store wrappers
  secureStore: {
    setRefreshToken: (token: string) => ipcRenderer.invoke('secureStore:set', token),
    getRefreshToken: () => ipcRenderer.invoke('secureStore:get'),
    clearRefreshToken: () => ipcRenderer.invoke('secureStore:clear'),
  },
});

export {};
