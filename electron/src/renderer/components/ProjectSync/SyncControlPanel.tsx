import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Alert,
  LinearProgress,
  Chip,
  CircularProgress,
} from '@mui/material';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';

interface SyncDevice {
  id: string;
  name: string;
  addresses?: string[];
}

interface SyncStatus {
  state: 'idle' | 'syncing' | 'paused' | 'stopped';
  globalBytes: number;
  localBytes: number;
  needsBytes: number;
  lastSync?: string;
  error?: string;
}

interface SyncControlPanelProps {
  projectId: string;
  projectName: string;
  onSyncStatusChange?: (status: SyncStatus) => void;
}

export const SyncControlPanel: React.FC<SyncControlPanelProps> = ({
  projectId,
  projectName,
  onSyncStatusChange,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'stopped',
    globalBytes: 0,
    localBytes: 0,
    needsBytes: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // Load devices when API key is provided
  useEffect(() => {
    if (apiKey) {
      loadDevices();
    }
  }, [apiKey]);

  // Poll sync status periodically
  useEffect(() => {
    if (syncStatus.state === 'syncing') {
      const interval = setInterval(() => {
        fetchSyncStatus();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [syncStatus.state]);

  const loadDevices = async () => {
    setLoadingDevices(true);
    setError(null);
    try {
      // For now, we'll show a placeholder message
      // In a real app, you'd fetch devices from backend
      setDevices([
        {
          id: 'DEVICE-1',
          name: 'My Laptop',
          addresses: ['192.168.1.100'],
        },
        {
          id: 'DEVICE-2',
          name: 'Desktop PC',
          addresses: ['192.168.1.101'],
        },
        {
          id: 'DEVICE-3',
          name: 'Mobile Phone',
          addresses: ['192.168.1.102'],
        },
      ]);
      setSuccess('Devices loaded. Select one to sync.');
    } catch (err) {
      setError(
        `Failed to load devices: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setLoadingDevices(false);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      // In a real implementation, fetch from backend
      // For now, simulate status
      setSyncStatus((prev) => ({
        ...prev,
        globalBytes: Math.min(prev.globalBytes + 1000, 100000),
      }));
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  };

  const handleStartSync = async () => {
    if (!selectedDeviceId) {
      setError('Please select a device');
      return;
    }

    if (!apiKey) {
      setError('Please provide Syncthing API key');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await cloudAPI.post(
        `/projects/${projectId}/sync-start`,
        {
          deviceId: selectedDeviceId,
          syncthingApiKey: apiKey,
        }
      );

      setSyncStatus({
        state: 'syncing',
        globalBytes: 0,
        localBytes: 0,
        needsBytes: 0,
        lastSync: new Date().toISOString(),
      });

      setSuccess(`Sync started to device: ${selectedDeviceId}`);
      onSyncStatusChange?.(syncStatus);
    } catch (err) {
      setError(
        `Failed to start sync: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setSyncStatus({ ...syncStatus, state: 'stopped', error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handlePauseSync = async () => {
    if (!apiKey) {
      setError('Please provide Syncthing API key');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await cloudAPI.post(`/projects/${projectId}/pause-sync`, {
        syncthingApiKey: apiKey,
      });

      setSyncStatus((prev) => ({ ...prev, state: 'paused' }));
      setSuccess('Sync paused');
      onSyncStatusChange?.(syncStatus);
    } catch (err) {
      setError(
        `Failed to pause sync: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResumeSync = async () => {
    if (!apiKey) {
      setError('Please provide Syncthing API key');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await cloudAPI.post(`/projects/${projectId}/resume-sync`, {
        syncthingApiKey: apiKey,
      });

      setSyncStatus((prev) => ({ ...prev, state: 'syncing' }));
      setSuccess('Sync resumed');
      onSyncStatusChange?.(syncStatus);
    } catch (err) {
      setError(
        `Failed to resume sync: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStopSync = async () => {
    if (!selectedDeviceId) {
      setError('No device selected');
      return;
    }

    if (!apiKey) {
      setError('Please provide Syncthing API key');
      return;
    }

    if (!window.confirm(`Stop syncing "${projectName}" to this device?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await cloudAPI.post(`/projects/${projectId}/sync-stop`, {
        deviceId: selectedDeviceId,
        syncthingApiKey: apiKey,
      });

      setSyncStatus({
        state: 'stopped',
        globalBytes: 0,
        localBytes: 0,
        needsBytes: 0,
      });

      setSuccess(`Sync stopped for device: ${selectedDeviceId}`);
      onSyncStatusChange?.(syncStatus);
    } catch (err) {
      setError(
        `Failed to stop sync: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (syncStatus.state) {
      case 'syncing':
        return '#4CAF50'; // green
      case 'paused':
        return '#FFC107'; // amber
      case 'stopped':
        return '#F44336'; // red
      default:
        return '#9E9E9E'; // gray
    }
  };

  const getStatusLabel = () => {
    switch (syncStatus.state) {
      case 'syncing':
        return 'Syncing...';
      case 'paused':
        return 'Paused';
      case 'stopped':
        return 'Stopped';
      default:
        return 'Unknown';
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardHeader
        title="Sync Control Panel"
        action={
          <Chip
            label={getStatusLabel()}
            sx={{
              backgroundColor: getStatusColor(),
              color: 'white',
              fontWeight: 600,
            }}
          />
        }
      />
      <CardContent>
        <Stack spacing={3}>
          {/* API Key Section */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Syncthing API Key
            </Typography>
            {!apiKey ? (
              <>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                >
                  {showApiKeyInput ? 'Hide' : 'Add API Key'}
                </Button>

                {showApiKeyInput && (
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <TextField
                      type="password"
                      placeholder="Enter Syncthing API key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      fullWidth
                      size="small"
                    />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Get this from Syncthing Web UI (Settings → API)
                    </Typography>
                  </Stack>
                )}
              </>
            ) : (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  p: 1.5,
                  backgroundColor: 'success.lighter',
                  border: '1px solid',
                  borderColor: 'success.main',
                  borderRadius: 1,
                  alignItems: 'center',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                >
                  {apiKey.substring(0, 8)}...{apiKey.substring(apiKey.length - 4)}
                </Typography>
                <Button
                  size="small"
                  onClick={() => {
                    setApiKey('');
                    setDevices([]);
                  }}
                >
                  Clear
                </Button>
              </Stack>
            )}
          </Box>

          {/* Device Selector */}
          {apiKey && (
            <FormControl fullWidth>
              <InputLabel>Select Device</InputLabel>
              {loadingDevices ? (
                <CircularProgress size={24} />
              ) : (
                <Select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  label="Select Device"
                >
                  <MenuItem value="">-- Select a device --</MenuItem>
                  {devices.map((device) => (
                    <MenuItem key={device.id} value={device.id}>
                      {device.name} ({device.id})
                    </MenuItem>
                  ))}
                </Select>
              )}
            </FormControl>
          )}

          {/* Sync Status */}
          {syncStatus.state !== 'stopped' && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                Sync Status
              </Typography>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  }}
                >
                  <Box sx={{ p: 1, backgroundColor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Synced
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatBytes(syncStatus.globalBytes)}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1, backgroundColor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Local
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatBytes(syncStatus.localBytes)}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1, backgroundColor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Remaining
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatBytes(syncStatus.needsBytes)}
                    </Typography>
                  </Box>
                  {syncStatus.lastSync && (
                    <Box sx={{ p: 1, backgroundColor: 'background.default', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Last Sync
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {new Date(syncStatus.lastSync).toLocaleTimeString()}
                      </Typography>
                    </Box>
                  )}
                </Stack>

                {/* Progress Bar */}
                <LinearProgress
                  variant="determinate"
                  value={syncStatus.globalBytes > 0 ? 50 : 0}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Stack>
            </Box>
          )}

          {/* Action Buttons */}
          <Stack direction="row" spacing={1}>
            {syncStatus.state === 'stopped' ? (
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={handleStartSync}
                disabled={loading || !selectedDeviceId || !apiKey}
              >
                {loading ? <CircularProgress size={20} /> : 'Start Sync'}
              </Button>
            ) : (
              <>
                {syncStatus.state === 'syncing' ? (
                  <Button
                    variant="contained"
                    color="warning"
                    onClick={handlePauseSync}
                    disabled={loading}
                  >
                    {loading ? <CircularProgress size={20} /> : 'Pause Sync'}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleResumeSync}
                    disabled={loading}
                  >
                    {loading ? <CircularProgress size={20} /> : 'Resume Sync'}
                  </Button>
                )}
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleStopSync}
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={20} /> : 'Stop Sync'}
                </Button>
              </>
            )}
          </Stack>

          {/* Messages */}
          {error && (
            <Alert severity="error" icon={<AlertCircle size={20} />}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" icon={<CheckCircle size={20} />}>
              {success}
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};
