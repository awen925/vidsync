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
  syncthingOpenGui: (projectId: string) => ipcRenderer.invoke('syncthing:openGui', projectId),
  syncthingGetDeviceId: (projectId: string) => ipcRenderer.invoke('syncthing:getDeviceId', projectId),
  syncthingImportRemote: (projectId: string, remoteDeviceId: string, remoteName?: string) => ipcRenderer.invoke('syncthing:importRemote', projectId, remoteDeviceId, remoteName),
  syncthingProgressForProject: (projectId: string) => ipcRenderer.invoke('syncthing:progressForProject', projectId),
  fsListDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
  fsListDirectory: (dirPath: string, includeHidden?: boolean) => ipcRenderer.invoke('fs:listDirectory', dirPath, includeHidden),
  fsScanDirTree: (dirPath: string, options?: any) => ipcRenderer.invoke('fs:scanDirTree', dirPath, options),
  fsScanDirFlat: (dirPath: string) => ipcRenderer.invoke('fs:scanDirFlat', dirPath),
  fsGetDirStats: (dirPath: string) => ipcRenderer.invoke('fs:getDirStats', dirPath),
  nebulaGenerateConfig: (projectId: string, opts?: any) => ipcRenderer.invoke('nebula:generateConfig', projectId, opts),
  nebulaOpenFolder: (projectId: string) => ipcRenderer.invoke('nebula:openFolder', projectId),
  nebulaGetPath: (projectId: string) => ipcRenderer.invoke('nebula:getPath', projectId),
  // Bundle extraction and process control (stubbed extractor)
  bundleExtract: (projectId: string, base64Zip: string) => ipcRenderer.invoke('bundle:extract', projectId, base64Zip),
  nebulaStart: (projectId: string) => ipcRenderer.invoke('nebula:start', projectId),
  nebulaWaitForTun: (timeoutMs?: number) => ipcRenderer.invoke('nebula:waitForTun', timeoutMs || 20000),
  processGetStatus: () => ipcRenderer.invoke('process:getStatus'),
  processStopAll: () => ipcRenderer.invoke('process:stopAll'),
  // Log subscription helpers
  onNebulaLog: (cb: (msg: string) => void) => ipcRenderer.on('logs:nebula', (_ev, msg) => cb(msg)),
  onSyncthingLog: (cb: (msg: string) => void) => ipcRenderer.on('logs:syncthing', (_ev, msg) => cb(msg)),
  // Privilege helpers
  applySetcap: (binaryPath: string) => ipcRenderer.invoke('privilege:applySetcap', binaryPath),
  elevateSetcap: (binaryPath: string) => ipcRenderer.invoke('privilege:elevateSetcap', binaryPath),
  // Secure store wrappers
  secureStore: {
    setRefreshToken: (token: string) => ipcRenderer.invoke('secureStore:set', token),
    getRefreshToken: () => ipcRenderer.invoke('secureStore:get'),
    clearRefreshToken: () => ipcRenderer.invoke('secureStore:clear'),
  },
});

export {};
