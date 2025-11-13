import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class NebulaManager {
  private resolveBinary(name: string): string {
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'go-agent', 'bin', 'nebula', name),
      path.resolve(process.cwd(), '..', 'go-agent', 'bin', 'nebula', name),
      path.join(process.cwd(), 'go-agent', 'bin', 'nebula', name),
      name,
    ];

    for (const c of candidates) {
      try {
        if (!c) continue;
        if (fs.existsSync(c)) {
          try { fs.chmodSync(c, 0o755); } catch (_) {}
          return c;
        }
      } catch (e) {
        // ignore
      }
    }

    return name;
  }

  private resolveCACert(): string | null {
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'cloud', 'bin', 'ca.crt'),
      path.resolve(process.cwd(), '..', 'cloud', 'bin', 'ca.crt'),
      path.join(process.cwd(), 'cloud', 'bin', 'ca.crt'),
    ];

    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          return c;
        }
      } catch (e) {
        // ignore
      }
    }

    return null;
  }

  async generateConfig(projectId: string, opts?: { hostname?: string; deviceName?: string }) {
    const base = path.join(app.getPath('userData'), 'nebula', projectId);
    try {
      await fs.promises.mkdir(base, { recursive: true });

      const caCertPath = this.resolveCACert();
      if (!caCertPath || !fs.existsSync(caCertPath)) {
        console.warn(`[Nebula:${projectId}] CA cert not found locally, will download from cloud API`);
      } else {
        // Copy local CA cert if available
        const caDestPath = path.join(base, 'ca.crt');
        const caCert = await fs.promises.readFile(caCertPath, 'utf-8');
        await fs.promises.writeFile(caDestPath, caCert, { mode: 0o644 });
      }

      // Generate nebula.yml config
      const nodeName = opts?.deviceName || opts?.hostname || projectId;
      const cfgText = `# Auto-generated Nebula config for project: ${projectId}
# Device: ${nodeName}
# Generated: ${new Date().toISOString()}

pki:
  ca: "ca.crt"
  cert: "node.crt"
  key: "node.key"

listen:
  host: 0.0.0.0
  port: 4242

punchy:
  punch: true
  respond: true

lighthouse:
  # Add your EC2 lighthouse server address here
  # Format: "ip:4242"
  hosts:
    # - "YOUR_LIGHTHOUSE_IP:4242"

static_host_map:
  # Add static mappings for known peers
  # "lighthouse_name": ["YOUR_LIGHTHOUSE_IP:4242"]

relay:
  relays:
    # - "relay_name"
  am_relay: false

tun:
  dev: tun0
  drop_local_broadcast: false
  drop_multicast: false
  tx_queue: 500
  mtu: 1300

logging:
  level: info
  format: text

firewall:
  conntrack:
    tcp_timeout: 12m
    udp_timeout: 3m
    default_timeout: 10m
  inbound:
    - port: any
      proto: any
      host: any
  outbound:
    - port: any
      proto: any
      host: any
`;

      const cfgPath = path.join(base, 'nebula.yml');
      await fs.promises.writeFile(cfgPath, cfgText, { encoding: 'utf8', mode: 0o600 });

      // Generate README
      const readme = `# Nebula Configuration for Project: ${projectId}

This folder contains the Nebula P2P network configuration for your project.

## Files

- \`ca.crt\` — Certificate Authority certificate (from your lighthouse server)
- \`node.crt\` — Certificate for this device (signed by CA)
- \`node.key\` — Private key for this device
- \`nebula.yml\` — Main Nebula configuration

## Setup Steps

1. **Generate certificates** (if not already done):
   - Click "Generate Nebula Config" in the app to generate node.crt and node.key
   - OR copy pre-generated files from the cloud backend

2. **Add lighthouse server address** to \`nebula.yml\`:
   - Find the \`lighthouse:\` section
   - Replace \`YOUR_LIGHTHOUSE_IP\` with your AWS EC2 instance IP
   - Example: \`- "1.2.3.4:4242"\`

3. **Start Nebula**:
   - Copy all files to your device's Nebula config directory
   - Run: \`nebula -config nebula.yml\`
   - Or if using system nebula: \`sudo systemctl start nebula\`

4. **Test connectivity**:
   - Once started, your device will have an IP in the Nebula network
   - Test: \`ping <another-device-ip>\`

## Security

- Keep \`node.key\` secret — it's the private key for this device
- Don't share files outside your organization
- Store backups securely
- CA cert is public but node.key must be protected

## More Info

- Nebula docs: https://github.com/slackhq/nebula
- Lighthouse setup: Your AWS EC2 instance should have Nebula lighthouse running
- Config reference: https://github.com/slackhq/nebula/blob/master/examples/config.yaml

## Troubleshooting

**"lighthouse: connection refused"**
- Verify lighthouse IP in nebula.yml
- Check lighthouse server is running
- Ensure firewall allows port 4242

**"Failed to open TUN device"**
- On Linux: may need root/sudo to run nebula
- On Windows: ensure TAP-Windows adapter is installed
- On macOS: may need to install Nebula tap device

**"Certificate verification failed"**
- Verify ca.crt matches your lighthouse CA
- Re-generate node.crt and node.key
`;

      await fs.promises.writeFile(path.join(base, 'README.md'), readme, { encoding: 'utf8', mode: 0o600 });

      return { success: true, path: cfgPath, dir: base };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  async generateAndZip(projectId: string, opts?: { hostname?: string; deviceName?: string }): Promise<{ success: boolean; zipPath?: string; error?: string }> {
    try {
      const configResult = await this.generateConfig(projectId, opts);
      if (!configResult.success) {
        return configResult;
      }

      // Create a zip file containing all nebula files
      const base = configResult.dir!;
      const zipPath = path.join(base, `nebula-${projectId}.zip`);

      // Use built-in zip or archiver (for now, return directory path and let UI handle zip)
      // In a real app, use 'archiver' npm package
      console.log(`[Nebula:${projectId}] Config ready at ${base}`);

      return {
        success: true,
        zipPath: base, // Return directory; UI can download files or create zip
      };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }
}

export default NebulaManager;
