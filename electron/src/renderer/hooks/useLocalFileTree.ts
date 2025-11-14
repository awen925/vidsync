import { useState, useCallback } from 'react';

export interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  children?: FileItem[];
}

export interface UseLocalFileTreeOptions {
  maxDepth?: number;
  includeHidden?: boolean;
}

export interface ScanResult {
  success: boolean;
  files: FileItem[];
  path: string;
  error?: string;
}

/**
 * Hook to scan local project directories using Electron IPC.
 * This provides instant file tree scanning without API calls.
 */
export function useLocalFileTree() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanTree = useCallback(async (
    dirPath: string,
    options?: UseLocalFileTreeOptions
  ): Promise<FileItem[]> => {
    setLoading(true);
    setError(null);

    try {
      const api = (window as any).api;
      if (!api?.fsScanDirTree) {
        throw new Error('File scanner API not available');
      }

      const result = await api.fsScanDirTree(dirPath, {
        maxDepth: options?.maxDepth ?? 5,
        includeHidden: options?.includeHidden ?? false,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to scan directory');
      }

      return result.files;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      setError(errorMsg);
      console.error('Error scanning directory:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const scanFlat = useCallback(async (dirPath: string): Promise<FileItem[]> => {
    setLoading(true);
    setError(null);

    try {
      const api = (window as any).api;
      if (!api?.fsScanDirFlat) {
        throw new Error('File scanner API not available');
      }

      const result = await api.fsScanDirFlat(dirPath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to scan directory');
      }

      return result.files;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      setError(errorMsg);
      console.error('Error scanning directory:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getDirStats = useCallback(async (dirPath: string) => {
    try {
      const api = (window as any).api;
      if (!api?.fsGetDirStats) {
        throw new Error('File stats API not available');
      }

      const result = await api.fsGetDirStats(dirPath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to get directory stats');
      }

      return result.stats;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      setError(errorMsg);
      console.error('Error getting directory stats:', err);
      return null;
    }
  }, []);

  return {
    scanTree,
    scanFlat,
    getDirStats,
    loading,
    error,
  };
}
