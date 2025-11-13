import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import archiver from 'archiver';
import { allocateNebulaIp, releaseNebulaIp, getDeviceAllocation } from '../../services/nebulaAllocator';

const execFileAsync = promisify(execFile);

const router = Router();

// Helper to find nebula-cert binary
const resolveBinary = (name: string): string => {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'go-agent', 'bin', 'nebula', name),
    path.resolve(process.cwd(), 'go-agent', 'bin', 'nebula', name),
    path.join(process.cwd(), 'go-agent', 'bin', 'nebula', name),
    name,
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

  return name;
};

// Helper to find CA files
const findCAFiles = (): { ca?: string; key?: string } => {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'cloud', 'bin'),
    path.resolve(process.cwd(), 'bin'),
    path.join(process.cwd(), 'cloud', 'bin'),
  ];

  const result: { ca?: string; key?: string } = {};

  for (const basePath of candidates) {
    const caPath = path.join(basePath, 'ca.crt');
    const keyPath = path.join(basePath, 'ca.key');

    if (fs.existsSync(caPath)) result.ca = caPath;
    if (fs.existsSync(keyPath)) result.key = keyPath;

    if (result.ca && result.key) break;
  }

  return result;
};

// POST /api/nebula/register - Register a device and allocate Nebula IP + sign certificate
router.post('/register', authMiddleware, async (req: Request, res: Response) => {
  let cleanupTmpDir: string | null = null;

  try {
    interface RegisterRequest {
      projectId: string;
      deviceId: string;
      deviceName: string;
      publicKey: string; // Client's Nebula public key
    }

    const { projectId, deviceId, deviceName, publicKey } = req.body as RegisterRequest;
    const userId = (req as any).user.id;

    // Validation
    if (!projectId || !deviceId || !deviceName || !publicKey) {
      return res.status(400).json({
        error: 'Missing required fields: projectId, deviceId, deviceName, publicKey',
      });
    }

    if (publicKey.length < 100 || publicKey.length > 10000) {
      return res.status(400).json({ error: 'Invalid publicKey size' });
    }

    // TODO: Verify user has permission to register this device in this project
    console.log(
      `[Nebula] Register request: user=${userId}, project=${projectId}, device=${deviceId}`
    );

    // Step 1: Allocate Nebula IP from pool
    console.log(`[Nebula] Allocating IP for device ${deviceId}...`);
    const allocResult = await allocateNebulaIp(projectId, deviceId, userId);
    if (!allocResult.success || !allocResult.ip) {
      console.error('[Nebula] Allocation failed:', allocResult.error);
      return res.status(500).json({
        error: 'Failed to allocate Nebula IP',
        detail: allocResult.error,
      });
    }

    const nebulaIp = allocResult.ip;
    console.log(`[Nebula] Allocated IP ${nebulaIp} to device ${deviceId}`);

    // Step 2: Find CA files and nebula-cert binary
    const caFiles = findCAFiles();
    if (!caFiles.ca || !caFiles.key) {
      // Release allocated IP on failure
      await releaseNebulaIp(deviceId);
      return res.status(500).json({ error: 'CA files not found on server' });
    }

    const nebulaCert = resolveBinary('nebula-cert');

    // Step 3: Create temporary directory for cert generation
    const tmpDir = path.join(os.tmpdir(), `nebula-register-${projectId}-${Date.now()}`);
    cleanupTmpDir = tmpDir;
    await fs.promises.mkdir(tmpDir, { recursive: true });

    try {
      const tmpCACrt = path.join(tmpDir, 'ca.crt');
      const tmpCAKey = path.join(tmpDir, 'ca.key');
      const tmpPubKey = path.join(tmpDir, 'public.key');
      const tmpNodeCrt = path.join(tmpDir, 'node.crt');
      const tmpConfig = path.join(tmpDir, 'nebula.yml');
      const tmpReadme = path.join(tmpDir, 'README.md');
      const tmpZip = path.join(tmpDir, 'nebula-config.zip');

      // Copy CA files and write public key
      await fs.promises.copyFile(caFiles.ca, tmpCACrt);
      await fs.promises.copyFile(caFiles.key, tmpCAKey);
      await fs.promises.writeFile(tmpPubKey, publicKey, 'utf-8');

      // Step 4: Sign the public key using nebula-cert
      console.log(
        `[Nebula] Signing certificate for ${deviceName} (${nebulaIp}) using ${nebulaCert}...`
      );
      const ipCIDR = nebulaIp.includes('/') ? nebulaIp : `${nebulaIp}/32`;

      try {
        await execFileAsync(nebulaCert, [
          'sign',
          '-name', deviceName,
          '-ip', ipCIDR,
          '-ca-crt', tmpCACrt,
          '-ca-key', tmpCAKey,
          '-in-pub', tmpPubKey,
          '-out-crt', tmpNodeCrt,
        ]);
      } catch (e: any) {
        console.error('[Nebula] nebula-cert failed:', e);
        await releaseNebulaIp(deviceId);
        return res.status(500).json({
          error: 'Certificate signing failed',
          detail: e?.message || e?.stderr,
        });
      }

      // Step 5: Generate nebula.yml config for this device
      const config = generateNebulaConfig(deviceName, nebulaIp);
      await fs.promises.writeFile(tmpConfig, config, 'utf-8');

      // Step 6: Generate README
      const readme = generateReadme(deviceName, nebulaIp, projectId);
      await fs.promises.writeFile(tmpReadme, readme, 'utf-8');

      // Step 7: Create zip bundle
      console.log('[Nebula] Creating config bundle...');
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(tmpZip);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', reject);

        archive.pipe(output);
        archive.file(tmpCACrt, { name: 'ca.crt' });
        archive.file(tmpNodeCrt, { name: 'node.crt' });
        archive.file(tmpConfig, { name: 'nebula.yml' });
        archive.file(tmpReadme, { name: 'README.md' });
        archive.finalize();
      });

      // Step 8: Read and return zip as base64 (or provide download endpoint)
      const zipBuffer = await fs.promises.readFile(tmpZip);
      const zipBase64 = zipBuffer.toString('base64');

      res.json({
        success: true,
        data: {
          nebulaIp,
          deviceName,
          projectId,
          deviceId,
          zipBundle: zipBase64, // Base64-encoded zip; client decodes and saves
          zipSize: zipBuffer.length,
        },
      });
    } finally {
      // Clean up temp dir
      if (cleanupTmpDir) {
        try {
          await fs.promises.rm(cleanupTmpDir, { recursive: true });
        } catch (e) {
          console.warn('[Nebula] Failed to clean up tmp dir:', e);
        }
      }
    }
  } catch (error: any) {
    console.error('[Nebula] Register endpoint error:', error);
    // Attempt to release IP on catastrophic failure
    if (req.body?.deviceId) {
      await releaseNebulaIp(req.body.deviceId).catch(() => {});
    }
    res.status(500).json({
      error: 'Device registration failed',
      detail: error?.message,
    });
  }
});

// Helper to generate nebula.yml config for a device
function generateNebulaConfig(deviceName: string, nebulaIp: string): string {
  return `# Nebula Configuration - ${deviceName}
# Generated at: ${new Date().toISOString()}

pki:
  ca: ca.crt
  cert: node.crt
  key: node.key

listen:
  host: 0.0.0.0
  port: 4242

punchy:
  punch: true
  respond: true

# TODO: Add your Nebula lighthouse server IP and port
# lighthouse:
#   hosts:
#     - "your.lighthouse.ip:4242"

tun:
  dev: tun0
  drop_local_broadcast: false
  drop_multicast: false

firewall:
  conntrack:
    tcp_timeout: 12m
    udp_timeout: 3m
    default_timeout: 10m
    max_connections: 100000
  inbound:
    - port: any
      proto: any
      host: any
  outbound:
    - port: any
      proto: any
      host: any
`;
}

// Helper to generate README with setup instructions
function generateReadme(deviceName: string, nebulaIp: string, projectId: string): string {
  return `# Nebula Configuration for ${deviceName}

## Device Nebula IP
\`\`\`
${nebulaIp}
\`\`\`

## Setup Instructions

### 1. Prerequisites
- Nebula binary installed on your system
- This config bundle extracted to a safe location (e.g., ~/.vidsync/nebula/${projectId}/)

### 2. Install Nebula
- Linux: \`apt-get install nebula\` or compile from source
- macOS: \`brew install nebula\`
- Windows: Download from https://github.com/slackhq/nebula/releases

### 3. Configure Lighthouse
Edit \`nebula.yml\` and uncomment the lighthouse section, adding your lighthouse server:
\`\`\`yaml
lighthouse:
  hosts:
    - "your.lighthouse.ip:4242"
\`\`\`

### 4. Start Nebula
\`\`\`bash
nebula -config nebula.yml
\`\`\`

### 5. Verify Connection
Once Nebula is running on multiple devices with the same lighthouse, test connectivity:
\`\`\`bash
ping <other-device-nebula-ip>
\`\`\`

## Files in This Bundle
- **ca.crt** — Nebula CA certificate (public)
- **node.crt** — This device's signed Nebula certificate
- **nebula.yml** — Nebula configuration for this device
- **README.md** — This file

## Security Notes
- Keep \`nebula.yml\` safe; do not share it
- Keep your CA private; only stored on cloud server
- Rotate certificates periodically
- Use firewall rules to restrict access between devices

## Troubleshooting
- Nebula logs: Check for connection errors when starting
- Check lighthouse is reachable from your network
- Verify firewall rules allow UDP port 4242
- Test with \`nebula\` CLI tool if needed

## Project ID
\`\`\`
${projectId}
\`\`\`

Generated: ${new Date().toISOString()}
`;
}

// GET /api/nebula/ca - Serve CA cert publicly (no auth required for clients to download)
router.get('/ca', async (req: Request, res: Response) => {
  try {
    const caFiles = findCAFiles();
    if (!caFiles.ca) {
      return res.status(404).json({ error: 'CA certificate not found on server' });
    }

    const caCrt = await fs.promises.readFile(caFiles.ca, 'utf-8');
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename=ca.crt');
    res.send(caCrt);
  } catch (error: any) {
    console.error('[Nebula] CA endpoint error:', error);
    res.status(500).json({ error: error?.message || 'Failed to serve CA certificate' });
  }
});

// GET /api/nebula/status/:deviceId - Check allocation status for a device
router.get('/status/:deviceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const allocation = await getDeviceAllocation(deviceId);

    res.json({
      success: true,
      deviceId,
      nebulaIp: allocation.ip || null,
      allocated: !!allocation.ip,
    });
  } catch (error: any) {
    console.error('[Nebula] Status endpoint error:', error);
    res.status(500).json({ error: error?.message || 'Failed to check status' });
  }
});

// POST /api/nebula/release/:deviceId - Release IP allocation (admin endpoint)
router.post('/release/:deviceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    // TODO: Verify user is admin or owns device

    const result = await releaseNebulaIp(deviceId);
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ success: true, message: `Released IP for device ${deviceId}` });
  } catch (error: any) {
    console.error('[Nebula] Release endpoint error:', error);
    res.status(500).json({ error: error?.message || 'Failed to release IP' });
  }
});

export default router;
