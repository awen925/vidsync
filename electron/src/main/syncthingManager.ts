import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

type InstanceInfo = {
  process: ChildProcess;
  homeDir: string;
  localPath?: string;
};

export class SyncthingManager {
  private instances: Map<string, InstanceInfo> = new Map();

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

      this.instances.set(projectId, { process: proc, homeDir, localPath });

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
}

export default SyncthingManager;
