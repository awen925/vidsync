import { supabase } from '../lib/supabaseClient';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface FileMetadata {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  hash?: string;
  modifiedAt?: string;
  children?: FileMetadata[];
}

export interface SnapshotMetadata {
  projectId: string;
  projectName: string;
  totalFiles: number;
  totalSize: number;
  createdAt: string;
  files: FileMetadata[];
}

export class FileMetadataService {
  /**
   * Save file metadata snapshot to Supabase Storage as compressed JSON
   * Stores: projects/{projectId}/snapshot_{timestamp}.json.gz
   */
  static async saveSnapshot(
    projectId: string,
    projectName: string,
    files: FileMetadata[]
  ): Promise<{
    snapshotUrl: string;
    snapshotSize: number;
    createdAt: string;
  }> {
    try {
      // Calculate total stats
      const totalFiles = this.countFiles(files);
      const totalSize = this.calculateTotalSize(files);

      const snapshot: SnapshotMetadata = {
        projectId,
        projectName,
        totalFiles,
        totalSize,
        createdAt: new Date().toISOString(),
        files,
      };

      // Convert to JSON and compress
      const jsonString = JSON.stringify(snapshot, null, 2);
      const compressedBuffer = await gzip(jsonString);

      // Generate filename
      const timestamp = Date.now();
      const filename = `snapshot_${timestamp}.json.gz`;
      const bucket = 'project-snapshots';
      const filePath = `${projectId}/${filename}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(filePath, compressedBuffer, {
          contentType: 'application/gzip',
          upsert: false,
        });

      if (uploadErr) {
        console.error(`Failed to upload snapshot for project ${projectId}:`, uploadErr);
        throw uploadErr;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const snapshotUrl = publicUrlData.publicUrl;

      // Update project table with snapshot metadata
      const { error: updateErr } = await supabase
        .from('projects')
        .update({
          snapshot_url: snapshotUrl,
          snapshot_updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      if (updateErr) {
        console.warn(`Failed to update snapshot metadata for project ${projectId}:`, updateErr);
      }

      return {
        snapshotUrl,
        snapshotSize: compressedBuffer.length,
        createdAt: snapshot.createdAt,
      };
    } catch (error) {
      console.error(`Error saving snapshot for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Load file metadata snapshot from Supabase Storage
   */
  static async loadSnapshot(snapshotUrl: string): Promise<SnapshotMetadata> {
    try {
      // Extract project ID and filename from URL
      const urlParts = snapshotUrl.split('/');
      const filename = urlParts[urlParts.length - 1];
      const projectId = urlParts[urlParts.length - 2];

      // Download from storage
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from('project-snapshots')
        .download(`${projectId}/${filename}`);

      if (downloadErr) {
        console.error(`Failed to download snapshot for project ${projectId}:`, downloadErr);
        throw downloadErr;
      }

      // Decompress
      const buffer = await (fileData as Blob).arrayBuffer();
      const decompressedBuffer = await gunzip(Buffer.from(buffer));
      const jsonString = decompressedBuffer.toString('utf-8');
      const snapshot: SnapshotMetadata = JSON.parse(jsonString);

      return snapshot;
    } catch (error) {
      console.error(`Error loading snapshot from ${snapshotUrl}:`, error);
      throw error;
    }
  }

  /**
   * Get file list for invited member with pagination
   * Returns paginated files from the snapshot
   */
  static async getFilesForInvitedMember(
    projectId: string,
    page: number = 0,
    pageSize: number = 500
  ): Promise<{
    files: FileMetadata[];
    totalCount: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    try {
      // Get project snapshot URL
      const { data: project, error: projectErr } = await supabase
        .from('projects')
        .select('snapshot_url, snapshot_updated_at')
        .eq('id', projectId)
        .single();

      if (projectErr || !project?.snapshot_url) {
        return {
          files: [],
          totalCount: 0,
          page,
          pageSize,
          hasMore: false,
        };
      }

      // Load snapshot
      const snapshot = await this.loadSnapshot(project.snapshot_url);

      // Flatten the file tree for pagination
      const flatFiles = this.flattenFileTree(snapshot.files);

      // Paginate
      const start = page * pageSize;
      const end = start + pageSize;
      const paginatedFiles = flatFiles.slice(start, end);

      return {
        files: paginatedFiles,
        totalCount: flatFiles.length,
        page,
        pageSize,
        hasMore: end < flatFiles.length,
      };
    } catch (error) {
      console.error(`Error getting files for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old snapshots, keeping only the latest
   */
  static async cleanupOldSnapshots(projectId: string): Promise<void> {
    try {
      const { data: files, error: listErr } = await supabase.storage
        .from('project-snapshots')
        .list(projectId);

      if (listErr) {
        console.warn(`Failed to list snapshots for project ${projectId}:`, listErr);
        return;
      }

      if (!files || files.length <= 1) {
        return; // Keep at least one snapshot
      }

      // Sort by creation time (newest first)
      const sortedFiles = files
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Delete all but the latest
      const toDelete = sortedFiles.slice(1).map((f) => `${projectId}/${f.name}`);

      if (toDelete.length > 0) {
        const { error: deleteErr } = await supabase.storage
          .from('project-snapshots')
          .remove(toDelete);

        if (deleteErr) {
          console.warn(`Failed to delete old snapshots for project ${projectId}:`, deleteErr);
        } else {
          console.log(`Cleaned up ${toDelete.length} old snapshots for project ${projectId}`);
        }
      }
    } catch (error) {
      console.error(`Error cleaning up snapshots for project ${projectId}:`, error);
    }
  }

  /**
   * Count total files in tree
   */
  private static countFiles(files: FileMetadata[]): number {
    let count = 0;
    for (const file of files) {
      if (file.type === 'file') {
        count++;
      }
      if (file.children) {
        count += this.countFiles(file.children);
      }
    }
    return count;
  }

  /**
   * Calculate total size of all files
   */
  private static calculateTotalSize(files: FileMetadata[]): number {
    let size = 0;
    for (const file of files) {
      if (file.type === 'file' && file.size) {
        size += file.size;
      }
      if (file.children) {
        size += this.calculateTotalSize(file.children);
      }
    }
    return size;
  }

  /**
   * Flatten nested file tree into flat array for display
   */
  private static flattenFileTree(
    files: FileMetadata[],
    prefix: string = ''
  ): FileMetadata[] {
    const flat: FileMetadata[] = [];

    for (const file of files) {
      const fullPath = prefix ? `${prefix}/${file.name}` : file.name;
      flat.push({
        ...file,
        path: fullPath,
      });

      if (file.children && file.children.length > 0) {
        flat.push(...this.flattenFileTree(file.children, fullPath));
      }
    }

    return flat;
  }
}
