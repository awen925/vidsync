import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Button,
  Chip,
  LinearProgress,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Pause,
  Play,
  Trash2,
  Check,
  Download,
  AlertCircle,
  RefreshCw,
  Users,
  HardDrive,
} from 'lucide-react';
import { cloudAPI } from '../hooks/useCloudApi';
import { useSyncWebSocket } from '../hooks/useSyncWebSocket';
import FileTreeBrowser from './FileTreeBrowser';

interface InvitedProject {
  id: string;
  name: string;
  description?: string;
  owner_name?: string;
  sync_status?: 'synced' | 'syncing' | 'paused' | 'error';
  sync_progress?: number;
  file_count?: number;
  total_size?: number;
  snapshot_url?: string;
}

interface InvitedProjectDetailViewProps {
  project: InvitedProject;
  onProjectUpdated?: () => void;
}

export const InvitedProjectDetailView: React.FC<InvitedProjectDetailViewProps> = ({
  project,
  onProjectUpdated,
}) => {
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(false);
  const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const { progress, getProgress, formatSpeed, connected } = useSyncWebSocket();

  // Fetch sync status
  useEffect(() => {
    const fetchSyncStatus = async () => {
      setSyncStatusLoading(true);
      try {
        const response = await cloudAPI.get(`/projects/${project.id}/sync-status`);
        setSyncStatus(response.data);
      } catch (error) {
        console.error('Failed to fetch sync status:', error);
      } finally {
        setSyncStatusLoading(false);
      }
    };

    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [project.id]);

  // Fetch invited users
  const fetchInvitedUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await cloudAPI.get(`/projects/${project.id}/invited-users`);
      setInvitedUsers(response.data.users || []);
    } catch (error) {
      console.error('Failed to fetch invited users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handlePauseSync = async () => {
    try {
      // Notify backend
      await cloudAPI.post(`/projects/${project.id}/pause-sync`, {});
      
      // Then pause folder via Syncthing IPC
      const result = await (window as any).api.projectPauseSync({ projectId: project.id });
      if (!result.ok) {
        console.error('Failed to pause Syncthing folder:', result.error);
      }
      
      setPauseConfirmOpen(false);
      // Refresh sync status
      const response = await cloudAPI.get(`/projects/${project.id}/sync-status`);
      setSyncStatus(response.data);
      onProjectUpdated?.();
    } catch (error) {
      console.error('Failed to pause sync:', error);
    }
  };

  const handleResumeSync = async () => {
    try {
      // Notify backend
      await cloudAPI.post(`/projects/${project.id}/resume-sync`, {});
      
      // Then resume folder via Syncthing IPC
      const result = await (window as any).api.projectResumeSync({ projectId: project.id });
      if (!result.ok) {
        console.error('Failed to resume Syncthing folder:', result.error);
      }
      
      // Refresh sync status
      const response = await cloudAPI.get(`/projects/${project.id}/sync-status`);
      setSyncStatus(response.data);
      onProjectUpdated?.();
    } catch (error) {
      console.error('Failed to resume sync:', error);
    }
  };

  const getSyncIcon = (status?: string) => {
    switch (status) {
      case 'synced': return <Check size={16} style={{ color: '#4CAF50' }} />;
      case 'syncing': return <Download size={16} style={{ color: '#FF9800' }} />;
      case 'paused': return <Pause size={16} style={{ color: '#9E9E9E' }} />;
      case 'error': return <AlertCircle size={16} style={{ color: '#F44336' }} />;
      default: return undefined;
    }
  };

  const currentProgress = getProgress(project.id);
  const isSyncing = project.sync_status === 'syncing';
  const isPaused = project.sync_status === 'paused';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header Section */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 0,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        {/* Title and Owner Info */}
        <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              {project.name}
            </Typography>
            {project.description && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                {project.description}
              </Typography>
            )}
            {project.owner_name && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Shared by <strong>{project.owner_name}</strong>
              </Typography>
            )}
          </Box>

          {/* Control Buttons */}
          <Stack direction="row" spacing={1} sx={{ ml: 2 }}>
            {isSyncing && (
              <Button
                disableRipple
                size="small"
                variant="contained"
                color="warning"
                startIcon={<Pause size={16} />}
                onClick={() => setPauseConfirmOpen(true)}
              >
                Pause
              </Button>
            )}
            {isPaused && (
              <Button
                disableRipple
                size="small"
                variant="contained"
                color="success"
                startIcon={<Play size={16} />}
                onClick={handleResumeSync}
              >
                Resume
              </Button>
            )}
            {!isSyncing && !isPaused && (
              <Button
                disableRipple
                size="small"
                variant="outlined"
                startIcon={<Check size={16} />}
                disabled
              >
                Synced
              </Button>
            )}
            <Tooltip title="Show invited users">
              <IconButton
                size="small"
                onClick={() => {
                  setShowUsers(true);
                  fetchInvitedUsers();
                }}
              >
                <Users size={18} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Sync Status Bar */}
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Sync Status
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {syncStatusLoading ? (
                <CircularProgress size={16} />
              ) : (
                <>
                  <Chip
                    icon={getSyncIcon(project.sync_status)}
                    label={project.sync_status || 'Unknown'}
                    size="small"
                    color={
                      project.sync_status === 'synced'
                        ? 'success'
                        : project.sync_status === 'syncing'
                        ? 'warning'
                        : project.sync_status === 'error'
                        ? 'error'
                        : 'default'
                    }
                  />
                  {connected && (
                    <Chip
                      label="Live"
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </>
              )}
            </Stack>
          </Stack>

          {/* Progress Bar & Real-Time Stats */}
          {isSyncing && currentProgress && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={currentProgress.percentage || 0}
                sx={{ height: 6, borderRadius: 3, mb: 1 }}
              />
              <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ flexWrap: 'wrap' }}>
                <Stack direction="row" spacing={3}>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      Progress
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {(currentProgress.percentage || 0).toFixed(1)}%
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      Speed
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatSpeed(currentProgress.bytesPerSec || 0)}
                    </Typography>
                  </Box>
                  {currentProgress.eta && (
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        ETA
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {currentProgress.eta}
                      </Typography>
                    </Box>
                  )}
                  {currentProgress.filesRemaining && (
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        Files
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {currentProgress.filesRemaining}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Stack>
            </Box>
          )}

          {/* Project Stats */}
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <Chip
              icon={<Download size={14} />}
              label={`${project.file_count || 0} files`}
              size="small"
              variant="outlined"
            />
            <Chip
              icon={<HardDrive size={14} />}
              label={`${((project.total_size || 0) / 1024 / 1024).toFixed(2)} MB`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
      </Paper>

      {/* File Tree Browser Section */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {project.snapshot_url ? (
          <FileTreeBrowser projectId={project.id} snapshotUrl={project.snapshot_url} />
        ) : (
          <Alert severity="info">No files in this project yet</Alert>
        )}
      </Box>

      {/* Pause Confirmation Dialog */}
      <Dialog open={pauseConfirmOpen} onClose={() => setPauseConfirmOpen(false)}>
        <DialogTitle>⏸ Pause Sync?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mt: 1 }}>
            Pausing will stop receiving files for this project. You can resume later to continue syncing.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disableRipple onClick={() => setPauseConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            disableRipple
            variant="contained"
            color="warning"
            onClick={handlePauseSync}
          >
            Pause Sync
          </Button>
        </DialogActions>
      </Dialog>

      {/* Invited Users Dialog */}
      <Dialog open={showUsers} onClose={() => setShowUsers(false)} maxWidth="sm" fullWidth>
        <DialogTitle>👥 Invited Users ({invitedUsers.length})</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            {usersLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress />
              </Box>
            ) : invitedUsers.length > 0 ? (
              invitedUsers.map((user) => (
                <Paper key={user.id} sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {user.email}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Chip
                        size="small"
                        label={user.status || 'pending'}
                        color={user.status === 'accepted' ? 'success' : 'default'}
                      />
                      <Chip
                        size="small"
                        label="Read-only"
                        variant="outlined"
                      />
                    </Stack>
                    {user.synced_at && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Last synced: {new Date(user.synced_at).toLocaleString()}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              ))
            ) : (
              <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                No users invited to this project yet
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disableRipple onClick={() => setShowUsers(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvitedProjectDetailView;
