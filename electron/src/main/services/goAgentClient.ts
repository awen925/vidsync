import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * GoAgentClient provides HTTP interface to the Go service running on localhost:5001
 * This is the primary bridge for:
 * - Syncthing folder operations (create, delete, pause, resume)
 * - Device management (add, remove, sync)
 * - File operations (list, tree, snapshot)
 * - Sync status queries
 */
export class GoAgentClient {
  private client: AxiosInstance;
  private logger: any;
  private baseURL = 'http://localhost:5001/api/v1';

  constructor(logger: any) {
    this.logger = logger;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      validateStatus: () => true, // Don't throw on any status
    });

    // Add request logging
    this.client.interceptors.request.use((config) => {
      this.logger.debug(
        `[GoAgent] ${config.method?.toUpperCase()} ${config.url}`
      );
      return config;
    });

    // Add response logging and error handling
    this.client.interceptors.response.use((response) => {
      if (response.status >= 400) {
        this.logger.warn(
          `[GoAgent] ${response.status} - ${response.data?.error || 'Unknown error'}`
        );
      }
      return response;
    });
  }

  /**
   * Check if Go service is available
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      this.logger.warn('[GoAgent] Health check failed');
      return false;
    }
  }

  /**
   * Create a new project with Syncthing folder
   */
  async createProject(
    projectId: string,
    name: string,
    localPath: string,
    deviceId: string,
    ownerId: string,
    accessToken: string
  ): Promise<{ ok: boolean; projectId?: string; error?: string }> {
    try {
      const response = await this.client.post('/projects', {
        projectId,
        name,
        localPath,
        deviceId,
        ownerId,
        accessToken,
      });

      if (response.status === 201 || response.status === 200) {
        return { ok: true, projectId };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Create project failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Create a new project WITH snapshot generation
   * Proper async event order:
   * 1. Create in cloud database
   * 2. Get projectId from response
   * 3. Create Syncthing folder
   * 4. Listen for folder scan completion (background)
   * 5. Generate snapshot and upload to storage (background)
   */
  async createProjectWithSnapshot(
    projectId: string,
    name: string,
    localPath: string,
    deviceId: string,
    ownerId: string,
    accessToken: string
  ): Promise<{ ok: boolean; projectId?: string; error?: string }> {
    try {
      const response = await this.client.post('/projects/with-snapshot', {
        projectId,
        name,
        localPath,
        deviceId,
        ownerId,
        accessToken,
      });

      if (response.status === 201 || response.status === 200) {
        this.logger.info(
          `[GoAgent] Project created with snapshot generation: ${response.data?.projectId || projectId}`
        );
        return { ok: true, projectId: response.data?.projectId || projectId };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Create project with snapshot failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Get project details with Syncthing status
   */
  async getProject(
    projectId: string,
    accessToken: string
  ): Promise<any> {
    try {
      const response = await this.client.get(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 200) {
        return response.data;
      }

      throw new Error(response.data?.error || 'Failed to get project');
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Get project failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Delete a project (removes Syncthing folder)
   */
  async deleteProject(
    projectId: string,
    accessToken: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.delete(`/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 200 || response.status === 204) {
        return { ok: true };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Delete project failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Add a device to a project folder
   */
  async addDevice(
    projectId: string,
    deviceId: string,
    accessToken: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post(
        `/projects/${projectId}/devices`,
        { deviceId },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200 || response.status === 201) {
        return { ok: true };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Add device failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Remove a device from a project folder
   */
  async removeDevice(
    projectId: string,
    deviceId: string,
    accessToken: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.delete(
        `/projects/${projectId}/devices/${deviceId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200 || response.status === 204) {
        return { ok: true };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Remove device failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Start syncing a project folder
   */
  async startSync(
    projectId: string,
    localPath: string,
    accessToken: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post(
        `/projects/${projectId}/sync/start`,
        { localPath },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200) {
        return { ok: true };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Start sync failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Pause syncing a project
   */
  async pauseSync(
    projectId: string,
    accessToken: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post(
        `/projects/${projectId}/sync/pause`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200) {
        return { ok: true };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Pause sync failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Resume syncing a project
   */
  async resumeSync(
    projectId: string,
    accessToken: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post(
        `/projects/${projectId}/sync/resume`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200) {
        return { ok: true };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Resume sync failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Stop syncing a project
   */
  async stopSync(
    projectId: string,
    accessToken: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post(
        `/projects/${projectId}/sync/stop`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200) {
        return { ok: true };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Stop sync failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Get sync status for a project
   */
  async getSyncStatus(
    projectId: string,
    accessToken: string
  ): Promise<any> {
    try {
      const response = await this.client.get(
        `/projects/${projectId}/sync/status`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200) {
        return response.data;
      }

      throw new Error(response.data?.error || 'Failed to get sync status');
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Get sync status failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Get file list for a project
   */
  async getFiles(
    projectId: string,
    limit?: string,
    offset?: string,
    accessToken?: string
  ): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit);
      if (offset) params.append('offset', offset);

      const response = await this.client.get(
        `/projects/${projectId}/files`,
        {
          params: Object.fromEntries(params),
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        }
      );

      if (response.status === 200) {
        return response.data;
      }

      throw new Error(response.data?.error || 'Failed to get files');
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Get files failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Get file tree structure for a project
   */
  async getFileTree(
    projectId: string,
    accessToken?: string
  ): Promise<any> {
    try {
      const response = await this.client.get(
        `/projects/${projectId}/files-tree`,
        {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        }
      );

      if (response.status === 200) {
        return response.data;
      }

      throw new Error(response.data?.error || 'Failed to get file tree');
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Get file tree failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Generate snapshot of project files
   */
  async generateSnapshot(
    projectId: string,
    accessToken: string
  ): Promise<{ ok: boolean; snapshotId?: string; error?: string }> {
    try {
      const response = await this.client.post(
        `/projects/${projectId}/snapshot`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200 || response.status === 201) {
        return {
          ok: true,
          snapshotId: response.data?.snapshotId,
        };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Generate snapshot failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Sync device information
   */
  async syncDevice(
    userID: string,
    accessToken: string
  ): Promise<{ ok: boolean; deviceId?: string; error?: string }> {
    try {
      const response = await this.client.post(
        '/devices/sync',
        { userId: userID },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 200) {
        return {
          ok: true,
          deviceId: response.data?.deviceId,
        };
      }

      return { ok: false, error: response.data?.error || 'Unknown error' };
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Sync device failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Get device status
   */
  async getDeviceStatus(deviceId: string): Promise<any> {
    try {
      const response = await this.client.get(`/devices/${deviceId}/status`);

      if (response.status === 200) {
        return response.data;
      }

      throw new Error(response.data?.error || 'Failed to get device status');
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Get device status failed: ${err.message}`
      );
      throw error;
    }
  }

  /**
   * Get project status for polling during snapshot generation
   * Returns: projectId, snapshotUrl, snapshotFileCount, snapshotTotalSize, syncStatus
   */
  async getProjectStatus(projectId: string): Promise<any> {
    try {
      const response = await this.client.get(`/projects/${projectId}/status`);

      if (response.status === 200) {
        return response.data;
      }

      throw new Error(response.data?.error || 'Failed to get project status');
    } catch (error) {
      const err = error as AxiosError;
      this.logger.error(
        `[GoAgent] Get project status failed: ${err.message}`
      );
      throw error;
    }
  }
}

export default GoAgentClient;
