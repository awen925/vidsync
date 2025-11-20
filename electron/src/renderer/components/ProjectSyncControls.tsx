import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
  Chip,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Pause,
  Play,
  RotateCcw,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { cloudAPI } from '../hooks/useCloudApi';
import { useSyncWebSocket } from '../hooks/useSyncWebSocket';

interface ProjectSyncControlsProps {
  projectId: string;
  projectName: string;
  syncthingFolderId?: string;
  onStatusChange?: (status: any) => void;
}

/**
 * TASK 2 & TASK 3 Combined:
 * - Pause/Resume buttons
 * - Real-time progress display (uses WebSocket)
 * - Transfer speed and ETA
 */
export const ProjectSyncControls: React.FC<ProjectSyncControlsProps> = ({
  projectId,
  projectName,
  syncthingFolderId,
  onStatusChange,
}) => {
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);

  // Get real-time sync progress from WebSocket
  const { progress, formatSpeed, connected } = useSyncWebSocket();
  const currentProgress = syncthingFolderId
    ? progress.get(syncthingFolderId)
    : null;

  // Fetch sync status on mount
  useEffect(() => {
    fetchSyncStatus();
  }, [projectId]);

  const fetchSyncStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await cloudAPI.get(
        `/projects/${projectId}/sync-status`
      );
      setSyncStatus(response.data);
      setPaused(response.data.paused);
      onStatusChange?.(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
      setError('Failed to load sync status');
    } finally {
      setStatusLoading(false);
    }
  };

  const handlePause = async () => {
    setShowPauseConfirm(true);
  };

  const handleConfirmPause = async () => {
    setShowPauseConfirm(false);
    setLoading(true);
    try {
      // Notify backend to update state
      await cloudAPI.post(`/projects/${projectId}/pause-sync`, {});
      
      // Then pause folder via Syncthing (local IPC)
      const result = await (window as any).api.projectPauseSync({ projectId });
      if (!result.ok) {
        setError(`Failed to pause Syncthing folder: ${result.error}`);
        setLoading(false);
        return;
      }

      setPaused(true);
      setError(null);
      await fetchSyncStatus();
    } catch (err) {
      console.error('Failed to pause sync:', err);
      setError('Failed to pause sync');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    try {
      // Notify backend to update state
      await cloudAPI.post(`/projects/${projectId}/resume-sync`, {});
      
      // Then resume folder via Syncthing (local IPC)
      const result = await (window as any).api.projectResumeSync({ projectId });
      if (!result.ok) {
        setError(`Failed to resume Syncthing folder: ${result.error}`);
        setLoading(false);
        return;
      }

      setPaused(false);
      setError(null);
      await fetchSyncStatus();
    } catch (err) {
      console.error('Failed to resume sync:', err);
      setError('Failed to resume sync');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchSyncStatus();
  };

  if (statusLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Error Alert */}
      {error && (
        <Paper
          sx={{
            p: 2,
            mb: 2,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
          }}
        >
          <AlertCircle size={20} className="text-red-500" />
          <Box flex={1}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Error
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {error}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Status Bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          {/* Header with controls */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Sync Status
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {projectName}
              </Typography>
            </Box>

            {/* Status indicators */}
            <Stack direction="row" spacing={1} alignItems="center">
              {/* Connection status */}
              <Tooltip title={connected ? 'Connected to sync' : 'Not connected'}>
                <Chip
                  label={connected ? 'Live' : 'Offline'}
                  color={connected ? 'success' : 'default'}
                  variant="outlined"
                  size="small"
                  icon={
                    connected ? (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: 'currentColor',
                          animation: 'pulse 2s infinite',
                          '@keyframes pulse': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.5 },
                          },
                        }}
                      />
                    ) : undefined
                  }
                />
              </Tooltip>

              {/* Pause/Resume buttons */}
              <Box>
                {paused ? (
                  <Tooltip title="Resume syncing">
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<Play size={16} />}
                      onClick={handleResume}
                      disabled={loading}
                      sx={{ textTransform: 'none' }}
                    >
                      Resume
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip title="Pause syncing">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Pause size={16} />}
                      onClick={handlePause}
                      disabled={loading}
                      sx={{ textTransform: 'none' }}
                    >
                      Pause
                    </Button>
                  </Tooltip>
                )}
              </Box>

              {/* Refresh button */}
              <Tooltip title="Refresh status">
                <IconButton
                  size="small"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  <RotateCcw size={16} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Status info */}
          <Stack direction="row" spacing={2} sx={{ fontSize: '0.875rem' }}>
            <Box>
              <Typography variant="caption" color="textSecondary">
                State
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {paused ? (
                  <Chip label="⏸️ PAUSED" size="small" color="warning" />
                ) : syncStatus?.state === 'syncing' ? (
                  <Chip label="⬇️ SYNCING" size="small" color="info" />
                ) : syncStatus?.state === 'scanning' ? (
                  <Chip label="📁 SCANNING" size="small" color="info" />
                ) : (
                  <Chip label="✓ IDLE" size="small" color="success" />
                )}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="textSecondary">
                Items
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {syncStatus?.inSyncItems || 0} / {syncStatus?.needItems ? syncStatus.inSyncItems + syncStatus.needItems : 0}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="textSecondary">
                Completion
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {Math.round((syncStatus?.completion || 0) * 100)}%
              </Typography>
            </Box>
          </Stack>

          {/* Progress bar (from Syncthing completion) */}
          {!paused && (
            <LinearProgress
              variant="determinate"
              value={Math.round((syncStatus?.completion || 0) * 100)}
              sx={{ height: 6, borderRadius: 3 }}
            />
          )}

          {/* Real-time progress from WebSocket */}
          {currentProgress && !paused && (
            <Stack spacing={1}>
              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 1 }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Live Transfer Progress
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 500, color: 'primary.main' }}
                  >
                    {currentProgress.percentage}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={currentProgress.percentage}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: 'rgba(25, 118, 210, 0.12)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      background: 'linear-gradient(90deg, #1976d2, #42a5f5)',
                    },
                  }}
                />
              </Box>

              {/* Speed and ETA */}
              <Stack direction="row" spacing={3}>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Speed
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: 'primary.main' }}
                  >
                    {formatSpeed(currentProgress.bytesPerSec)}
                  </Typography>
                </Box>

                {currentProgress.eta && (
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      ETA
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: 'primary.main' }}
                    >
                      {currentProgress.eta}
                    </Typography>
                  </Box>
                )}

                {currentProgress.filesRemaining && (
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      Files Remaining
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: 'primary.main' }}
                    >
                      {currentProgress.filesRemaining}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Pause confirmation dialog */}
      <Dialog open={showPauseConfirm} onClose={() => setShowPauseConfirm(false)}>
        <DialogTitle>Pause Sync?</DialogTitle>
        <DialogContent>
          <Typography>
            Pausing will stop receiving new files from this project. You can resume syncing at any time.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPauseConfirm(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmPause}
            disabled={loading}
          >
            Pause
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
