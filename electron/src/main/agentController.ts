import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { platform } from 'os';
import fs from 'fs';
import { app } from 'electron';

export class AgentController {
  private process: ChildProcess | null = null;
  private isRunning = false;
  private resolvedPath: string | null = null;

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
    candidates.push(path.join(process.cwd(), 'electron', 'bin', binaryName));
    candidates.push(path.join(process.cwd(), 'bin', binaryName));

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
        });

        this.process.stderr?.on('data', (data) => {
          console.error(`[Agent Error] ${data.toString()}`);
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

  getStatus() {
    return {
      running: this.isRunning,
      pid: this.process?.pid || null,
      path: this.resolvedPath,
    };
  }
}
