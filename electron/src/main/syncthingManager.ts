import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import https from 'https';

type InstanceInfo = {
  process: ChildProcess;
  homeDir: string;
  localPath?: string;
  apiKey?: string;
  folderConfigured?: boolean;
};

export class SyncthingManager {
  private instances: Map<string, InstanceInfo> = new Map();
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

  async startForProject(projectId: string, localPath?: string): Promise<{ success: boolean; pid?: number; homeDir?: string; error?: string }> {
    if (this.instances.has(projectId)) {
      const info = this.instances.get(projectId)!;
      return { success: true, pid: info.process.pid || undefined, homeDir: info.homeDir };
    }

    const binary = this.resolveBinary();
    const homeDir = path.join(app.getPath('userData'), 'syncthing', projectId);

    try {
      await fs.promises.mkdir(homeDir, { recursive: true });
    } catch (e) {
      return { success: false, error: `Failed to create home dir: ${String(e)}` };
    }

    try {
      // Spawn syncthing with a dedicated home directory so each project has isolated config
      const proc = spawn(binary, ['-home', homeDir], { stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stdout?.on('data', (d) => console.log(`[Syncthing:${projectId}] ${d.toString()}`));
      proc.stderr?.on('data', (d) => console.error(`[Syncthing:${projectId} Error] ${d.toString()}`));

      proc.on('exit', (code, signal) => {
        console.log(`[Syncthing:${projectId}] exited code=${code} sig=${signal}`);
        this.instances.delete(projectId);
      });

      // Wait a bit for config.xml to be created
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get API key from config
      const apiKey = await this.getApiKey(homeDir);
      if (!apiKey) {
        console.warn(`[Syncthing:${projectId}] Failed to get API key`);
      }

      // Store instance info
      const instanceInfo: InstanceInfo = { process: proc, homeDir, localPath, apiKey: apiKey || undefined };
      this.instances.set(projectId, instanceInfo);

      // If we have a local path and API key, wait for Syncthing to be ready and configure the folder
      if (localPath && apiKey && fs.existsSync(localPath)) {
        setImmediate(async () => {
          try {
            const ready = await this.waitForSyncthingReady(apiKey);
            if (ready) {
              const folderAdded = await this.addFolder(apiKey, projectId, localPath);
              console.log(`[Syncthing:${projectId}] Folder ${folderAdded ? 'added' : 'failed to add'}`);
              // Update instance info with configuration status
              const inst = this.instances.get(projectId);
              if (inst) inst.folderConfigured = !!folderAdded;
            } else {
              console.warn(`[Syncthing:${projectId}] Syncthing API did not become ready in time`);
            }
          } catch (e) {
            console.error(`[Syncthing:${projectId}] Error configuring folder:`, e);
          }
        });
      }

      return { success: true, pid: proc.pid || undefined, homeDir };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
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

  getStatusForProject(projectId: string) {
    const info = this.instances.get(projectId);
    if (!info) return { running: false };
    return { running: true, pid: info.process.pid, homeDir: info.homeDir, localPath: info.localPath };
  }

  listAll() {
    const out: Record<string, any> = {};
    for (const [k, v] of this.instances.entries()) {
      out[k] = { pid: v.process.pid, homeDir: v.homeDir, localPath: v.localPath };
    }
    return out;
  }

  // Read local Syncthing device ID from config.xml for a project
  async getDeviceIdForProject(projectId: string): Promise<string | null> {
    const homeDir = path.join(app.getPath('userData'), 'syncthing', projectId);
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
    const homeDir = path.join(app.getPath('userData'), 'syncthing', projectId);
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
