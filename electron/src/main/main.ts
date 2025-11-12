import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { AgentController } from './agentController';
import { SyncthingManager } from './syncthingManager';

let mainWindow: BrowserWindow | null;
const agentController = new AgentController();
const syncthingManager = new SyncthingManager();

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
  // Attempt to start Nebula and Syncthing services as part of app startup
  agentController.startNebula();
  agentController.startSyncthing();
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

  // Agent control
  ipcMain.handle('agent:start', () => agentController.start());
  ipcMain.handle('agent:stop', () => agentController.stop());
  ipcMain.handle('agent:status', () => agentController.getStatus());

  // Syncthing per-project control
  ipcMain.handle('syncthing:startForProject', async (_ev, { projectId, localPath }) => {
    return syncthingManager.startForProject(projectId, localPath);
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
