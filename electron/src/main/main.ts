import { app, BrowserWindow, Menu, ipcMain } from 'electron';
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

let mainWindow: BrowserWindow | null;
const agentController = new AgentController();
const syncthingManager = new SyncthingManager();
const nebulaManager = new NebulaManager();

// Forward agent logs to renderer when available
const forwardLogToRenderer = (channel: string, msg: string) => {
  try {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(channel, msg);
    }
  } catch (e) {
    console.warn('Failed to forward log to renderer', e);
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
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
  });

  const startUrl = isDev ? 'http://localhost:3001' : `file://${path.join(__dirname, '../renderer/index.html')}`;
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

    // Start Syncthing always (it can run without nebula)
    agentController.startSyncthing();
  } catch (e) {
    console.warn('Error while attempting auto-start services', e);
  }
});

app.on('window-all-closed', () => {
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

  ipcMain.handle('syncthing:statusForProject', async (_ev, projectId: string) => {
    return syncthingManager.getStatusForProject(projectId);
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
        console.log('Device info from agent:', agentInfo);
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
          console.warn('Failed to persist device info:', werr);
        }
        return info;
      }
    } catch (ex) {
      console.error('device:getInfo error', ex);
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
      console.error('secureStore:set error', e);
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

      // Use unzipper to extract buffer into directory (simple stub extractor)
      try {
        const unzipper = require('unzipper');
        const directory = await unzipper.Open.buffer(zipBuffer);
        await directory.extract({ path: baseDir, concurrency: 5 });
      } catch (ex) {
        console.warn('unzipper extract failed, bundle saved at', zipPath, ex);
        // If extraction failed, still return the path to the saved zip
        return { ok: true, dir: baseDir, zip: zipPath, warning: 'extraction_failed' };
      }

      // Ensure private key has secure permissions if present
      try { await fs.promises.chmod(path.join(baseDir, 'node.key'), 0o600); } catch (e) {}

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
            }
          } catch (e) {
            console.warn('Failed to copy', src, 'to', dst, e);
          }
        }
        result.legacyPath = legacyDir;
      } catch (e) {
        console.warn('Failed to copy files to legacy ~/.vidsync dir', e);
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
            const nebulaBin = (agentController as any).resolveBinaryPath ? (agentController as any).resolveBinaryPath() : 'nebula';
            const setcapCmd = `sudo setcap cap_net_admin+ep ${nebulaBin}`;
            result.warning = 'tun_not_assigned';
            result.setcapCmd = setcapCmd;
            result.troubleshoot = `Nebula did not create the TUN device within ${timeoutMs / 1000}s. This is often caused by missing privileges. On Linux, run:\n\n  ${setcapCmd}\n\nor run the app with sufficient privileges. If you see other errors, check Nebula logs in the app console.`;
            // Try an automatic elevation attempt on Linux: run pkexec to apply setcap and retry once
            if (process.platform === 'linux') {
              try {
                result.autoElevation = 'attempting';
                const { stdout: pkOut, stderr: pkErr } = await exec(`pkexec setcap cap_net_admin+ep ${nebulaBin}`).catch((e) => { throw e; });
                result.autoElevation = { ok: true, stdout: pkOut || '', stderr: pkErr || '' };

                // After successful setcap, restart nebula and poll for TUN again
                try {
                  await (agentController as any).stopNebula?.();
                } catch (e) {}
                try {
                  const restarted = await agentController.startNebula(cfg);
                  result.nebulaRestartRequested = !!restarted;
                  if (restarted) {
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
