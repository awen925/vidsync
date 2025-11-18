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
  async addDeviceToFolder(folderId: string, deviceId: string): Promise<void> {
    try {
      const folder = await this.getFolder(folderId);
      
      // Check if device already in folder
      const alreadyExists = folder.devices.some((d) => d.deviceID === deviceId);
      if (alreadyExists) {
        console.log(`Device ${deviceId} already in folder ${folderId}`);
        return;
      }

      // Add device
      folder.devices.push({ deviceID: deviceId });
      await this.updateFolder(folderId, folder);
      
      console.log(`Added device ${deviceId} to folder ${folderId}`);
    } catch (error) {
      console.error(`Failed to add device to folder:`, error);
      throw error;
    }
  }

  // Remove device from folder
  async removeDeviceFromFolder(folderId: string, deviceId: string): Promise<void> {
    try {
      const folder = await this.getFolder(folderId);
      
      folder.devices = folder.devices.filter((d) => d.deviceID !== deviceId);
      await this.updateFolder(folderId, folder);
      
      console.log(`Removed device ${deviceId} from folder ${folderId}`);
    } catch (error) {
      console.error(`Failed to remove device from folder:`, error);
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
        type: 'sendreceive', // Can send and receive changes
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
      console.log(`Created Syncthing folder ${folderId} at ${path}`);
      return response;
    } catch (error) {
      console.error(`Failed to create Syncthing folder ${folderId}:`, error);
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
}
