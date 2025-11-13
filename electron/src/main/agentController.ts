import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { platform } from 'os';
import fs from 'fs';
import { app } from 'electron';

export class AgentController {
  public events = new EventEmitter();
  private process: ChildProcess | null = null;
  private isRunning = false;
  private resolvedPath: string | null = null;
  private nebulaProcess: ChildProcess | null = null;
  private syncthingProcess: ChildProcess | null = null;

  private resolveBinaryPath(): string {
    const binaryName = platform() === 'win32' ? 'vidsync-agent.exe' : 'vidsync-agent';

    // Ordered candidate locations (first existing wins):
    const candidates: string[] = [];

    // 1) Explicit env override
    if (process.env.VIDSYNC_AGENT_PATH) {
      candidates.push(process.env.VIDSYNC_AGENT_PATH);
    }

    // 2) Packaged app resources (production)
    try {
      if (app && app.isPackaged) {
        candidates.push(path.join(process.resourcesPath || '', 'bin', binaryName));
      }
    } catch (e) {
      // ignore when app isn't available
    }

    // 3) Common dev locations relative to project
    // ../../.. from compiled main (dist/main) -> project root
    candidates.push(path.join(__dirname, '..', '..', '..', 'go-agent', binaryName));
    candidates.push(path.join(process.cwd(), 'go-agent', binaryName));
    candidates.push(path.join(process.cwd(), 'bin', binaryName));
    candidates.push(path.join(process.cwd(), 'electron', 'bin', binaryName));

    // 4) Fallback to `bin` next to resources (useful in many dev layouts)
    candidates.push(path.join(process.resourcesPath || '', 'bin', binaryName));

    // 5) Finally, allow PATH lookup (just the binary name)
    candidates.push(binaryName);

    for (const c of candidates) {
      try {
        if (!c) continue;
        // If candidate is just the binary name, accept it (PATH) and return
        if (path.basename(c) === binaryName && c === binaryName) {
          return c;
        }

        if (fs.existsSync(c)) {
          // ensure executable on unix
          if (platform() !== 'win32') {
            try {
              fs.chmodSync(c, 0o755);
            } catch (_) {
              // ignore chmod errors
            }
          }
          return c;
        }
      } catch (e) {
        // continue to next
      }
    }

    // Last resort: binary name (PATH)
    return binaryName;
  }

  start(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isRunning) {
        resolve(true);
        return;
      }

      try {
        const binaryPath = this.resolveBinaryPath();
        this.resolvedPath = binaryPath;

        this.process = spawn(binaryPath, [], {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        this.process.stdout?.on('data', (data) => {
          console.log(`[Agent] ${data.toString()}`);
          this.events.emit('agent:stdout', data.toString());
        });

        this.process.stderr?.on('data', (data) => {
          console.error(`[Agent Error] ${data.toString()}`);
          this.events.emit('agent:stderr', data.toString());
        });

        this.process.on('exit', (code, signal) => {
          console.log(`[Agent] exited code=${code} signal=${signal}`);
          this.isRunning = false;
          this.process = null;
        });

        this.isRunning = true;
        resolve(true);
      } catch (error) {
        console.error('Failed to start agent:', error);
        resolve(false);
      }
    });
  }

  async startNebula(configPath?: string): Promise<boolean> {
    if (this.nebulaProcess) return true;

    const binaryName = process.platform === 'win32' ? 'nebula.exe' : 'nebula';
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'go-agent', 'bin', 'nebula', binaryName),
      path.resolve(process.cwd(), '..', 'go-agent', 'bin', 'nebula', binaryName),
      path.join(process.cwd(), 'go-agent', 'bin', 'nebula', binaryName),
      binaryName,
    ];

    console.log(`[Nebula] __dirname=${__dirname}, candidates=${JSON.stringify(candidates)}`);

    for (const c of candidates) {
      try {
        // Check if binary exists before spawning (except for PATH-only binary names)
        if (c !== binaryName && !fs.existsSync(c)) {
          console.log(`[Nebula] candidate not found: ${c}`);
          continue; // try next candidate
        }

        const args: string[] = [];
        if (configPath) {
          args.push('-config', configPath);
        }

        console.log(`[Nebula] attempting to spawn from: ${c} args=${JSON.stringify(args)}`);
        const p = spawn(c, args, { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
        let errorOccurred = false;
        p.on('error', (err) => {
          console.error(`[Nebula] spawn error: ${err.message}`);
          errorOccurred = true;
          this.nebulaProcess = null;
        });
        p.stdout?.on('data', (d) => {
          const s = d.toString();
          console.log(`[Nebula] ${s}`);
          this.events.emit('nebula:stdout', s);
        });
        p.stderr?.on('data', (d) => {
          const s = d.toString();
          console.error(`[Nebula Error] ${s}`);
          this.events.emit('nebula:stderr', s);
        });
        p.on('exit', (code, sig) => {
          console.log(`[Nebula] exited code=${code} sig=${sig}`);
          this.nebulaProcess = null;
        });
        if (!errorOccurred) {
          this.nebulaProcess = p;
          console.log('Nebula started via', c);
          return true;
        }
      } catch (e) {
        console.error(`[Nebula] exception with candidate ${c}: ${String(e)}`);
        // try next
      }
    }

    console.warn('Nebula binary not found in candidates');
    return false;
  }

  async startSyncthing(): Promise<boolean> {
    if (this.syncthingProcess) return true;

    const binaryName = process.platform === 'win32' ? 'syncthing.exe' : 'syncthing';
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'go-agent', 'bin', 'syncthing', binaryName),
      path.resolve(process.cwd(), '..', 'go-agent', 'bin', 'syncthing', binaryName),
      path.join(process.cwd(), 'go-agent', 'bin', 'syncthing', binaryName),
      binaryName,
    ];

    console.log(`[Syncthing] __dirname=${__dirname}, candidates=${JSON.stringify(candidates)}`);

    for (const c of candidates) {
      try {
        // Check if binary exists before spawning (except for PATH-only binary names)
        if (c !== binaryName && !fs.existsSync(c)) {
          console.log(`[Syncthing] candidate not found: ${c}`);
          continue; // try next candidate
        }

        console.log(`[Syncthing] attempting to spawn from: ${c}`);
        const p = spawn(c, [], { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
        let errorOccurred = false;
        p.on('error', (err) => {
          console.error(`[Syncthing] spawn error: ${err.message}`);
          errorOccurred = true;
          this.syncthingProcess = null;
        });
        p.stdout?.on('data', (d) => {
          const s = d.toString();
          console.log(`[Syncthing] ${s}`);
          this.events.emit('syncthing:stdout', s);
        });
        p.stderr?.on('data', (d) => {
          const s = d.toString();
          console.error(`[Syncthing Error] ${s}`);
          this.events.emit('syncthing:stderr', s);
        });
        p.on('exit', (code, sig) => {
          console.log(`[Syncthing] exited code=${code} sig=${sig}`);
          this.syncthingProcess = null;
        });
        if (!errorOccurred) {
          this.syncthingProcess = p;
          console.log('Syncthing started via', c);
          return true;
        }
      } catch (e) {
        console.error(`[Syncthing] exception with candidate ${c}: ${String(e)}`);
        // try next
      }
    }

    console.warn('Syncthing binary not found in candidates');
    return false;
  }

  stop(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.process) {
        this.isRunning = false;
        resolve(true);
        return;
      }

      try {
        this.process.kill();
      } catch (e) {
        // ignore
      }
      this.isRunning = false;
      this.process = null;
      resolve(true);
    });
  }

  stopNebula(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.nebulaProcess) {
        resolve(true);
        return;
      }

      try {
        this.nebulaProcess.kill();
      } catch (e) {
        // ignore
      }
      this.nebulaProcess = null;
      resolve(true);
    });
  }

  getStatus() {
    return {
      running: this.isRunning,
      pid: this.process?.pid || null,
      path: this.resolvedPath,
      nebula: { pid: this.nebulaProcess?.pid || null, running: !!this.nebulaProcess },
      syncthing: { pid: this.syncthingProcess?.pid || null, running: !!this.syncthingProcess },
    };
  }
}
