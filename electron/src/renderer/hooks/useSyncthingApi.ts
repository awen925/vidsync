import { useState, useCallback } from 'react';
import { cloudAPI } from './useCloudApi';

export interface SyncthingDevice {
  id: string;
  name: string;
  addresses: string[];
  compressed: boolean;
  certName: string;
  introducer: boolean;
  skipIntroductionRemovals: boolean;
  introducedBy: string;
  paused: boolean;
  allowedNetworks?: string[];
  autoAcceptFolders: boolean;
}

export interface SyncthingFolder {
  id: string;
  label: string;
  filesystemType: string;
  path: string;
  type: 'sendonly' | 'receiveonly' | 'sendreceive';
  devices: Array<{ deviceID: string; introducedBy: string }>;
  rescanIntervalS: number;
  fsWatcherEnabled: boolean;
  fsWatcherDelayS: number;
  ignorePerms: boolean;
  autoNormalize: boolean;
  minDiskFreePercent: number;
  maxConflicts: number;
  pullerMaxPendingKiB: number;
  hashAlgorithm: string;
  caseSensitiveFS: boolean;
  forceSync: boolean;
  paused: boolean;
  weakHashThresholdPercentage: number;
  markerName: string;
  copyOwnershipFromParent: boolean;
  modTimeWindowS: number;
  maxConcurrentWrites: number;
  disableSparseFiles: boolean;
  disableTempNames: boolean;
  order: string;
  sendOwnershipOnly: boolean;
  sendxattrs: boolean;
  xattrFilter: {
    entries: string[];
    maxSingleEntrySize: number;
    maxTotalSize: number;
  };
}

export const useSyncthingDevices = () => {
  const [devices, setDevices] = useState<SyncthingDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async (apiKey: string) => {
    setLoading(true);
    setError(null);
    try {
      // In a real implementation, this would call a backend endpoint
      // that fetches devices from Syncthing API
      // For now, return mock devices
      const mockDevices: SyncthingDevice[] = [
        {
          id: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH',
          name: 'My Laptop',
          addresses: ['tcp://192.168.1.100:22000'],
          compressed: false,
          certName: 'laptop',
          introducer: false,
          skipIntroductionRemovals: false,
          introducedBy: '',
          paused: false,
          autoAcceptFolders: false,
        },
        {
          id: 'IIII-JJJJ-KKKK-LLLL-MMMM-NNNN-OOOO-PPPP',
          name: 'Desktop PC',
          addresses: ['tcp://192.168.1.101:22000'],
          compressed: false,
          certName: 'desktop',
          introducer: false,
          skipIntroductionRemovals: false,
          introducedBy: '',
          paused: false,
          autoAcceptFolders: false,
        },
      ];
      setDevices(mockDevices);
      return mockDevices;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch devices';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { devices, loading, error, fetchDevices };
};

export const useSyncthingFolders = () => {
  const [folders, setFolders] = useState<SyncthingFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFolders = useCallback(async (apiKey: string) => {
    setLoading(true);
    setError(null);
    try {
      // In a real implementation, fetch from backend
      setFolders([]);
      return [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch folders';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { folders, loading, error, fetchFolders };
};

export const useSyncStatus = () => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      // In a real implementation, fetch sync status from backend
      // which gets it from Syncthing API
      const response = await cloudAPI.get(`/projects/${projectId}/sync-status`);
      setStatus(response.data);
      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch sync status';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, error, fetchStatus };
};
