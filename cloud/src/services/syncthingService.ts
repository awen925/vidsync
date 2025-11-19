import http from 'http';
import https from 'https';

interface SyncthingDeviceInfo {
  id: string;
  name: string;
  addresses: string[];
}

interface SyncthingFolderConfig {
  id: string;
  label: string;
  path: string;
  type: string;
  devices: Array<{ deviceID: string }>;
  versioning?: any;
  rescanIntervalS?: number;
  fsWatcherEnabled?: boolean;
  fsWatcherDelayS?: number;
  ignorePerms?: boolean;
  autoNormalize?: boolean;
  paused?: boolean;
}

export class SyncthingService {
  private apiKey: string;
  private host: string = 'localhost';
  private port: number = 8384;
  private timeout: number = 30000;
  private csrfToken: string | null = null;
  private protocol: 'http' | 'https' = 'http'; // Default to HTTP for local Syncthing

  constructor(apiKey: string, host: string = 'localhost', port: number = 8384) {
    this.apiKey = apiKey;
    this.host = host;
    this.port = port;
    console.log(`[SyncthingService] Initialized with apiKey: ${apiKey.substring(0, 8)}..., host: ${host}, port: ${port}`);
  }

  // Note: Syncthing CSRF protection is typically only enforced on state-changing requests (POST/PUT/DELETE)
  // For GET requests with valid API key, CSRF token is not required
  // This method is kept for future use if needed
  private async getCsrfToken(): Promise<string | null> {
    // Return cached token
    if (this.csrfToken) {
      console.log(`[SyncthingService] Using cached CSRF token: ${this.csrfToken.substring(0, 8)}...`);
      return this.csrfToken;
    }

    // Try to fetch CSRF token from the API
    // First, try without auth to get the CSRF token from headers
    return new Promise((resolve) => {
      const protocol = this.protocol === 'https' ? https : http;
      
      const options = {
        hostname: this.host,
        port: this.port,
        path: '/',
        method: 'GET',
        headers: {
          // Don't send API key on initial request - just get CSRF token
        },
        rejectUnauthorized: false,
      };

      console.log(`[SyncthingService] Attempting to fetch CSRF token from ${this.protocol}://${this.host}:${this.port}${options.path}`);

      const req = protocol.request(options, (res) => {
        console.log(`[SyncthingService] CSRF fetch response status: ${res.statusCode}`);
        console.log(`[SyncthingService] Response headers:`, res.headers);
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // Extract CSRF token from response headers
          let csrfToken = res.headers['x-csrf-token'] as string;
          
          if (!csrfToken) {
            // Try to extract from Set-Cookie header (Syncthing format: CSRF-Token-{DEVICE_ID}=token_value)
            const setCookie = res.headers['set-cookie'];
            if (setCookie && Array.isArray(setCookie)) {
              for (const cookie of setCookie) {
                // Format: CSRF-Token-XXXXX=tokenvalue; Path=/; Secure; HttpOnly; SameSite=Lax
                const match = cookie.match(/CSRF-Token-[^=]+=([^;]+)/);
                if (match) {
                  csrfToken = match[1];
                  console.log(`[SyncthingService] Extracted CSRF token from Set-Cookie header: ${csrfToken.substring(0, 8)}...`);
                  break;
                }
              }
            }
          }
          
          if (!csrfToken && data) {
            // Fallback: try to extract from HTML response body
            const match = data.match(/csrfToken["'\s]*[:=]\s*["']([^"']+)["']/);
            if (match) {
              csrfToken = match[1];
              console.log(`[SyncthingService] Extracted CSRF token from HTML: ${csrfToken.substring(0, 8)}...`);
            }
          }
          
          if (csrfToken) {
            console.log(`[SyncthingService] CSRF token obtained: ${csrfToken.substring(0, 8)}...`);
            this.csrfToken = csrfToken;
            resolve(csrfToken);
          } else {
            console.log(`[SyncthingService] No CSRF token found in response, returning null`);
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[SyncthingService] Error fetching CSRF token:`, error);
        resolve(null);
      });

      req.setTimeout(this.timeout, () => {
        console.warn(`[SyncthingService] CSRF token request timeout`);
        req.destroy();
        resolve(null);
      });

      req.end();
    });
  }

  // Make HTTP/HTTPS request to Syncthing API
  private async makeRequest(
    path: string,
    method: string = 'GET',
    body?: any
  ): Promise<any> {
    // Get CSRF token first - this is REQUIRED by Syncthing
    const csrfToken = await this.getCsrfToken();
    console.log(`[SyncthingService] Making ${method} request to ${path}, API key: ${this.apiKey.substring(0, 8)}..., CSRF token: ${csrfToken ? csrfToken.substring(0, 8) + '...' : 'null'}`);

    return new Promise((resolve, reject) => {
      const protocol = this.protocol === 'https' ? https : http;
      
      const headers: any = {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      };

      // ALWAYS add CSRF token if we have one - Syncthing requires it
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
        console.log(`[SyncthingService] Adding CSRF token to headers`);
      } else {
        console.warn(`[SyncthingService] WARNING: No CSRF token available - request may fail with 403`);
      }

      const options = {
        hostname: this.host,
        port: this.port,
        path,
        method,
        headers,
        rejectUnauthorized: false, // For self-signed certs
      };

      console.log(`[SyncthingService] Request:`, { 
        url: `${this.protocol}://${this.host}:${this.port}${path}`,
        method,
        hasCsrfToken: !!csrfToken,
      });

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            console.log(`[SyncthingService] Response status: ${res.statusCode}, data length: ${data.length}`);
            
            if (res.statusCode && res.statusCode >= 400) {
              console.error(`[SyncthingService] API error: ${res.statusCode} - ${data}`);
              reject(new Error(`Syncthing API error: ${res.statusCode} - ${data}`));
            } else {
              resolve(data ? JSON.parse(data) : {});
            }
          } catch (e) {
            console.error(`[SyncthingService] Error parsing response:`, e);
            reject(e);
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[SyncthingService] Request error:`, error);
        reject(error);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.setTimeout(this.timeout, () => {
        console.warn(`[SyncthingService] Request timeout`);
        req.destroy();
        reject(new Error('Syncthing API request timeout'));
      });

      req.end();
    });
  }

  // Get list of devices
  async getDevices(): Promise<SyncthingDeviceInfo[]> {
    try {
      const data = await this.makeRequest('/rest/config/devices');
      return data || [];
    } catch (error) {
      console.error('Failed to get Syncthing devices:', error);
      throw error;
    }
  }

  // Get specific device
  async getDevice(deviceId: string): Promise<SyncthingDeviceInfo> {
    try {
      const devices = await this.getDevices();
      const device = devices.find((d) => d.id === deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }
      return device;
    } catch (error) {
      console.error(`Failed to get Syncthing device ${deviceId}:`, error);
      throw error;
    }
  }

  // Get folder configuration
  async getFolder(folderId: string): Promise<SyncthingFolderConfig> {
    try {
      const data = await this.makeRequest(`/rest/config/folders/${folderId}`);
      return data;
    } catch (error) {
      console.error(`Failed to get Syncthing folder ${folderId}:`, error);
      throw error;
    }
  }

  // Create or update folder
  async updateFolder(folderId: string, config: Partial<SyncthingFolderConfig>): Promise<void> {
    try {
      // First get current config
      const current = await this.getFolder(folderId);
      const updated = { ...current, ...config };
      
      await this.makeRequest(`/rest/config/folders/${folderId}`, 'PUT', updated);
      console.log(`Updated Syncthing folder ${folderId}`);
    } catch (error) {
      console.error(`Failed to update Syncthing folder ${folderId}:`, error);
      throw error;
    }
  }

  // Add device to folder (enable syncing to that device)
  // Backward compatible - defaults to receiveonly for invitees
  async addDeviceToFolder(folderId: string, deviceId: string): Promise<void> {
    return this.addDeviceToFolderWithRole(folderId, deviceId, 'receiveonly');
  }

  // Remove device from folder
  async removeDeviceFromFolder(folderId: string, deviceId: string): Promise<void> {
    try {
      const folder = await this.getFolder(folderId);
      
      folder.devices = folder.devices.filter((d) => d.deviceID !== deviceId);
      await this.updateFolder(folderId, folder);
      
      console.log(`[SyncthingService] Removed device ${deviceId} from folder ${folderId}`);
    } catch (error) {
      console.error(`[SyncthingService] Failed to remove device from folder:`, error);
      throw error;
    }
  }

  // Pause folder (stop syncing)
  async pauseFolder(folderId: string): Promise<void> {
    try {
      const folder = await this.getFolder(folderId);
      folder.paused = true;
      await this.updateFolder(folderId, folder);
      console.log(`Paused Syncthing folder ${folderId}`);
    } catch (error) {
      console.error(`Failed to pause Syncthing folder ${folderId}:`, error);
      throw error;
    }
  }

  // Resume folder (start syncing)
  async resumeFolder(folderId: string): Promise<void> {
    try {
      const folder = await this.getFolder(folderId);
      folder.paused = false;
      await this.updateFolder(folderId, folder);
      console.log(`Resumed Syncthing folder ${folderId}`);
    } catch (error) {
      console.error(`Failed to resume Syncthing folder ${folderId}:`, error);
      throw error;
    }
  }

  // Wait for folder to finish scanning using event stream
  // Returns when LocalIndexUpdated event is received for the folder
  async waitForFolderScanned(folderId: string, timeoutMs: number = 60000): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = this.protocol === 'https' ? https : http;
      let isResolved = false;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          req.destroy();
          reject(new Error(`Timeout waiting for folder ${folderId} to be scanned (${timeoutMs}ms)`));
        }
      }, timeoutMs);

      const options = {
        hostname: this.host,
        port: this.port,
        path: '/rest/events?since=0',
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        rejectUnauthorized: false,
      };

      console.log(`[SyncthingService] Listening for events for folder ${folderId}...`);

      const req = protocol.request(options, (res) => {
        let buffer = '';
        let inArray = false;
        let eventCount = 0;

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          // Process buffer looking for complete JSON objects
          while (buffer.length > 0) {
            const trimmed = buffer.trimStart();
            
            // Skip array markers
            if (trimmed.startsWith('[')) {
              buffer = trimmed.substring(1);
              inArray = true;
              continue;
            }
            if (trimmed.startsWith(']')) {
              buffer = trimmed.substring(1);
              continue;
            }
            
            // Skip commas
            if (trimmed.startsWith(',')) {
              buffer = trimmed.substring(1);
              continue;
            }

            // Look for a complete JSON object
            if (trimmed.startsWith('{')) {
              let braceCount = 0;
              let endIndex = -1;

              for (let i = 0; i < trimmed.length; i++) {
                if (trimmed[i] === '{') braceCount++;
                if (trimmed[i] === '}') braceCount--;
                if (braceCount === 0) {
                  endIndex = i;
                  break;
                }
              }

              if (endIndex === -1) {
                // Incomplete object, wait for more data
                break;
              }

              const jsonStr = trimmed.substring(0, endIndex + 1);
              buffer = trimmed.substring(endIndex + 1);

              try {
                const event = JSON.parse(jsonStr);
                eventCount++;

                // Check for LocalIndexUpdated event for our folder
                if (event.type === 'LocalIndexUpdated' && event.data?.folder === folderId) {
                  console.log(`[SyncthingService] ✅ LocalIndexUpdated for folder ${folderId} (event #${eventCount})`);
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeout);
                    req.destroy();
                    resolve();
                  }
                  return;
                }

                // Debug: log relevant events
                if (event.data?.folder === folderId) {
                  console.log(`[SyncthingService] Event for ${folderId}: type=${event.type}`);
                }
              } catch (parseErr) {
                console.debug(`[SyncthingService] Could not parse event: ${jsonStr.substring(0, 50)}`);
              }
            } else {
              // Unknown character, skip it
              buffer = trimmed.substring(1);
            }
          }
        });

        res.on('end', () => {
          if (!isResolved) {
            clearTimeout(timeout);
            reject(new Error(`Event stream closed before LocalIndexUpdated received for folder ${folderId}`));
          }
        });

        res.on('error', (error) => {
          if (!isResolved) {
            clearTimeout(timeout);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        if (!isResolved) {
          clearTimeout(timeout);
          console.error(`[SyncthingService] Event stream request error:`, error);
          reject(error);
        }
      });

      req.end();
    });
  }

  // Get folder status
  async getFolderStatus(folderId: string): Promise<any> {
    try {
      const data = await this.makeRequest(`/rest/db/status?folder=${folderId}`);
      return data;
    } catch (error) {
      console.error(`Failed to get Syncthing folder status for ${folderId}:`, error);
      throw error;
    }
  }

  // Get list of files in a folder with their sync status
  async getFolderFiles(
    folderId: string,
    levels: number = 5
  ): Promise<Array<{
    path: string;
    name: string;
    type: 'file' | 'dir';
    size: number;
    modTime: string;
    syncStatus: 'synced' | 'syncing' | 'pending' | 'error';
  }>> {
    try {
      // Query Syncthing browse API to get file tree
      const browseData = await this.makeRequest(
        `/rest/db/browse?folder=${folderId}&levels=${levels}&prefix=`
      );

      console.log(`[getFolderFiles] Response type: ${typeof browseData}`);
      console.log(`[getFolderFiles] Is array: ${Array.isArray(browseData)}`);
      console.log(`[getFolderFiles] Response keys (first 15):`, 
        Array.isArray(browseData) ? 'N/A (array)' : Object.keys(browseData).slice(0, 15)
      );

      // Also get folder status to determine sync state
      const folderStatus = await this.getFolderStatus(folderId);

      const files: Array<{
        path: string;
        name: string;
        type: 'file' | 'dir';
        size: number;
        modTime: string;
        syncStatus: 'synced' | 'syncing' | 'pending' | 'error';
      }> = [];

      // Recursively flatten the file tree
      let maxDepthReached = 0;
      
      const flatten = (items: any[], prefix: string = '', depth: number = 0): void => {
        if (!items) {
          console.warn(`[getFolderFiles] Items is null/undefined at prefix: ${prefix}`);
          return;
        }

        maxDepthReached = Math.max(maxDepthReached, depth);
        console.log(`[getFolderFiles] Processing ${items.length} items at prefix: ${prefix} (depth: ${depth})`);

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const path = prefix ? `${prefix}/${item.name}` : item.name;
          const hasChildren = !!item.children;
          const childCount = item.children ? item.children.length : 0;

          if (i === 0 && depth === 0) {
            console.log(`[getFolderFiles] First item details: name=${item.name}, type=${item.type}, hasChildren=${hasChildren}, childCount=${childCount}`);
          }

          // Determine sync status based on folder-level sync state
          let syncStatus: 'synced' | 'syncing' | 'pending' | 'error' = 'synced';

          // If folder is actively syncing and has pending files, assume files are syncing
          if (folderStatus.needFiles > 0 || folderStatus.needBytes > 0) {
            if (folderStatus.inSyncFiles > 0) {
              syncStatus = 'syncing';
            } else {
              syncStatus = 'pending';
            }
          }

          // Check for errors
          if ((folderStatus.pullErrors && folderStatus.pullErrors > 0) || folderStatus.invalid) {
            syncStatus = 'error';
          }

          files.push({
            path,
            name: item.name,
            type: item.type === 'file' ? 'file' : 'dir',
            size: item.size || 0,
            modTime: new Date().toISOString(), // Syncthing browse API doesn't include modification time
            syncStatus,
          });

          // Recursively process children
          if (item.children && Array.isArray(item.children) && item.children.length > 0) {
            console.log(`[getFolderFiles] Recursing into ${item.name} with ${childCount} children (depth ${depth} -> ${depth + 1})`);
            flatten(item.children, path, depth + 1);
          }
        }
      };

      // Handle different response structures
      // The response could be:
      // 1. An object with 'children' property: { children: [...] }
      // 2. An object that IS the root with nested children
      // 3. A direct array
      
      let itemsToFlatten: any[] = [];
      
      if (Array.isArray(browseData)) {
        // Direct array response
        itemsToFlatten = browseData;
        console.log(`[getFolderFiles] Using direct array response`);
      } else if (browseData.children && Array.isArray(browseData.children)) {
        // Wrapped in children property
        itemsToFlatten = browseData.children;
        console.log(`[getFolderFiles] Using browseData.children`);
      } else if (browseData.type === 'dir' && browseData.children) {
        // Root is a directory with children
        itemsToFlatten = browseData.children;
        console.log(`[getFolderFiles] Using root children (root is dir)`);
      } else {
        // Maybe the response itself is the folder object
        console.warn(`[getFolderFiles] Unexpected response structure:`, {
          type: browseData.type,
          hasChildren: !!browseData.children,
          hasName: !!browseData.name,
          keys: Object.keys(browseData).slice(0, 10),
        });
      }

      // Flatten the items
      if (itemsToFlatten && itemsToFlatten.length > 0) {
        flatten(itemsToFlatten);
      }

      console.log(`[getFolderFiles] ✅ Successfully flattened ${files.length} files for folder ${folderId} (max depth: ${maxDepthReached})`);
      return files;
    } catch (error) {
      console.error(`Failed to get folder files for ${folderId}:`, error);
      throw error;
    }
  }

  // Get detailed sync status for a specific file
  async getFileSyncStatus(
    folderId: string,
    filePath: string
  ): Promise<{
    state: 'synced' | 'syncing' | 'pending' | 'error';
    percentComplete: number;
    bytesDownloaded: number;
    totalBytes: number;
    lastError?: string;
  }> {
    try {
      // Query folder status
      const folderStatus = await this.getFolderStatus(folderId);

      // Determine sync state for this file
      let state: 'synced' | 'syncing' | 'pending' | 'error' = 'synced';
      let percentComplete = 100;

      if (folderStatus.needFiles > 0 || folderStatus.needBytes > 0) {
        if (folderStatus.inSyncFiles > 0) {
          state = 'syncing';
          // Calculate per-file progress (rough estimate)
          percentComplete =
            folderStatus.globalBytes > 0
              ? Math.round((folderStatus.inSyncBytes / folderStatus.globalBytes) * 100)
              : 0;
        } else {
          state = 'pending';
          percentComplete = 0;
        }
      }

      // Check for errors
      if ((folderStatus.pullErrors && folderStatus.pullErrors > 0) || folderStatus.invalid) {
        state = 'error';
      }

      return {
        state,
        percentComplete,
        bytesDownloaded: folderStatus.inSyncBytes || 0,
        totalBytes: folderStatus.globalBytes || 0,
        lastError: folderStatus.invalid || undefined,
      };
    } catch (error) {
      console.error(`Failed to get file sync status for ${filePath}:`, error);
      throw error;
    }
  }

  // Trigger folder scan
  async scanFolder(folderId: string, subfolder: string = ''): Promise<void> {
    try {
      let path = `/rest/db/scan?folder=${folderId}`;
      if (subfolder) {
        path += `&sub=${subfolder}`;
      }
      await this.makeRequest(path, 'POST');
      console.log(`Scanned Syncthing folder ${folderId}`);
    } catch (error) {
      console.error(`Failed to scan Syncthing folder ${folderId}:`, error);
      throw error;
    }
  }

  // Create a new folder
  async createFolder(folderId: string, label: string, path: string, ownerDeviceId: string): Promise<any> {
    try {
      const folderConfig: SyncthingFolderConfig = {
        id: folderId,
        label: label,
        path: path,
        type: 'sendreceive', // Owner device can send and receive changes
        devices: [
          {
            deviceID: ownerDeviceId, // Owner's device
          },
        ],
        versioning: {
          type: 'simple',
          params: {
            keep: '5', // Keep 5 old versions
          },
        },
        rescanIntervalS: 3600, // Rescan every hour
        fsWatcherEnabled: true,
        fsWatcherDelayS: 10,
        ignorePerms: false,
        autoNormalize: true,
        paused: false,
      };

      const response = await this.makeRequest('/rest/config/folders', 'POST', folderConfig);
      console.log(`[SyncthingService] Created Syncthing folder ${folderId} at ${path} with sendreceive type for owner ${ownerDeviceId}`);
      return response;
    } catch (error) {
      console.error(`[SyncthingService] Failed to create Syncthing folder ${folderId}:`, error);
      throw error;
    }
  }

  // Verify folder was actually created and exists in Syncthing
  // This ensures the folder is real before we proceed
  async verifyFolderExists(folderId: string, timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    const interval = 200; // Poll every 200ms

    while (Date.now() - startTime < timeoutMs) {
      try {
        const folder = await this.getFolder(folderId);
        if (folder && folder.id === folderId) {
          console.log(`[SyncthingService] ✅ Verified folder ${folderId} exists in Syncthing`);
          return true;
        }
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
          // Non-404 error, log it
          console.debug(`[SyncthingService] Verification attempt - ${errorMsg}`);
        }
        // 404 means folder not yet created, continue polling
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    console.error(`[SyncthingService] ✗ Timeout verifying folder ${folderId} (${timeoutMs}ms)`);
    return false;
  }

  // Wait for RemoteFolderSummary event (indicates folder is known to exist)
  // This is more reliable than checking folder config
  async waitForFolderKnown(folderId: string, timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = this.protocol === 'https' ? https : http;
      let isResolved = false;
      let eventCount = 0;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          req.destroy();
          console.warn(`[SyncthingService] Timeout waiting for folder ${folderId} to be known (${timeoutMs}ms, ${eventCount} events received)`);
          reject(new Error(`Timeout waiting for folder ${folderId} to be known`));
        }
      }, timeoutMs);

      const options = {
        hostname: this.host,
        port: this.port,
        path: '/rest/events?since=0',
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        rejectUnauthorized: false,
      };

      console.log(`[SyncthingService] Listening for RemoteFolderSummary/LocalFolderSummary event for ${folderId}...`);

      const req = protocol.request(options, (res) => {
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          while (buffer.length > 0) {
            const trimmed = buffer.trimStart();
            
            if (trimmed.startsWith('[') || trimmed.startsWith(']') || trimmed.startsWith(',')) {
              buffer = trimmed.substring(1);
              continue;
            }

            if (trimmed.startsWith('{')) {
              let braceCount = 0;
              let endIndex = -1;

              for (let i = 0; i < trimmed.length; i++) {
                if (trimmed[i] === '{') braceCount++;
                if (trimmed[i] === '}') braceCount--;
                if (braceCount === 0) {
                  endIndex = i;
                  break;
                }
              }

              if (endIndex === -1) {
                break;
              }

              const jsonStr = trimmed.substring(0, endIndex + 1);
              buffer = trimmed.substring(endIndex + 1);

              try {
                const event = JSON.parse(jsonStr);
                eventCount++;

                // Check for folder-related events
                if ((event.type === 'RemoteFolderSummary' || event.type === 'LocalFolderSummary') && 
                    event.data?.folder === folderId) {
                  console.log(`[SyncthingService] ✅ Folder ${folderId} is known to Syncthing (event: ${event.type})`);
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeout);
                    req.destroy();
                    resolve();
                  }
                  return;
                }

                // Also accept LocalIndexUpdated as indication folder exists
                if (event.type === 'LocalIndexUpdated' && event.data?.folder === folderId) {
                  console.log(`[SyncthingService] ✅ Folder ${folderId} exists (LocalIndexUpdated received)`);
                  if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeout);
                    req.destroy();
                    resolve();
                  }
                  return;
                }
              } catch (parseErr) {
                console.debug(`[SyncthingService] Could not parse event`);
              }
            } else {
              buffer = trimmed.substring(1);
            }
          }
        });

        res.on('end', () => {
          if (!isResolved) {
            clearTimeout(timeout);
            reject(new Error(`Event stream closed before folder ${folderId} became known`));
          }
        });

        res.on('error', (error) => {
          if (!isResolved) {
            clearTimeout(timeout);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        if (!isResolved) {
          clearTimeout(timeout);
          console.error(`[SyncthingService] Event stream request error:`, error);
          reject(error);
        }
      });

      req.end();
    });
  }

  // Add device to folder with optional role (sendreceive or receiveonly)
  // CRITICAL: In Syncthing, the folder type is PER-DEVICE
  // - Owner's device: folder type = "sendreceive" (can send and receive)
  // - Invitee's device: folder type = "receiveonly" (can only receive)
  async addDeviceToFolderWithRole(
    folderId: string, 
    deviceId: string, 
    role: 'sendreceive' | 'receiveonly' = 'receiveonly'
  ): Promise<void> {
    try {
      const folder = await this.getFolder(folderId);
      
      // Check if device already in folder
      const alreadyExists = folder.devices.some((d) => d.deviceID === deviceId);
      if (alreadyExists) {
        console.log(`[SyncthingService] Device ${deviceId} already in folder ${folderId}`);
        return;
      }

      // Add device to owner's folder device list
      folder.devices.push({ deviceID: deviceId });
      
      console.log(
        `[SyncthingService] Adding device ${deviceId} to folder ${folderId} with role: ${role}`
      );

      // Update the folder on the owner's device
      await this.updateFolder(folderId, folder);
      console.log(
        `[SyncthingService] ✅ Added device ${deviceId} to folder ${folderId}. ` +
        `IMPORTANT: Invitee must configure folder as "receiveonly" on their device.`
      );

      // NOTE: The invitee's device needs to be configured separately:
      // 1. Syncthing will PROPOSE the share to the invitee's device
      // 2. Invitee accepts the share on their device UI
      // 3. OR we use Go-Agent to auto-configure the folder with receiveonly type
      // 
      // Current implementation requires manual acceptance.
      // TODO: Implement Go-Agent endpoint to auto-accept and configure folder as receiveonly
    } catch (error) {
      console.error(`[SyncthingService] Failed to add device to folder:`, error);
      throw error;
    }
  }

  // Delete a folder
  async deleteFolder(folderId: string): Promise<void> {
    try {
      await this.makeRequest(`/rest/config/folders/${folderId}`, 'DELETE');
      console.log(`Deleted Syncthing folder ${folderId}`);
    } catch (error) {
      console.error(`Failed to delete Syncthing folder ${folderId}:`, error);
      throw error;
    }
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/rest/system/status');
      console.log('Syncthing connection successful');
      return true;
    } catch (error) {
      console.error('Failed to connect to Syncthing:', error);
      return false;
    }
  }

  // Send folder configuration command to invitee's Go-Agent
  // This tells the invitee's device to accept the folder share and configure it as receiveonly
  async notifyInviteeToAcceptFolder(
    inviteeWebSocketUrl: string,
    folderId: string,
    folderLabel: string,
    folderPath: string,
    ownerDeviceId: string
  ): Promise<void> {
    try {
      const command = {
        type: 'folder_share_accept',
        data: {
          folderId,
          folderLabel,
          folderPath,
          ownerDeviceId,
          folderType: 'receiveonly', // ← CRITICAL: Enforce read-only
        },
      };

      console.log(
        `[SyncthingService] Sending folder share accept command to invitee at ${inviteeWebSocketUrl}`
      );
      
      // This would be sent via WebSocket from the cloud backend
      // OR via HTTP if Go-Agent exposes a REST endpoint for this
      // TODO: Implement this communication channel
      
      console.log(`[SyncthingService] ℹ️ Invitee needs to accept folder ${folderId} as receiveonly`);
    } catch (error) {
      console.error(`[SyncthingService] Failed to notify invitee:`, error);
      throw error;
    }
  }
}

