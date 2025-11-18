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

  constructor(apiKey: string, host: string = 'localhost', port: number = 8384) {
    this.apiKey = apiKey;
    this.host = host;
    this.port = port;
  }

  // Make HTTPS request to Syncthing API
  private async makeRequest(
    path: string,
    method: string = 'GET',
    body?: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.host,
        port: this.port,
        path,
        method,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: false, // For self-signed certs
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Syncthing API error: ${res.statusCode} - ${data}`));
            } else {
              resolve(data ? JSON.parse(data) : {});
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.setTimeout(this.timeout, () => {
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
