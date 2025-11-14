import * as fs from 'fs';
import * as path from 'path';

export interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  children?: FileItem[];
}

export interface DirectoryEntry extends FileItem {
  fullPath: string;
}

export interface ScanOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  includeDotFiles?: boolean;
}

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_INCLUDE_HIDDEN = false;
const DEFAULT_INCLUDE_DOT_FILES = false;

/**
 * List directory contents (immediate children only, no recursion).
 * This is the preferred method for navigating directories.
 */
export async function listDirectory(
  dirPath: string,
  includeHidden: boolean = false
): Promise<DirectoryEntry[]> {
  try {
    // Verify path exists and is a directory
    const stats = await fs.promises.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    // Read directory entries
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    // Map to DirectoryEntry objects
    const items: DirectoryEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files if requested
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      try {
        const fullPath = path.join(dirPath, entry.name);
        const entryStats = await fs.promises.stat(fullPath);

        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'folder' : 'file',
          size: entry.isDirectory() ? undefined : entryStats.size,
          modified: entryStats.mtime.toISOString(),
          fullPath,
        });
      } catch (err) {
        // Skip files that can't be accessed
        console.warn(`Failed to access ${entry.name}:`, err);
        continue;
      }
    }

    return items;
  } catch (err) {
    console.error(`Failed to list directory ${dirPath}:`, err);
    throw err;
  }
}

/**
 * Recursively scan a directory and return its file tree structure.
 * Uses Node.js fs module for direct OS access.
 */
export async function scanDirectoryTree(
  dirPath: string,
  options: ScanOptions = {}
): Promise<FileItem[]> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const includeHidden = options.includeHidden ?? DEFAULT_INCLUDE_HIDDEN;
  const includeDotFiles = options.includeDotFiles ?? DEFAULT_INCLUDE_DOT_FILES;

  const scan = async (currentPath: string, depth: number): Promise<FileItem[]> => {
    // Stop recursion at max depth
    if (depth > maxDepth) {
      return [];
    }

    try {
      // Check if path exists
      if (!fs.existsSync(currentPath)) {
        return [];
      }

      // Read directory entries
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

      // Map entries to FileItem objects
      const items: FileItem[] = [];

      for (const entry of entries) {
        // Skip hidden files/folders if requested
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        // Skip dot files (.*) if requested
        if (!includeDotFiles && entry.name.match(/^\..+/)) {
          continue;
        }

        try {
          const fullPath = path.join(currentPath, entry.name);
          const stats = await fs.promises.stat(fullPath);

          if (entry.isDirectory()) {
            // For folders, recursively scan children
            const children = await scan(fullPath, depth + 1);
            items.push({
              name: entry.name,
              type: 'folder',
              size: 0,
              modified: stats.mtime.toISOString(),
              children,
            });
          } else if (entry.isFile()) {
            // For files, just get metadata
            items.push({
              name: entry.name,
              type: 'file',
              size: stats.size,
              modified: stats.mtime.toISOString(),
            });
          }
        } catch (err) {
          // Skip files that can't be accessed
          console.warn(`Failed to access ${entry.name}:`, err);
          continue;
        }
      }

      return items;
    } catch (err) {
      console.error(`Failed to read directory ${currentPath}:`, err);
      return [];
    }
  };

  return scan(dirPath, 0);
}

/**
 * Scan directory with depth limit but without scanning children.
 * Useful for showing a flat list of immediate children.
 */
export async function scanDirectoryFlat(dirPath: string): Promise<FileItem[]> {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const items: FileItem[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      try {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.promises.stat(fullPath);

        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'folder' : 'file',
          size: entry.isDirectory() ? 0 : stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch (err) {
        console.warn(`Failed to access ${entry.name}:`, err);
        continue;
      }
    }

    return items;
  } catch (err) {
    console.error(`Failed to read directory ${dirPath}:`, err);
    return [];
  }
}

/**
 * Get metadata for a specific directory (size, file count, etc.)
 */
export async function getDirectoryStats(dirPath: string): Promise<{
  size: number;
  fileCount: number;
  folderCount: number;
  modified: string;
} | null> {
  try {
    if (!fs.existsSync(dirPath)) {
      return null;
    }

    const stats = await fs.promises.stat(dirPath);
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    let size = 0;
    let fileCount = 0;
    let folderCount = 0;

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      try {
        const fullPath = path.join(dirPath, entry.name);
        const st = await fs.promises.stat(fullPath);

        if (entry.isDirectory()) {
          folderCount++;
        } else {
          fileCount++;
          size += st.size;
        }
      } catch (err) {
        // Skip inaccessible entries
      }
    }

    return {
      size,
      fileCount,
      folderCount,
      modified: stats.mtime.toISOString(),
    };
  } catch (err) {
    console.error(`Failed to get stats for ${dirPath}:`, err);
    return null;
  }
}
