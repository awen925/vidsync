import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Utility to read Syncthing API key from device's local config file
 * Location: ~/.config/vidsync/syncthing/shared/config.xml
 */

const CONFIG_PATHS = [
  // Primary: vidsync-specific config
  path.join(os.homedir(), '.config', 'vidsync', 'syncthing', 'shared', 'config.xml'),
  // Fallback: standard Syncthing config locations
  path.join(os.homedir(), '.config', 'syncthing', 'config.xml'),
  path.join(os.homedir(), 'Syncthing', 'config.xml'), // Windows
  path.join(os.homedir(), 'Library', 'Application Support', 'Syncthing', 'config.xml'), // macOS
];

export interface SyncthingConfig {
  apiKey: string;
  host: string;
  port: number;
  httpsEnabled: boolean;
  certPath?: string;
  keyPath?: string;
}

/**
 * Simple XML tag extractor - gets content between opening and closing tags
 */
function extractXmlTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Parse Syncthing config.xml and extract API key
 */
function parseSyncthingConfigXml(configPath: string): SyncthingConfig {
  try {
    console.log(`[SyncthingConfig] Reading config from: ${configPath}`);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found at ${configPath}`);
    }

    const xmlContent = fs.readFileSync(configPath, 'utf-8');

    // Extract API key
    const apiKey = extractXmlTag(xmlContent, 'apikey');
    if (!apiKey) {
      throw new Error('API key not found in config.xml');
    }

    // Extract GUI config (host:port)
    const address = extractXmlTag(xmlContent, 'address') || 'localhost:8384';
    const [hostPart, portStr] = address.split(':');
    const port = parseInt(portStr) || 8384;

    // Convert special addresses to localhost
    // 'dynamic' means listen on all interfaces, so we use localhost to connect
    // '0.0.0.0' also means all interfaces
    // '::' means all interfaces IPv6
    let host = hostPart;
    if (hostPart === 'dynamic' || hostPart === '0.0.0.0' || hostPart === '::' || !hostPart) {
      host = 'localhost';
      console.log(`[SyncthingConfig] Converted '${hostPart}' to 'localhost'`);
    }

    // Check if HTTPS is enabled
    const tlsTag = extractXmlTag(xmlContent, 'tls');
    const httpsEnabled = tlsTag === 'true';

    // Get cert/key paths
    const configDir = path.dirname(configPath);
    const certPath = path.join(configDir, 'https-cert.pem');
    const keyPath = path.join(configDir, 'https-key.pem');

    console.log(`[SyncthingConfig] Successfully parsed config:`, {
      host,
      port,
      httpsEnabled,
      apiKey: apiKey.substring(0, 8) + '...',
    });

    return {
      apiKey,
      host,
      port,
      httpsEnabled,
      certPath: fs.existsSync(certPath) ? certPath : undefined,
      keyPath: fs.existsSync(keyPath) ? keyPath : undefined,
    };
  } catch (error) {
    console.error(`[SyncthingConfig] Error parsing config:`, error);
    throw error;
  }
}

/**
 * Get Syncthing config from device's local file
 * Tries multiple common locations
 */
export function getSyncthingConfig(): SyncthingConfig {
  for (const configPath of CONFIG_PATHS) {
    try {
      return parseSyncthingConfigXml(configPath);
    } catch (error) {
      console.debug(`[SyncthingConfig] Config not at ${configPath}:`, (error as Error).message);
      continue;
    }
  }

  // If all paths failed
  console.error('[SyncthingConfig] Could not find Syncthing config at any of these locations:');
  CONFIG_PATHS.forEach(p => console.error(`  - ${p}`));
  
  throw new Error(
    'Syncthing config not found. Ensure Syncthing is installed and configured at: ' +
    CONFIG_PATHS[0]
  );
}

/**
 * Validate Syncthing is accessible with the given config
 */
export async function validateSyncthingConnection(config: SyncthingConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const protocol = config.httpsEnabled ? require('https') : require('http');

    console.log(`[SyncthingConfig] Testing connection to: http${config.httpsEnabled ? 's' : ''}://${config.host}:${config.port}`);

    const options: any = {
      hostname: config.host,
      port: config.port,
      path: '/rest/system/status',
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
      rejectUnauthorized: false,
    };

    if (config.httpsEnabled && config.certPath && config.keyPath) {
      options.ca = fs.readFileSync(config.certPath);
      options.key = fs.readFileSync(config.keyPath);
    }

    const req = protocol.request(options, (res: any) => {
      console.log(`[SyncthingConfig] Connection test response: ${res.statusCode}`);
      resolve(res.statusCode === 200);
    });

    req.on('error', (error: any) => {
      console.error(`[SyncthingConfig] Connection test failed:`, error.message);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      console.warn(`[SyncthingConfig] Connection test timeout`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}
