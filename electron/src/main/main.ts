import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execCb);
import { AgentController } from './agentController';
import { SyncthingManager } from './syncthingManager';
import { NebulaManager } from './nebulaManager';
import { logger } from './logger';
import { initializeSyncWebSocket, getSyncWebSocketClient } from './syncWebSocketClient';
import { listDirectory, scanDirectoryTree, scanDirectoryFlat, getDirectoryStats, FileItem, DirectoryEntry } from './fileScanner';
import { FileWatcher } from './services/fileWatcher';
import { snapshotCache } from './services/snapshotCache';
import axios from 'axios';

let mainWindow: BrowserWindow | null;
const agentController = new AgentController();
const syncthingManager = new SyncthingManager();
const nebulaManager = new NebulaManager();

// File watchers per project (projectId -> FileWatcher instance)
const projectWatchers = new Map<string, FileWatcher>();

// Forward agent logs to renderer when available
const forwardLogToRenderer = (channel: string, msg: string) => {
  try {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(channel, msg);
    }
  } catch (e) {
    logger.warn('Failed to forward log to renderer', e);
  }
};

// Hook up agentController event emitter
agentController.events.on('nebula:stdout', (msg: string) => forwardLogToRenderer('logs:nebula', msg));
agentController.events.on('nebula:stderr', (msg: string) => forwardLogToRenderer('logs:nebula', msg));
agentController.events.on('syncthing:stdout', (msg: string) => forwardLogToRenderer('logs:syncthing', msg));
agentController.events.on('syncthing:stderr', (msg: string) => forwardLogToRenderer('logs:syncthing', msg));
agentController.events.on('agent:stdout', (msg: string) => forwardLogToRenderer('logs:agent', msg));
agentController.events.on('agent:stderr', (msg: string) => forwardLogToRenderer('logs:agent', msg));

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';

// Function to sync Syncthing device ID for current user
const syncSyncthingDeviceId = async (accessToken?: string) => {
  try {
    // Get Syncthing device ID from the shared instance
    const syncthingId = await syncthingManager.getDeviceIdForProject('__app_shared__');
    if (!syncthingId) {
      logger.warn('[Main] Could not retrieve Syncthing device ID');
      return;
    }

    logger.log(`[Main] Got Syncthing device ID: ${syncthingId}`);

    // If access token is provided, update device in backend
    if (accessToken) {
      try {
        // Get user info from mainWindow renderer context if available
        // For now, we send it to the renderer to handle the update
        if (mainWindow) {
          mainWindow.webContents.send('app:update-syncthing-device-id', { syncthingId, accessToken });
        }
      } catch (e) {
        logger.warn('[Main] Error updating device:', e);
      }
    } else {
      // Just send the device ID so it can be used if user logs in
      if (mainWindow) {
        mainWindow.webContents.send('app:syncthing-device-id-ready', { syncthingId });
      }
    }
  } catch (e) {
    logger.warn('[Main] Error syncing Syncthing device ID:', e);
  }
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../../public/icons/logo1.png'),
  });

  // In production, load the React build output from the build folder
  // __dirname is dist/main, so we need to go up and into the build folder
  const startUrl = isDev 
    ? 'http://localhost:3001' 
    : `file://${path.join(__dirname, '../../build/index.html')}`;
  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', () => {
  createWindow();
  setupIPC();
  agentController.start();
  
  // Initialize Sync WebSocket client for real-time transfer updates
  // Delay to allow Go-Agent to start (it needs time to boot up)
  // Increase delay to 3000ms to ensure agent is ready
  setTimeout(() => {
    logger.log('[Main] Initializing WebSocket client after agent startup delay...');
    initializeSyncWebSocket();
  }, 3000);
  
  // Attempt to start Nebula and Syncthing services as part of app startup only if config exists
  try {
    const nebulaDir = path.join(app.getPath('userData'), 'nebula');
    let startedNebula = false;
    if (fs.existsSync(nebulaDir)) {
      const entries = fs.readdirSync(nebulaDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const cfg = path.join(nebulaDir, e.name, 'nebula.yml');
          if (fs.existsSync(cfg)) {
            agentController.startNebula(cfg).then((ok) => { if (ok) startedNebula = true; });
            break;
          }
        }
      }
    }

    // Start Syncthing always (it can run without nebula) using syncthingManager for centralized control
    syncthingManager.startForProject('__app_shared__').then(() => {
      logger.log('[Main] Syncthing started, syncing device ID...');
      // Wait a bit for Syncthing to fully initialize
      setTimeout(() => syncSyncthingDeviceId(), 2000);
    }).catch((e) => {
      logger.warn('Failed to start shared Syncthing on app startup:', e);
    });
  } catch (e) {
    logger.warn('Error while attempting auto-start services', e);
  }
});

app.on('window-all-closed', () => {
  // Stop all file watchers
  projectWatchers.forEach((watcher) => watcher.stop());
  projectWatchers.clear();
  
  if (!isMac) {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

const setupIPC = () => {
  // File dialogs
  ipcMain.handle('dialog:openDirectory', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    return result.filePaths[0];
  });

  // FS: list directory contents (non-recursive)
  ipcMain.handle('fs:listDir', async (_ev, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const out = entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
      return { path: dirPath, entries: out };
    } catch (e: any) {
      return { error: e?.message || String(e) };
    }
  });

  // FS: list directory (immediate children only - preferred method for navigation)
  ipcMain.handle('fs:listDirectory', async (_ev, dirPath: string, includeHidden?: boolean) => {
    try {
      logger.debug(`Listing directory: ${dirPath}`);
      const entries = await listDirectory(dirPath, includeHidden ?? false);
      return { success: true, entries, path: dirPath };
    } catch (e: any) {
      logger.error(`Failed to list directory ${dirPath}:`, e);
      return { success: false, error: e?.message || String(e), entries: [] };
    }
  });

  // FS: scan directory tree recursively (for local projects)
  ipcMain.handle('fs:scanDirTree', async (_ev, dirPath: string, options?: any) => {
    try {
      logger.debug(`Scanning directory tree: ${dirPath}`);
      const files = await scanDirectoryTree(dirPath, {
        maxDepth: options?.maxDepth ?? 5,
        includeHidden: options?.includeHidden ?? false,
        includeDotFiles: options?.includeDotFiles ?? false,
      });
      return { success: true, files, path: dirPath };
    } catch (e: any) {
      logger.error(`Failed to scan directory tree ${dirPath}:`, e);
      return { success: false, error: e?.message || String(e), files: [] };
    }
  });

  // FS: scan directory (flat, no recursion)
  ipcMain.handle('fs:scanDirFlat', async (_ev, dirPath: string) => {
    try {
      logger.debug(`Scanning directory (flat): ${dirPath}`);
      const files = await scanDirectoryFlat(dirPath);
      return { success: true, files, path: dirPath };
    } catch (e: any) {
      logger.error(`Failed to scan directory ${dirPath}:`, e);
      return { success: false, error: e?.message || String(e), files: [] };
    }
  });

  // FS: get directory statistics
  ipcMain.handle('fs:getDirStats', async (_ev, dirPath: string) => {
    try {
      const stats = await getDirectoryStats(dirPath);
      if (!stats) {
        return { success: false, error: 'Directory not found' };
      }
      return { success: true, stats };
    } catch (e: any) {
      logger.error(`Failed to get directory stats ${dirPath}:`, e);
      return { success: false, error: e?.message || String(e) };
    }
  });

  // Agent control
  ipcMain.handle('agent:start', () => agentController.start());
  ipcMain.handle('agent:stop', () => agentController.stop());
  ipcMain.handle('agent:status', () => agentController.getStatus());

  // Syncthing per-project control
  ipcMain.handle('syncthing:startForProject', async (_ev, { projectId, localPath }) => {
    return syncthingManager.startForProject(projectId, localPath);
  });

  ipcMain.handle('syncthing:getDeviceId', async (_ev, projectId: string) => {
    try {
      const id = await syncthingManager.getDeviceIdForProject(projectId);
      return { ok: true, id };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('syncthing:importRemote', async (_ev, projectId: string, remoteDeviceId: string, remoteName?: string) => {
    try {
      const res = await syncthingManager.importRemoteDevice(projectId, remoteDeviceId, remoteName);
      return res;
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('syncthing:progressForProject', async (_ev, projectId: string) => {
    try {
      const res = await syncthingManager.getProgressForProject(projectId);
      return res;
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('syncthing:stopForProject', async (_ev, projectId: string) => {
    return syncthingManager.stopForProject(projectId);
  });

  ipcMain.handle('syncthing:removeProjectFolder', async (_ev, projectId: string) => {
    return syncthingManager.removeProjectFolder(projectId);
  });

  ipcMain.handle('syncthing:statusForProject', async (_ev, projectId: string) => {
    return syncthingManager.getStatusForProject(projectId);
  });

  ipcMain.handle('syncthing:openGui', async (_ev, projectId: string) => {
    try {
      const status = syncthingManager.getStatusForProject(projectId as string);
      // If we have an API key or known homeDir, attempt to open the GUI URL, otherwise open the home dir
      if (status && status.apiKey) {
        const url = `http://127.0.0.1:8384/`;
        try { await shell.openExternal(url); return { ok: true, opened: 'url', url }; } catch (e) { /* fallthrough */ }
      }
      if (status && status.homeDir) {
        const folderPath = status.homeDir;
        try { await shell.openPath(folderPath); return { ok: true, opened: 'path', path: folderPath }; } catch (e) { return { ok: false, error: String(e) }; }
      }
      return { ok: false, error: 'no_syncthing_info' };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // File Watcher: Start watching a project's local folder for changes
  ipcMain.handle('fileWatcher:startWatching', async (_ev, { projectId, localPath, authToken }) => {
    try {
      // Check if already watching
      if (projectWatchers.has(projectId)) {
        logger.warn(`FileWatcher: Already watching project ${projectId}`);
        return { success: true, message: 'Already watching' };
      }

      // Create new watcher
      const watcher = new FileWatcher();
      
      // Set up change listener - calls cloud API when files change
      watcher.watch(localPath, async (changes) => {
        if (changes.length === 0) return;
        
        try {
          logger.debug(`FileWatcher: Detected ${changes.length} changes in ${projectId}`);
          
          // Call cloud API to post file changes as deltas
          const apiUrl = process.env.VIDSYNC_API_URL || 'http://localhost:3001';
          const endpoint = `${apiUrl}/api/projects/${projectId}/files/update`;
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ changes }),
          });

          if (!response.ok) {
            logger.error(`FileWatcher: Failed to post changes: ${response.status} ${response.statusText}`);
            return;
          }

          const result = await response.json();
          logger.debug(`FileWatcher: Successfully posted ${result.changes_processed} changes`);
        } catch (error) {
          logger.error('FileWatcher: Error posting file changes:', error);
        }
      });

      projectWatchers.set(projectId, watcher);
      logger.info(`FileWatcher: Started watching ${projectId} at ${localPath}`);
      return { success: true, message: 'Started watching' };
    } catch (error: any) {
      logger.error(`FileWatcher: Failed to start watching: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // File Watcher: Stop watching a project folder
  ipcMain.handle('fileWatcher:stopWatching', async (_ev, projectId: string) => {
    try {
      const watcher = projectWatchers.get(projectId);
      if (!watcher) {
        logger.debug(`FileWatcher: Project ${projectId} not being watched`);
        return { success: true, message: 'Not watching' };
      }

      watcher.stop();
      projectWatchers.delete(projectId);
      logger.info(`FileWatcher: Stopped watching ${projectId}`);
      return { success: true, message: 'Stopped watching' };
    } catch (error: any) {
      logger.error(`FileWatcher: Failed to stop watching: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // File Watcher: Get current watch status for a project
  ipcMain.handle('fileWatcher:getStatus', async (_ev, projectId: string) => {
    return {
      isWatching: projectWatchers.has(projectId),
    };
  });

  // Device info: create or return a local device identity stored in userData
  ipcMain.handle('device:getInfo', async () => {
    try {
      // Try to fetch from running agent first
      const agentInfo = await new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:29999/v1/device', (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(null);
        });
      });

      if (agentInfo && (agentInfo as any).deviceId) {
        logger.debug('Device info from agent:', agentInfo);
        return agentInfo;
      }

      // Fallback: create local device identity
      const dataDir = app.getPath('userData');
      const file = path.join(dataDir, 'device.json');
      try {
        const existing = await fs.promises.readFile(file, 'utf8');
        return JSON.parse(existing);
      } catch (err) {
        // create new
        const id = (crypto && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const info = {
          deviceId: id,
          deviceName: `${os.hostname()}-${process.platform}`,
          platform: process.platform,
        };
        try {
          await fs.promises.mkdir(dataDir, { recursive: true });
          await fs.promises.writeFile(file, JSON.stringify(info, null, 2), 'utf8');
        } catch (werr) {
          logger.warn('Failed to persist device info:', werr);
        }
        return info;
      }
    } catch (ex) {
      logger.error('device:getInfo error', ex);
      return { deviceId: `tmp-${Date.now()}`, deviceName: `tmp-${process.platform}`, platform: process.platform };
    }
  });

  // Secure storage for refresh tokens (stored in app userData with restrictive permissions)
  const refreshFile = path.join(app.getPath('userData'), 'refresh_token.json');

  ipcMain.handle('secureStore:set', async (_ev, token: string) => {
    try {
      await fs.promises.mkdir(path.dirname(refreshFile), { recursive: true });
      await fs.promises.writeFile(refreshFile, JSON.stringify({ token }), { mode: 0o600 });
      try { await fs.promises.chmod(refreshFile, 0o600); } catch (e) {}
      return { ok: true };
    } catch (e: any) {
      logger.error('secureStore:set error', e);
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('secureStore:get', async () => {
    try {
      const data = await fs.promises.readFile(refreshFile, 'utf8');
      const parsed = JSON.parse(data || '{}');
      return { token: parsed.token || null };
    } catch (e: any) {
      return { token: null };
    }
  });

  ipcMain.handle('secureStore:clear', async () => {
    try { await fs.promises.unlink(refreshFile); } catch (e) {}
    return { ok: true };
  });

  // Snapshot Cache Handlers
  ipcMain.handle('snapshot:getCached', async (_ev, projectId: string) => {
    try {
      const cached = await snapshotCache.getCachedSnapshot(projectId);
      return cached || null;
    } catch (error) {
      logger.error(`Failed to get cached snapshot for ${projectId}:`, error);
      return null;
    }
  });

  ipcMain.handle('snapshot:downloadAndCache', async (_ev, projectId: string, downloadUrl: string) => {
    try {
      // Setup progress callback
      const onProgress = (status: string, progress?: number) => {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('snapshot:progress', status, progress);
        }
      };

      const result = await snapshotCache.downloadAndCacheSnapshot(projectId, downloadUrl, onProgress);
      return result;
    } catch (error) {
      logger.error(`Failed to download and cache snapshot for ${projectId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('snapshot:clearProject', async (_ev, projectId: string) => {
    try {
      snapshotCache.clearProjectCache(projectId);
      return { ok: true };
    } catch (error) {
      logger.error(`Failed to clear snapshot cache for ${projectId}:`, error);
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('snapshot:clearAll', async () => {
    try {
      snapshotCache.clearAllCache();
      return { ok: true };
    } catch (error) {
      logger.error('Failed to clear all snapshot cache:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Nebula config generation
  ipcMain.handle('nebula:generateConfig', async (_ev, projectId: string, opts?: any) => {
    try {
      return await nebulaManager.generateConfig(projectId, opts || {});
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('nebula:openFolder', async (_ev, projectId: string) => {
    try {
      const { shell } = require('electron');
      const folderPath = path.join(app.getPath('userData'), 'nebula', projectId);
      await fs.promises.mkdir(folderPath, { recursive: true });
      shell.openPath(folderPath);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('nebula:getPath', async (_ev, projectId: string) => {
    try {
      const folderPath = path.join(app.getPath('userData'), 'nebula', projectId);
      return { ok: true, path: folderPath };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Bundle extraction: accept base64-encoded ZIP and extract into userData/nebula/<projectId>
  ipcMain.handle('bundle:extract', async (_ev, projectId: string, base64Zip: string) => {
    try {
      const baseDir = path.join(app.getPath('userData'), 'nebula', projectId);
      await fs.promises.mkdir(baseDir, { recursive: true });

      const zipBuffer = Buffer.from(base64Zip, 'base64');
      const zipPath = path.join(baseDir, 'bundle.zip');
      await fs.promises.writeFile(zipPath, zipBuffer, { mode: 0o600 });

      // Use unzipper to extract buffer into directory
      let extractionSuccess = false;
      try {
        const unzipper = require('unzipper');
        const directory = await unzipper.Open.buffer(zipBuffer);
        await directory.extract({ path: baseDir, concurrency: 5 });
        extractionSuccess = true;
        logger.log(`✓ Installation completed at ${baseDir}`);
      } catch (ex) {
        logger.error('[bundle:extract] unzipper extraction failed:', ex);
        return { ok: false, error: `Failed to extract bundle: ${String(ex)}` };
      }

      // Validate required files were extracted
      const requiredFiles = ['nebula.yml', 'ca.crt', 'node.crt', 'node.key'];
      const missingFiles: string[] = [];
      for (const f of requiredFiles) {
        const fpath = path.join(baseDir, f);
        if (!fs.existsSync(fpath)) {
          missingFiles.push(f);
          logger.error(`[bundle:extract] Missing required file: ${f}`);
        }
      }

      if (missingFiles.length > 0) {
        return { ok: false, error: `Bundle missing required files: ${missingFiles.join(', ')}` };
      }

      // Ensure private key has secure permissions (0o600)
      try { 
        await fs.promises.chmod(path.join(baseDir, 'node.key'), 0o600);
        logger.log('✓ Security permissions set');
      } catch (e) {
        logger.error('[bundle:extract] Failed to chmod node.key:', e);
      }

      // Attempt to auto-start Nebula with the extracted config and wait for TUN/IP assignment
      const result: any = { ok: true, dir: baseDir };
      const cfg = path.join(baseDir, 'nebula.yml');
      
      // Also copy extracted files into ~/.vidsync so the packaged vidsync-agent can find them
      try {
        const legacyDir = path.join(os.homedir(), '.vidsync');
        await fs.promises.mkdir(legacyDir, { recursive: true });
        const filesToCopy = ['nebula.yml', 'ca.crt', 'node.crt', 'node.key'];
        for (const f of filesToCopy) {
          const src = path.join(baseDir, f);
          const dst = path.join(legacyDir, f);
          try {
            if (fs.existsSync(src)) {
              await fs.promises.copyFile(src, dst);
              // secure perms for private key
              if (f === 'node.key') {
                try { await fs.promises.chmod(dst, 0o600); } catch (e) {}
              } else {
                try { await fs.promises.chmod(dst, 0o644); } catch (e) {}
              }
              logger.log(`✓ Installation step completed`);
            }
          } catch (e) {
            logger.error(`[bundle:extract] Failed to copy ${f} to ${dst}:`, e);
          }
        }
        result.legacyPath = legacyDir;
      } catch (e) {
        logger.error('[bundle:extract] Failed to copy files to legacy ~/.vidsync dir:', e);
      }
      if (fs.existsSync(cfg)) {
        try {
          // Start Nebula with explicit config
          const started = await agentController.startNebula(cfg);
          result.nebulaRequested = !!started;

          // Wait for tun0 IP assignment (Linux). Poll up to 20s
          const tunName = 'tun0';
          const timeoutMs = 20000;
          const start = Date.now();
          let tunAssigned = false;
          let assignedIp: string | null = null;

          const getTunIpFromOs = () => {
            try {
              const nets = os.networkInterfaces();
              for (const name of Object.keys(nets)) {
                const addrs = nets[name] || [];
                for (const a of addrs) {
                  if (a.family === 'IPv4' && !a.internal) {
                    const lname = (name || '').toLowerCase();
                    if (lname.includes('tun') || lname.includes('utun') || lname.includes('nebula') || lname.includes('tap')) {
                      return `${a.address}/${a.netmask ? (a.netmask as any) : '32'}`;
                    }
                    // also try to detect Nebula-like address ranges (10.99.* or 10.* private)
                    if (a.address.startsWith('10.')) {
                      return `${a.address}/32`;
                    }
                  }
                }
              }
            } catch (e) {
              // ignore
            }
            return null;
          };

          while (Date.now() - start < timeoutMs) {
            try {
              // First try Node OS networkInterfaces (cross-platform)
              const candidate = getTunIpFromOs();
              if (candidate) {
                tunAssigned = true;
                assignedIp = candidate;
                break;
              }

              // Fallback: on Linux use `ip` tool to check tun interface
              if (process.platform === 'linux') {
                const { stdout } = await exec(`ip -o -4 addr show ${tunName}`).catch(() => ({ stdout: '' }));
                if (stdout && stdout.trim().length > 0) {
                  const m = stdout.match(/inet\s+([0-9.]+\/[0-9]+)/i) || stdout.match(/inet\s+([0-9.]+)\//i);
                  if (m && m[1]) {
                    tunAssigned = true;
                    assignedIp = m[1];
                    break;
                  }
                }
              }
            } catch (e) {
              // ignore and retry
            }
            await new Promise((r) => setTimeout(r, 1000));
          }

          result.tunAssigned = tunAssigned;
          result.tunIp = assignedIp;

          if (!tunAssigned) {
            // Likely privilege issue or nebula failed to create TUN. Provide actionable guidance.
            logger.warn('⚠ Network access needs permission');
            const nebulaBin = (agentController as any).resolveBinaryPath ? (agentController as any).resolveBinaryPath() : 'nebula';
            const setcapCmd = `sudo setcap cap_net_admin+ep ${nebulaBin}`;
            result.warning = 'tun_not_assigned';
            result.setcapCmd = setcapCmd;
            result.troubleshoot = `Network setup did not create the TUN device within ${timeoutMs / 1000}s. This often requires system permissions. On Linux, try:\n\n  ${setcapCmd}\n\nOr run the app with elevated privileges. If you still see errors, check the setup logs in the app.`;
            // Try an automatic elevation attempt on Linux: run pkexec to apply setcap and retry once
            if (process.platform === 'linux') {
              try {
                logger.log('⟳ Requesting elevated access...');
                result.autoElevation = 'attempting';
                const { stdout: pkOut, stderr: pkErr } = await exec(`pkexec setcap cap_net_admin+ep ${nebulaBin}`).catch((e) => { throw e; });
                logger.log('✓ Network layer initialized');
                result.autoElevation = { ok: true, stdout: pkOut || '', stderr: pkErr || '' };

                // After successful setcap, restart nebula and poll for TUN again
                try {
                  logger.log('⟳ Restarting network layer...');
                  await (agentController as any).stopNebula?.();
                } catch (e) {}
                try {
                  const restarted = await agentController.startNebula(cfg);
                  result.nebulaRestartRequested = !!restarted;
                  if (restarted) {
                    logger.debug('Nebula restarted, polling for TUN again...');
                    // Poll again up to timeoutMs
                    const start2 = Date.now();
                    let tunAssigned2 = false;
                    let assignedIp2: string | null = null;
                    while (Date.now() - start2 < timeoutMs) {
                      const candidate2 = getTunIpFromOs();
                      if (candidate2) {
                        tunAssigned2 = true;
                        assignedIp2 = candidate2;
                        break;
                      }
                      if (process.platform === 'linux') {
                        try {
                          const { stdout } = await exec(`ip -o -4 addr show ${tunName}`).catch(() => ({ stdout: '' }));
                          if (stdout && stdout.trim().length > 0) {
                            const m = stdout.match(/inet\s+([0-9.]+\/[0-9]+)/i) || stdout.match(/inet\s+([0-9.]+)\//i);
                            if (m && m[1]) {
                              tunAssigned2 = true;
                              assignedIp2 = m[1];
                              break;
                            }
                          }
                        } catch (e) {
                          // ignore
                        }
                      }
                      await new Promise((r) => setTimeout(r, 1000));
                    }
                    result.tunAssignedAfterElevation = tunAssigned2;
                    result.tunIpAfterElevation = assignedIp2;
                    if (tunAssigned2) {
                      logger.log(`✓ Network layer initialized`);
                      // Start Syncthing now
                      try {
                        const synRes2 = await syncthingManager.startForProject(projectId);
                        result.syncthingStarted = synRes2.success;
                        result.syncthingHome = synRes2.homeDir;
                      } catch (e) {
                        result.syncthingStarted = false;
                        result.syncthingError = String(e);
                      }
                    }
                  }
                } catch (e) {
                  // ignore restart errors
                }
              } catch (pkErr: any) {
                console.error('[nebula:waitForTun] Elevation failed:', pkErr);
                result.autoElevation = { ok: false, error: pkErr?.message || String(pkErr) };
              }
            }
          } else {
            // Start Syncthing for this project now that Nebula is up
            try {
              const synRes = await syncthingManager.startForProject(projectId);
              result.syncthingStarted = synRes.success;
              result.syncthingHome = synRes.homeDir;
            } catch (e) {
              result.syncthingStarted = false;
              result.syncthingError = String(e);
            }
          }
        } catch (e: any) {
          result.nebulaError = e?.message || String(e);
        }
      }

      return result;
    } catch (e: any) {
      console.error('bundle:extract error', e);
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Start Nebula (stub: uses existing AgentController.startNebula)
  ipcMain.handle('nebula:start', async (_ev, projectId?: string) => {
    try {
      // If a projectId is provided, prefer starting Nebula with that project's nebula.yml config
      let configPath: string | undefined;
      if (projectId) {
        const folderPath = path.join(app.getPath('userData'), 'nebula', projectId);
        const candidate = path.join(folderPath, 'nebula.yml');
        try {
          await fs.promises.access(candidate);
          configPath = candidate;
        } catch (e) {
          // file not accessible; fall back to undefined
          configPath = undefined;
        }
      }

      const started = await agentController.startNebula(configPath);
      return { success: started, config: configPath };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('process:getStatus', async () => {
    try {
      const status = agentController.getStatus();
      const synList = syncthingManager.listAll();
      return { ok: true, agent: status, syncthing: synList };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('process:stopAll', async () => {
    try {
      await agentController.stop();
      // Attempt to stop all syncthing instances
      const syns = syncthingManager.listAll();
      for (const k of Object.keys(syns)) {
        try { await syncthingManager.stopForProject(k); } catch (e) {}
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Privilege helper: attempt to apply setcap if running as root, otherwise return command
  ipcMain.handle('privilege:applySetcap', async (_ev, binaryPath: string) => {
    try {
      // On non-linux, just return the suggested command
      if (process.platform !== 'linux') {
        return { ok: false, error: 'setcap only supported on Linux via this API', cmd: `sudo setcap cap_net_admin+ep ${binaryPath}` };
      }

      // If running as root, try to run setcap directly
      if (typeof process.getuid === 'function' && process.getuid() === 0) {
        try {
          const { stdout, stderr } = await exec(`setcap cap_net_admin+ep ${binaryPath}`);
          return { ok: true, stdout, stderr };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }

      // Not root — return the exact command for user to run with sudo
      return { ok: false, error: 'not_root', cmd: `sudo setcap cap_net_admin+ep ${binaryPath}` };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Try to run pkexec to elevate and apply setcap (Linux only).
  // Enhanced: parse common failures and return structured result so UI can present friendly messages.
  ipcMain.handle('privilege:elevateSetcap', async (_ev, binaryPath: string) => {
    try {
      if (process.platform !== 'linux') {
        return { ok: false, error: 'elevate_not_supported', message: 'Elevation helper only supported on Linux via pkexec', cmd: `sudo setcap cap_net_admin+ep ${binaryPath}` };
      }

      try {
        // Run pkexec; note: pkexec may display a GUI prompt via polkit
        const { stdout, stderr } = await exec(`pkexec setcap cap_net_admin+ep ${binaryPath}`);
        return { ok: true, stdout: stdout || '', stderr: stderr || '' };
      } catch (e: any) {
        const errMsg = e?.message || String(e);
        // Classify common reasons for failure to provide more actionable UI guidance
        let code = 'pkexec_failed';
        if (/not found/.test(errMsg) || /No such file/.test(errMsg)) code = 'pkexec_not_found';
        else if (/Authentication failed|Authentication canceled|Canceled/.test(errMsg)) code = 'auth_canceled';
        else if (/does not exist|No such file or directory/.test(errMsg)) code = 'binary_not_found';

        return { ok: false, error: code, message: errMsg, cmd: `sudo setcap cap_net_admin+ep ${binaryPath}` };
      }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // IPC: wait for TUN assignment (poll networkInterfaces and optional ip command) for up to timeoutMs
  ipcMain.handle('nebula:waitForTun', async (_ev, timeoutMs: number = 20000) => {
    try {
      const tunName = 'tun0';
      const start = Date.now();
      const getTunIpFromOs = () => {
        try {
          const nets = os.networkInterfaces();
          for (const name of Object.keys(nets)) {
            const addrs = nets[name] || [];
            for (const a of addrs) {
              if (a.family === 'IPv4' && !a.internal) {
                const lname = (name || '').toLowerCase();
                if (lname.includes('tun') || lname.includes('utun') || lname.includes('nebula') || lname.includes('tap')) {
                  return `${a.address}/${(a as any).netmask || '32'}`;
                }
                if (a.address.startsWith('10.')) {
                  return `${a.address}/32`;
                }
              }
            }
          }
        } catch (e) {
          // ignore
        }
        return null;
      };

      while (Date.now() - start < timeoutMs) {
        const candidate = getTunIpFromOs();
        if (candidate) return { ok: true, tunIp: candidate };
        if (process.platform === 'linux') {
          try {
            const { stdout } = await exec(`ip -o -4 addr show ${tunName}`).catch(() => ({ stdout: '' }));
            if (stdout && stdout.trim().length > 0) {
              const m = stdout.match(/inet\s+([0-9.]+\/[0-9]+)/i) || stdout.match(/inet\s+([0-9.]+)\//i);
              if (m && m[1]) return { ok: true, tunIp: m[1] };
            }
          } catch (e) {
            // ignore
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      return { ok: false, message: 'timeout' };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // WebSocket: Subscribe to sync events
  // Renderer can listen for real-time transfer progress, completion, errors
  ipcMain.handle('sync:subscribe', async (_ev, eventType: string) => {
    try {
      const client = getSyncWebSocketClient();
      if (!client.isConnected()) {
        return { ok: false, error: 'WebSocket not connected' };
      }
      // The subscription is handled via IPC main -> renderer forwarding below
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // WebSocket: Get current connection status
  ipcMain.handle('sync:status', async () => {
    try {
      const client = getSyncWebSocketClient();
      return { 
        connected: client.isConnected(),
        url: 'ws://127.0.0.1:29999/v1/events'
      };
    } catch (e: any) {
      return { error: e?.message || String(e) };
    }
  });

  // ============================================================================
  // DEVICE MANAGEMENT IPC HANDLERS
  // ============================================================================

  // Register/update device with backend
  ipcMain.handle('device:register', async (_ev, { deviceId, deviceName, platform, syncthingId, nebulaIp, accessToken }) => {
    try {
      if (!accessToken) {
        return { ok: false, error: 'No access token provided' };
      }

      const cloudAPI = axios.create({
        baseURL: process.env.CLOUD_URL || 'http://localhost:5000/api',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const response = await cloudAPI.post('/devices/register', {
        deviceId,
        deviceName,
        platform,
        syncthingId: syncthingId || null,
        nebulaIp: nebulaIp || null,
      });

      logger.log(`[IPC] Device registered: ${deviceName} (${deviceId})`);
      return { ok: true, device: response.data.device };
    } catch (error: any) {
      logger.error('[IPC] Failed to register device:', error.message || error);
      return { ok: false, error: error?.response?.data?.error || error?.message || 'Failed to register device' };
    }
  });

  // Get all devices for current user
  ipcMain.handle('device:list', async (_ev, { accessToken }) => {
    try {
      if (!accessToken) {
        return { ok: false, error: 'No access token provided' };
      }

      const cloudAPI = axios.create({
        baseURL: process.env.CLOUD_URL || 'http://localhost:5000/api',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const response = await cloudAPI.get('/devices');
      logger.log(`[IPC] Retrieved ${response.data.devices?.length || 0} devices`);
      return { ok: true, devices: response.data.devices || [] };
    } catch (error: any) {
      logger.error('[IPC] Failed to list devices:', error.message || error);
      return { ok: false, error: error?.response?.data?.error || error?.message || 'Failed to list devices' };
    }
  });

  // Ensure Syncthing folders exist for all user projects (called after device registration)
  ipcMain.handle('project:ensureFolders', async (_ev, { accessToken, projectIds }) => {
    try {
      if (!accessToken) {
        return { ok: false, error: 'No access token provided' };
      }

      const cloudAPI = axios.create({
        baseURL: process.env.CLOUD_URL || 'http://localhost:5000/api',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const results: Record<string, any> = {};
      const projectsToEnsure = projectIds || [];

      logger.log(`[IPC] Ensuring folders for ${projectsToEnsure.length} projects...`);

      for (const projectId of projectsToEnsure) {
        try {
          const response = await cloudAPI.post(`/projects/${projectId}/ensure-folder`);
          results[projectId] = { ok: true, message: response.data.message };
          logger.log(`[IPC] Project ${projectId}: Folder ensured`);
        } catch (error: any) {
          results[projectId] = { 
            ok: false, 
            error: error?.response?.data?.error || error?.message || 'Failed to ensure folder'
          };
          logger.warn(`[IPC] Project ${projectId}: Folder ensure failed - ${error?.message}`);
        }
      }

      return { ok: true, results };
    } catch (error: any) {
      logger.error('[IPC] Failed to ensure folders:', error.message || error);
      return { ok: false, error: error?.message || 'Failed to ensure folders' };
    }
  });

  // Sync device information (get latest Syncthing device ID and update in Supabase)
  ipcMain.handle('device:syncNow', async (_ev, { accessToken }) => {
    try {
      if (!accessToken) {
        return { ok: false, error: 'No access token provided' };
      }

      // Get the latest Syncthing device ID from the local API
      const syncthingId = await syncthingManager.getDeviceIdForProject('__app_shared__');
      if (!syncthingId) {
        return { ok: false, error: 'Could not retrieve Syncthing device ID' };
      }

      logger.log(`[IPC] Syncing device info with Syncthing ID: ${syncthingId}`);

      // Generate a unique device ID for this Electron app instance
      const deviceId = `electron-${require('os').hostname()}-${process.platform}`;

      const cloudAPI = axios.create({
        baseURL: process.env.CLOUD_URL || 'http://localhost:5000/api',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const response = await cloudAPI.post('/devices/register', {
        deviceId,
        deviceName: `Electron App (${require('os').hostname()})`,
        platform: 'electron',
        syncthingId,
      });

      logger.log(`[IPC] Device synced successfully: ${deviceId}`);
      return { ok: true, device: response.data.device };
    } catch (error: any) {
      logger.error('[IPC] Failed to sync device:', error.message || error);
      return { ok: false, error: error?.response?.data?.error || error?.message || 'Failed to sync device' };
    }
  });

  // Set up event forwarding from WebSocket to renderer
  const syncClient = getSyncWebSocketClient();
  
  syncClient.on('TransferProgress', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('sync:transfer-progress', event);
    }
  });

  syncClient.on('SyncComplete', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('sync:complete', event);
    }
  });

  syncClient.on('SyncError', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('sync:error', event);
    }
  });

  syncClient.on('sync-event', (event) => {
    if (mainWindow) {
      mainWindow.webContents.send('sync:event', event);
    }
  });

  syncClient.on('connected', () => {
    if (mainWindow) {
      mainWindow.webContents.send('sync:connected');
    }
  });

  syncClient.on('disconnected', () => {
    if (mainWindow) {
      mainWindow.webContents.send('sync:disconnected');
    }
  });

};

const template: any[] = [
  {
    label: 'File',
    submenu: [
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
    ],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
