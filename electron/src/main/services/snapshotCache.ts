import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

interface SnapshotCacheOptions {
  projectId: string;
  downloadUrl?: string;
}

interface SnapshotData {
  files: any[];
  timestamp: number;
}

export class SnapshotCacheService {
  private cacheDir: string;

  constructor() {
    // Create cache directory: ~/.vidsync/projects/snapshots
    const userDataPath = app.getPath('userData');
    this.cacheDir = path.join(userDataPath, 'projects', 'snapshots');
    
    // Ensure directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get the cache file path for a project
   */
  private getCacheFilePath(projectId: string, compressed: boolean = false): string {
    const filename = compressed ? `${projectId}.json.gz` : `${projectId}.json`;
    return path.join(this.cacheDir, filename);
  }

  /**
   * Get cached snapshot data if it exists
   */
  async getCachedSnapshot(projectId: string): Promise<SnapshotData | null> {
    try {
      const gzPath = this.getCacheFilePath(projectId, true);
      const jsonPath = this.getCacheFilePath(projectId, false);

      // Check if JSON cache exists (faster)
      if (fs.existsSync(jsonPath)) {
        const data = fs.readFileSync(jsonPath, 'utf-8');
        return JSON.parse(data);
      }

      // Check if compressed cache exists
      if (fs.existsSync(gzPath)) {
        const compressed = fs.readFileSync(gzPath);
        const decompressed = await gunzip(compressed);
        const jsonData = decompressed.toString('utf-8');
        const parsed = JSON.parse(jsonData);

        // Cache the decompressed JSON for next time
        fs.writeFileSync(jsonPath, JSON.stringify(parsed));
        return parsed;
      }

      return null;
    } catch (error) {
      console.error(`Failed to get cached snapshot for project ${projectId}:`, error);
      return null;
    }
  }

  /**
   * Download and cache a snapshot from URL
   */
  async downloadAndCacheSnapshot(
    projectId: string,
    downloadUrl: string,
    onProgress?: (status: string, progress?: number) => void
  ): Promise<SnapshotData | null> {
    try {
      onProgress?.('Downloading snapshot...');

      // Use fetch to download
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download snapshot: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      onProgress?.('Processing snapshot...', 50);

      // Determine if compressed
      const isGzip = this.isGzipBuffer(Buffer.from(buffer));
      
      let decompressed: Buffer;
      if (isGzip) {
        decompressed = await gunzip(Buffer.from(buffer));
      } else {
        decompressed = Buffer.from(buffer);
      }

      onProgress?.('Parsing data...', 75);

      const jsonData = decompressed.toString('utf-8');
      const parsed = JSON.parse(jsonData) as SnapshotData;

      // Cache both versions
      const gzPath = this.getCacheFilePath(projectId, true);
      const jsonPath = this.getCacheFilePath(projectId, false);

      fs.writeFileSync(gzPath, Buffer.from(buffer));
      fs.writeFileSync(jsonPath, JSON.stringify(parsed));

      onProgress?.('Snapshot ready', 100);
      return parsed;
    } catch (error) {
      console.error(`Failed to download and cache snapshot for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Check if buffer is gzip compressed
   */
  private isGzipBuffer(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  }

  /**
   * Clear cache for a specific project
   */
  clearProjectCache(projectId: string): void {
    try {
      const gzPath = this.getCacheFilePath(projectId, true);
      const jsonPath = this.getCacheFilePath(projectId, false);

      if (fs.existsSync(gzPath)) {
        fs.unlinkSync(gzPath);
      }
      if (fs.existsSync(jsonPath)) {
        fs.unlinkSync(jsonPath);
      }
    } catch (error) {
      console.error(`Failed to clear cache for project ${projectId}:`, error);
    }
  }

  /**
   * Clear all snapshots cache
   */
  clearAllCache(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to clear all snapshot cache:', error);
    }
  }
}

// Export singleton instance
export const snapshotCache = new SnapshotCacheService();
