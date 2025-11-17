import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import https from 'https';
import { isDevelopment } from './logger';

type InstanceInfo = {
  process: ChildProcess;
  homeDir: string;
  localPath?: string;
  apiKey?: string;
  folderConfigured?: boolean;
};

export class SyncthingManager {
  private instances: Map<string, InstanceInfo> = new Map();
  private sharedInstance: InstanceInfo | null = null;
  private readonly SYNCTHING_API_TIMEOUT = 30000;
  private readonly SYNCTHING_API_PORT = 8384;

  private resolveBinary(): string {
    const binaryName = process.platform === 'win32' ? 'syncthing.exe' : 'syncthing';
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'go-agent', 'bin', 'syncthing', binaryName),
      path.resolve(process.cwd(), '..', 'go-agent', 'bin', 'syncthing', binaryName),
      path.join(process.cwd(), 'go-agent', 'bin', 'syncthing', binaryName),
      binaryName,
    ];

    for (const c of candidates) {
      try {
        if (!c) continue;
        if (path.basename(c) === binaryName && c === binaryName) return c;
        if (fs.existsSync(c)) {
          try { fs.chmodSync(c, 0o755); } catch (_) {}
          return c;
        }
      } catch (e) {
        // ignore
      }
    }

    return binaryName;
  }

  // Try to detect a system-wide running Syncthing and return its config info (apikey, homeDir)
  private findSystemSyncthingConfig(): { apiKey?: string; homeDir?: string; deviceId?: string } | null {
    try {
      const candidates = [
        path.join(os.homedir(), '.config', 'syncthing', 'config.xml'),
        path.join(os.homedir(), '.config', 'Syncthing', 'config.xml'),
        path.join(process.cwd(), 'syncthing', 'config.xml'),
      ];
      for (const c of candidates) {
        try {
          if (fs.existsSync(c)) {
            const content = fs.readFileSync(c, 'utf-8');
            const apim = content.match(/<apikey>([^<]+)<\/apikey>/i);
            const idm = content.match(/<id>([^<]+)<\/id>/i);
            const apiKey = apim ? apim[1] : undefined;
            const deviceId = idm ? idm[1] : undefined;
            const homeDir = path.dirname(c);
            return { apiKey, homeDir, deviceId };
          }
        } catch (e) {
          // ignore and try next
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  private async getApiKey(homeDir: string): Promise<string | null> {
    try {
      const configPath = path.join(homeDir, 'config.xml');
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const match = content.match(/<apikey>([^<]+)<\/apikey>/);
      return match ? match[1] : null;
    } catch (e) {
      console.error('Failed to read API key:', e);
      return null;
    }
  }

  private async waitForSyncthingReady(apiKey: string, timeout: number = this.SYNCTHING_API_TIMEOUT): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        return await new Promise((resolve) => {
          const req = https.request(
            {
              hostname: 'localhost',
              port: this.SYNCTHING_API_PORT,
              path: '/rest/system/status',
              method: 'GET',
              headers: {
                'X-API-Key': apiKey,
              },
              rejectUnauthorized: false,
            },
            (res) => {
              resolve(res.statusCode === 200);
            }
          );
          req.on('error', () => resolve(false));
          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });
          req.setTimeout(2000);
          req.end();
        });
      } catch (e) {
        // Continue trying
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  private async addFolder(apiKey: string, projectId: string, localPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const folderConfig = {
        id: projectId,
        label: `Project: ${projectId}`,
        path: localPath,
        type: 'sendreceive',
        devices: [],
        rescanIntervalS: 3600,
        fsWatcherEnabled: true,
      };

      const data = JSON.stringify(folderConfig);

      const req = https.request(
        {
          hostname: 'localhost',
          port: this.SYNCTHING_API_PORT,
          path: `/rest/config/folders/${projectId}`,
          method: 'PUT',
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
          rejectUnauthorized: false,
        },
        (res) => {
          resolve(res.statusCode === 200 || res.statusCode === 201);
        }
      );

      req.on('error', () => resolve(false));
      req.write(data);
      req.end();
    });
  }

  private async removeFolder(apiKey: string, projectId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: 'localhost',
          port: this.SYNCTHING_API_PORT,
          path: `/rest/config/folders/${projectId}`,
          method: 'DELETE',
          headers: {
            'X-API-Key': apiKey,
          },
          rejectUnauthorized: false,
        },
        (res) => {
          if (res.statusCode === 200 || res.statusCode === 204) {
            // Successfully deleted folder, now signal Syncthing to reload config
            this.restartSyncthingFolder(apiKey, projectId)
              .then(() => resolve(true))
              .catch(() => resolve(true)); // Still resolve true even if restart fails
          } else {
            if (isDevelopment()) {
              console.error(`[Syncthing] Failed to remove folder: ${res.statusCode}`);
            }
            resolve(false);
          }
        }
      );

      req.on('error', (err) => {
        if (isDevelopment()) console.error('[Syncthing] Remove folder error:', err);
        resolve(false);
      });
      req.end();
    });
  }

  private async restartSyncthingFolder(apiKey: string, projectId: string): Promise<void> {
    return new Promise((resolve) => {
      // Some Syncthing versions require a POST to /rest/system/config to apply config changes
      const req = https.request(
        {
          hostname: 'localhost',
          port: this.SYNCTHING_API_PORT,
          path: `/rest/system/config/insync`,
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
          },
          rejectUnauthorized: false,
        },
        (res) => {
          if (isDevelopment()) {
            console.log(`[Syncthing] Config reload request status: ${res.statusCode}`);
          }
          resolve();
        }
      );

      req.on('error', () => resolve());
      req.end();
    });
  }  async startForProject(projectId: string, localPath?: string): Promise<{ success: boolean; pid?: number; homeDir?: string; error?: string }> {
    // If project's already configured, return
    if (this.instances.has(projectId)) {
      const info = this.instances.get(projectId)!;
      return { success: true, pid: info.process?.pid || undefined, homeDir: info.homeDir };
    }

    const binary = this.resolveBinary();
    const sharedHome = path.join(app.getPath('userData'), 'syncthing', 'shared');

    try {
      await fs.promises.mkdir(sharedHome, { recursive: true });
    } catch (e) {
      return { success: false, error: `Failed to create shared home dir: ${String(e)}` };
    }

    // Ensure shared instance exists (spawn if necessary)
    if (!this.sharedInstance || !this.sharedInstance.process) {
      try {
        const proc = spawn(binary, ['-home', sharedHome], { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.stdout?.on('data', (d) => {
          if (isDevelopment()) console.log(`[Syncthing:shared] ${d.toString()}`);
        });
        proc.stderr?.on('data', (d) => {
          if (isDevelopment()) console.error(`[Syncthing:shared Error] ${d.toString()}`);
        });
        proc.on('exit', (code, signal) => {
          if (isDevelopment()) console.log(`[Syncthing:shared] exited code=${code} sig=${signal}`);
          // clear shared and all project mappings
          this.sharedInstance = null;
          this.instances.clear();
        });

        // wait a short while for config.xml to be created
        await new Promise((r) => setTimeout(r, 1500));
        const apiKey = await this.getApiKey(sharedHome);
        const inst: InstanceInfo = { process: proc, homeDir: sharedHome, apiKey: apiKey || undefined };
        this.sharedInstance = inst;
      } catch (e: any) {
        // spawn error: try system syncthing fallback
        const sys = this.findSystemSyncthingConfig();
        if (sys && sys.apiKey) {
          const ready = await this.waitForSyncthingReady(sys.apiKey);
          if (ready) {
            const instanceInfo: InstanceInfo = { process: (null as unknown) as ChildProcess, homeDir: sys.homeDir || '', apiKey: sys.apiKey };
            this.sharedInstance = instanceInfo;
          } else {
            return { success: false, error: 'failed_start_shared_and_system_unready' };
          }
        } else {
          return { success: false, error: e?.message || String(e) };
        }
      }
    }

    // At this point we have a sharedInstance with apiKey (or at least homeDir)
    const apiKey = this.sharedInstance?.apiKey;
    if (!apiKey) {
      // try once more to read apiKey from shared home
      const maybeKey = await this.getApiKey(this.sharedInstance?.homeDir || sharedHome);
      if (maybeKey) this.sharedInstance!.apiKey = maybeKey;
    }

    // Add project mapping that references the shared instance
    const projectInstance: InstanceInfo = { process: this.sharedInstance!.process, homeDir: this.sharedInstance!.homeDir, localPath, apiKey: this.sharedInstance!.apiKey, folderConfigured: false };
    this.instances.set(projectId, projectInstance);

    // Configure folder if requested
    if (localPath && this.sharedInstance?.apiKey && fs.existsSync(localPath)) {
      setImmediate(async () => {
        try {
          const ready = await this.waitForSyncthingReady(this.sharedInstance!.apiKey!);
          if (ready) {
            const added = await this.addFolder(this.sharedInstance!.apiKey!, projectId, localPath);
            if (isDevelopment()) console.log(`[Syncthing:shared] Added folder for project ${projectId}: ${added}`);
            const inst = this.instances.get(projectId);
            if (inst) inst.folderConfigured = !!added;
          } else {
            if (isDevelopment()) console.warn('[Syncthing:shared] API did not become ready in time');
          }
        } catch (e) {
          if (isDevelopment()) console.error('[Syncthing:shared] Error configuring folder:', e);
        }
      });
    }


    return { success: true, pid: this.sharedInstance?.process?.pid || undefined, homeDir: this.sharedInstance?.homeDir };
  }

  async stopForProject(projectId: string): Promise<{ success: boolean; error?: string }> {
    const info = this.instances.get(projectId);
    if (!info) return { success: true };

    try {
      info.process.kill();
      this.instances.delete(projectId);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  async removeProjectFolder(projectId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const info = this.instances.get(projectId);
      if (!info || !info.apiKey) {
        return { success: true }; // No folder to remove if no instance
      }

      const removed = await this.removeFolder(info.apiKey, projectId);
      return { success: removed };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  getStatusForProject(projectId: string) {
    const info = this.instances.get(projectId);
    if (!info) return { running: false };
    return { running: true, pid: info.process?.pid || undefined, homeDir: info.homeDir, localPath: info.localPath, apiKey: info.apiKey };
  }

  listAll() {
    const out: Record<string, any> = {};
    for (const [k, v] of this.instances.entries()) {
      out[k] = { pid: v.process?.pid || undefined, homeDir: v.homeDir, localPath: v.localPath, apiKey: v.apiKey };
    }
    return out;
  }

  // Read local Syncthing device ID from config.xml for a project
  async getDeviceIdForProject(projectId: string): Promise<string | null> {
    const inst = this.instances.get(projectId);
    const homeDir = inst?.homeDir || path.join(app.getPath('userData'), 'syncthing', projectId);
    const configPath = path.join(homeDir, 'config.xml');
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const m = content.match(/<id>([^<]+)<\/id>/);
      if (m && m[1]) return m[1];
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Import a remote device ID into the project's config.xml and add it to the project's folder listing
  async importRemoteDevice(projectId: string, remoteDeviceId: string, remoteName?: string): Promise<{ success: boolean; error?: string }> {
    const inst = this.instances.get(projectId);
    const homeDir = inst?.homeDir || path.join(app.getPath('userData'), 'syncthing', projectId);
    const configPath = path.join(homeDir, 'config.xml');
    try {
      let content = await fs.promises.readFile(configPath, 'utf-8');

      // Ensure devices section exists
      if (!/\<devices\>/i.test(content)) {
        // Insert devices section before </configuration>
        content = content.replace(/<\/configuration>/i, `\n  <devices>\n  </devices>\n</configuration>`);
      }

      // Add device entry if missing
      const deviceEntry = `<device id=\"${remoteDeviceId}\">\n    <name>${remoteName || remoteDeviceId}</name>\n    <addresses>\n      <address>dynamic</address>\n    </addresses>\n  </device>`;
      if (!new RegExp(`<device[^>]*id=\\"${remoteDeviceId}\\"`, 'i').test(content)) {
        content = content.replace(/<devices>([\s\S]*?)<\/devices>/i, (m, inner) => {
          return `<devices>${inner}\n  ${deviceEntry}\n</devices>`;
        });
      }

      // Add device reference to the folder with id == projectId
      const folderRegex = new RegExp(`(<folder[^>]*id=\\"${projectId}\\"[\s\S]*?<\/folder>)`, 'i');
      const folderMatch = content.match(folderRegex);
      if (folderMatch && folderMatch[1]) {
        let folderBlock = folderMatch[1];
        if (!/\<devices\>/i.test(folderBlock)) {
          // add devices section inside folder
          folderBlock = folderBlock.replace(/<\/folder>/i, `  <devices>\n    <device id=\"${remoteDeviceId}\" />\n  </devices>\n</folder>`);
        } else {
          // ensure device id is present
          if (!new RegExp(`<device[^>]*id=\\"${remoteDeviceId}\\"`, 'i').test(folderBlock)) {
            folderBlock = folderBlock.replace(/<devices>([\s\S]*?)<\/devices>/i, (m, inner) => {
              return `<devices>${inner}\n    <device id=\"${remoteDeviceId}\" />\n  </devices>`;
            });
          }
        }
        // Replace the original folder block
        content = content.replace(folderRegex, folderBlock);
      } else {
        // No folder block found for this project id — attempt to add devices to all folders with matching id attribute
        content = content.replace(/<folder([^>]*id=\"[^\"]+\"[\s\S]*?)<\/folder>/gi, (m) => m);
      }

      // Write back config.xml
      await fs.promises.writeFile(configPath, content, 'utf-8');

      // Syncthing watches config.xml and should reload automatically. If the instance is running and has API key, we could also POST a reload.
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  // Query Syncthing API for progress and active transfers for a project
  async getProgressForProject(projectId: string): Promise<{ success: boolean; completion?: any; activeTransfers?: Array<any>; error?: string }> {
    const inst = this.instances.get(projectId);
    if (!inst) return { success: false, error: 'not_running' };

    const apiKey = inst.apiKey;
    if (!apiKey) return { success: false, error: 'no_api_key' };

    const port = this.SYNCTHING_API_PORT;
    const results: any = { success: true };

    // Helper to perform HTTPS GET to syncthing API
    const get = (path: string) => {
      return new Promise<any>((resolve) => {
        const req = https.request({ hostname: 'localhost', port, path, method: 'GET', rejectUnauthorized: false, headers: { 'X-API-Key': apiKey } }, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(2000, () => { req.destroy(); resolve(null); });
        req.end();
      });
    };

    try {
      // 1) folder completion for this project
      try {
        const comp = await get(`/rest/db/completion?folder=${encodeURIComponent(projectId)}`);
        results.completion = comp;
      } catch (e) {
        results.completion = null;
      }

      // 2) active transfers
      try {
        const transfers = await get('/rest/stats/transfer');
        // transfers may be an object with files array or similar; we'll try to normalize
        const active: any[] = [];
        if (Array.isArray(transfers)) {
          for (const t of transfers) {
            if (t && t.files) {
              for (const f of t.files) {
                active.push({ file: f.name || f.filename || f.path, bytesDone: f.bytesDone || f.bytesTransferred || 0, bytesTotal: f.size || f.bytesTotal || 0, device: t.device || null });
              }
            }
          }
        } else if (transfers && transfers.files) {
          for (const f of transfers.files) {
            active.push({ file: f.name || f.filename || f.path, bytesDone: f.bytesDone || f.bytesTransferred || 0, bytesTotal: f.size || f.bytesTotal || 0, device: transfers.device || null });
          }
        }
        results.activeTransfers = active;
      } catch (e) {
        results.activeTransfers = [];
      }

      return results;
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
}

export default SyncthingManager;
