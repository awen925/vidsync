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
  nebulaGenerateConfig: (projectId: string, opts?: any) => ipcRenderer.invoke('nebula:generateConfig', projectId, opts),
  nebulaOpenFolder: (projectId: string) => ipcRenderer.invoke('nebula:openFolder', projectId),
  nebulaGetPath: (projectId: string) => ipcRenderer.invoke('nebula:getPath', projectId),
  // Bundle extraction and process control (stubbed extractor)
  bundleExtract: (projectId: string, base64Zip: string) => ipcRenderer.invoke('bundle:extract', projectId, base64Zip),
  nebulaStart: (projectId: string) => ipcRenderer.invoke('nebula:start', projectId),
  processGetStatus: () => ipcRenderer.invoke('process:getStatus'),
  processStopAll: () => ipcRenderer.invoke('process:stopAll'),
  // Log subscription helpers
  onNebulaLog: (cb: (msg: string) => void) => ipcRenderer.on('logs:nebula', (_ev, msg) => cb(msg)),
  onSyncthingLog: (cb: (msg: string) => void) => ipcRenderer.on('logs:syncthing', (_ev, msg) => cb(msg)),
  // Privilege helpers
  applySetcap: (binaryPath: string) => ipcRenderer.invoke('privilege:applySetcap', binaryPath),
  // Secure store wrappers
  secureStore: {
    setRefreshToken: (token: string) => ipcRenderer.invoke('secureStore:set', token),
    getRefreshToken: () => ipcRenderer.invoke('secureStore:get'),
    clearRefreshToken: () => ipcRenderer.invoke('secureStore:clear'),
  },
});

export {};
