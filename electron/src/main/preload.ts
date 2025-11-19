import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  agentStart: () => ipcRenderer.invoke('agent:start'),
  agentStop: () => ipcRenderer.invoke('agent:stop'),
  agentStatus: () => ipcRenderer.invoke('agent:status'),
  deviceGetInfo: () => ipcRenderer.invoke('device:getInfo'),
  syncthingStartForProject: (projectId: string, localPath?: string) => ipcRenderer.invoke('syncthing:startForProject', { projectId, localPath }),
  syncthingStopForProject: (projectId: string) => ipcRenderer.invoke('syncthing:stopForProject', projectId),
  syncthingRemoveProjectFolder: (projectId: string) => ipcRenderer.invoke('syncthing:removeProjectFolder', projectId),
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
  // File watcher for delta sync
  fileWatcherStartWatching: (projectId: string, localPath: string, authToken: string) => 
    ipcRenderer.invoke('fileWatcher:startWatching', { projectId, localPath, authToken }),
  fileWatcherStopWatching: (projectId: string) => ipcRenderer.invoke('fileWatcher:stopWatching', projectId),
  fileWatcherGetStatus: (projectId: string) => ipcRenderer.invoke('fileWatcher:getStatus', projectId),
  nebulaGenerateConfig: (projectId: string, opts?: any) => ipcRenderer.invoke('nebula:generateConfig', projectId, opts),
  nebulaOpenFolder: (projectId: string) => ipcRenderer.invoke('nebula:openFolder', projectId),
  nebulaGetPath: (projectId: string) => ipcRenderer.invoke('nebula:getPath', projectId),
  // Bundle extraction and process control (stubbed extractor)
  bundleExtract: (projectId: string, base64Zip: string) => ipcRenderer.invoke('bundle:extract', projectId, base64Zip),
  nebulaStart: (projectId: string) => ipcRenderer.invoke('nebula:start', projectId),
  nebulaWaitForTun: (timeoutMs?: number) => ipcRenderer.invoke('nebula:waitForTun', timeoutMs || 20000),
  processGetStatus: () => ipcRenderer.invoke('process:getStatus'),
  processStopAll: () => ipcRenderer.invoke('process:stopAll'),
  // Real-time sync progress via WebSocket
  syncSubscribe: (eventType: string) => ipcRenderer.invoke('sync:subscribe', eventType),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  onSyncTransferProgress: (cb: (event: any) => void) => ipcRenderer.on('sync:transfer-progress', (_ev, data) => cb(data)),
  onSyncComplete: (cb: (event: any) => void) => ipcRenderer.on('sync:complete', (_ev, data) => cb(data)),
  onSyncError: (cb: (event: any) => void) => ipcRenderer.on('sync:error', (_ev, data) => cb(data)),
  onSyncEvent: (cb: (event: any) => void) => ipcRenderer.on('sync:event', (_ev, data) => cb(data)),
  onSyncConnected: (cb: () => void) => ipcRenderer.on('sync:connected', () => cb()),
  onSyncDisconnected: (cb: () => void) => ipcRenderer.on('sync:disconnected', () => cb()),
  // Log subscription helpers
  onNebulaLog: (cb: (msg: string) => void) => ipcRenderer.on('logs:nebula', (_ev, msg) => cb(msg)),
  onSyncthingLog: (cb: (msg: string) => void) => ipcRenderer.on('logs:syncthing', (_ev, msg) => cb(msg)),
  // Privilege helpers
  applySetcap: (binaryPath: string) => ipcRenderer.invoke('privilege:applySetcap', binaryPath),
  elevateSetcap: (binaryPath: string) => ipcRenderer.invoke('privilege:elevateSetcap', binaryPath),
  // Snapshot cache
  snapshotCache: {
    getCached: (projectId: string) => ipcRenderer.invoke('snapshot:getCached', projectId),
    downloadAndCache: (projectId: string, downloadUrl: string) => ipcRenderer.invoke('snapshot:downloadAndCache', projectId, downloadUrl),
    clearProject: (projectId: string) => ipcRenderer.invoke('snapshot:clearProject', projectId),
    clearAll: () => ipcRenderer.invoke('snapshot:clearAll'),
    onProgress: (cb: (status: string, progress?: number) => void) => ipcRenderer.on('snapshot:progress', (_ev, status, progress) => cb(status, progress)),
  },
  // Secure store wrappers
  secureStore: {
    setRefreshToken: (token: string) => ipcRenderer.invoke('secureStore:set', token),
    getRefreshToken: () => ipcRenderer.invoke('secureStore:get'),
    clearRefreshToken: () => ipcRenderer.invoke('secureStore:clear'),
  },
});

export {};
