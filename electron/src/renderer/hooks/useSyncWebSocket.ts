import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    api?: {
      syncStatus: () => Promise<{ connected: boolean; url: string }>;
      onSyncTransferProgress: (cb: (event: any) => void) => void;
      onSyncComplete: (cb: (event: any) => void) => void;
      onSyncError: (cb: (event: any) => void) => void;
      onSyncEvent: (cb: (event: any) => void) => void;
      onSyncConnected: (cb: () => void) => void;
      onSyncDisconnected: (cb: () => void) => void;
    };
  }
}

/**
 * Hook to listen for WebSocket sync events
 * Usage: const progress = useSyncWebSocket();
 */
export interface SyncProgress {
  projectId?: string;
  folderId?: string;
  percentage: number;
  bytesPerSec: number;
  eta?: string;
  filesRemaining?: number;
  currentBytes?: number;
  totalBytes?: number;
}

export interface SyncState {
  connected: boolean;
  progress: Map<string, SyncProgress>;
  error: string | null;
}

export const useSyncWebSocket = () => {
  const [state, setState] = useState<SyncState>({
    connected: false,
    progress: new Map(),
    error: null,
  });

  // Subscribe to WebSocket events from main process
  useEffect(() => {
    const handleTransferProgress = (data: any) => {
      setState(prev => {
        const newProgress = new Map(prev.progress);
        const folderId = data.data.folderId || 'unknown';
        newProgress.set(folderId, {
          folderId,
          projectId: data.projectId,
          percentage: data.data.percentage,
          bytesPerSec: data.data.bytesPerSec,
          eta: data.data.eta,
          filesRemaining: data.data.filesRemaining,
          currentBytes: data.data.currentBytes,
          totalBytes: data.data.totalBytes,
        });
        return { ...prev, progress: newProgress, error: null };
      });
    };

    const handleSyncComplete = (data: any) => {
      setState(prev => {
        const newProgress = new Map(prev.progress);
        const folderId = data.data.folderId || 'unknown';
        // Remove completed folder from progress
        newProgress.delete(folderId);
        return { ...prev, progress: newProgress };
      });
    };

    const handleSyncError = (data: any) => {
      setState(prev => ({
        ...prev,
        error: `[${data.data.folderId}] ${data.data.message}`,
      }));
    };

    const handleConnected = () => {
      setState(prev => ({ ...prev, connected: true }));
    };

    const handleDisconnected = () => {
      setState(prev => ({ ...prev, connected: false }));
    };

    // Listen for events from main process
    if (window.api) {
      window.api.onSyncTransferProgress(handleTransferProgress);
      window.api.onSyncComplete(handleSyncComplete);
      window.api.onSyncError(handleSyncError);
      window.api.onSyncConnected(handleConnected);
      window.api.onSyncDisconnected(handleDisconnected);
    }
  }, []);

  // Get progress for specific folder
  const getProgress = useCallback((folderId: string): SyncProgress | undefined => {
    return state.progress.get(folderId);
  }, [state.progress]);

  // Get all active transfers
  const getActiveTransfers = useCallback((): SyncProgress[] => {
    return Array.from(state.progress.values());
  }, [state.progress]);

  // Format speed for display
  const formatSpeed = useCallback((bytesPerSec: number): string => {
    if (bytesPerSec > 1024 * 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
    }
    if (bytesPerSec > 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
    }
    if (bytesPerSec > 1024) {
      return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
    }
    return `${bytesPerSec.toFixed(0)} B/s`;
  }, []);

  return {
    ...state,
    getProgress,
    getActiveTransfers,
    formatSpeed,
  };
};

/**
 * Hook to get WebSocket connection status
 */
export const useSyncWebSocketStatus = () => {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Check initial status
    if (window.api?.syncStatus) {
      window.api.syncStatus().then((result: any) => {
        if (!result.error) {
          setConnected(result.connected);
        }
      });

      // Listen for connection changes
      window.api.onSyncConnected(() => setConnected(true));
      window.api.onSyncDisconnected(() => setConnected(false));
    }
  }, []);

  return connected;
};
