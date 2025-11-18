import React from 'react';
import {
  Chip,
  Box,
  Typography,
  LinearProgress,
  Tooltip,
  Stack,
  Paper,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SyncIcon from '@mui/icons-material/Sync';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import ErrorIcon from '@mui/icons-material/Error';

/**
 * Sync status types matching backend response
 */
export type SyncState = 'synced' | 'syncing' | 'pending' | 'paused' | 'error';

/**
 * Backend sync status response structure
 */
export interface SyncStatus {
  folderState: string;
  state: SyncState;
  completion: number; // 0-100 %
  bytesDownloaded: number;
  totalBytes: number;
  needsBytes: number;
  filesDownloaded: number;
  totalFiles: number;
  lastUpdate: string; // ISO timestamp
  pullErrors: number;
}

interface FileSyncStatusProps {
  syncStatus: SyncStatus | null;
  mode?: 'compact' | 'full'; // compact for table cells, full for detail views
  loading?: boolean;
  error?: string | null;
}

/**
 * FileSyncStatus Component
 * Displays file sync status with 5 different states:
 * - Synced (green, checkmark)
 * - Syncing (yellow, spinner with %)
 * - Pending (gray, clock)
 * - Paused (gray, pause)
 * - Error (red, warning)
 */
export const FileSyncStatus: React.FC<FileSyncStatusProps> = ({
  syncStatus,
  mode = 'compact',
  loading = false,
  error = null,
}) => {
  // Define color scheme for each state
  const getStateColor = (state: SyncState): string => {
    switch (state) {
      case 'synced':
        return '#4caf50'; // Green
      case 'syncing':
        return '#ff9800'; // Orange/Yellow
      case 'pending':
        return '#bdbdbd'; // Gray
      case 'paused':
        return '#bdbdbd'; // Gray
      case 'error':
        return '#f44336'; // Red
      default:
        return '#9e9e9e'; // Default gray
    }
  };

  // Define icon for each state
  const getStateIcon = (state: SyncState): React.ReactElement | null => {
    const iconProps = { style: { marginRight: 4 } };
    switch (state) {
      case 'synced':
        return <CheckCircleIcon {...iconProps} />;
      case 'syncing':
        return <SyncIcon {...iconProps} style={{ animation: 'spin 1s linear infinite' }} />;
      case 'pending':
        return <ScheduleIcon {...iconProps} />;
      case 'paused':
        return <PauseCircleIcon {...iconProps} />;
      case 'error':
        return <ErrorIcon {...iconProps} />;
      default:
        return null;
    }
  };

  // Define label for each state
  const getStateLabel = (state: SyncState): string => {
    switch (state) {
      case 'synced':
        return 'Synced';
      case 'syncing':
        return 'Syncing';
      case 'pending':
        return 'Pending';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  // Handle error state
  if (error) {
    return (
      <Tooltip title={`Error: ${error}`}>
        <Chip
          icon={<ErrorIcon />}
          label="Error"
          color="error"
          variant="outlined"
          size={mode === 'compact' ? 'small' : 'medium'}
        />
      </Tooltip>
    );
  }

  // Handle loading state
  if (loading || !syncStatus) {
    return (
      <Chip
        label="Loading..."
        variant="outlined"
        size={mode === 'compact' ? 'small' : 'medium'}
      />
    );
  }

  const state = syncStatus.state;
  const color = getStateColor(state);
  const icon = getStateIcon(state);
  const label = getStateLabel(state);

  // Compact mode: Just show a chip
  if (mode === 'compact') {
    const chipLabel =
      state === 'syncing'
        ? `${label} (${syncStatus.completion}%)`
        : label;

    const iconElement = getStateIcon(state);

    return (
      <Tooltip title={`Last updated: ${new Date(syncStatus.lastUpdate).toLocaleTimeString()}`}>
        {iconElement ? (
          <Chip
            icon={iconElement}
            label={chipLabel}
            style={{ backgroundColor: color, color: 'white' }}
            size="small"
          />
        ) : (
          <Chip
            label={chipLabel}
            style={{ backgroundColor: color, color: 'white' }}
            size="small"
          />
        )}
      </Tooltip>
    );
  }

  // Full mode: Detailed view with progress bar and stats
  return (
    <Paper style={{ padding: 16, marginTop: 16 }}>
      <Stack spacing={2}>
        {/* Header with state and completion */}
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            {icon}
            <Typography variant="h6">
              {state === 'syncing'
                ? `${label} - ${syncStatus.completion}%`
                : label}
            </Typography>
          </Stack>
          <Typography variant="caption" color="textSecondary">
            Updated: {new Date(syncStatus.lastUpdate).toLocaleTimeString()}
          </Typography>
        </Box>

        {/* Progress bar (only show when syncing) */}
        {state === 'syncing' && (
          <Box>
            <LinearProgress
              variant="determinate"
              value={syncStatus.completion}
              style={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        )}

        {/* Stats grid */}
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))"
          gap={2}
        >
          <Box>
            <Typography variant="caption" color="textSecondary">
              Downloaded
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {syncStatus.filesDownloaded} / {syncStatus.totalFiles}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="textSecondary">
              Size
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {formatBytes(syncStatus.bytesDownloaded)} /{' '}
              {formatBytes(syncStatus.totalBytes)}
            </Typography>
          </Box>
          {syncStatus.needsBytes > 0 && (
            <Box>
              <Typography variant="caption" color="textSecondary">
                Remaining
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                {formatBytes(syncStatus.needsBytes)}
              </Typography>
            </Box>
          )}
          {syncStatus.pullErrors > 0 && (
            <Box>
              <Typography variant="caption" color="error">
                Errors
              </Typography>
              <Typography variant="body2" fontWeight="bold" color="error">
                {syncStatus.pullErrors}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Additional info */}
        <Typography variant="caption" color="textSecondary">
          Folder State: <strong>{syncStatus.folderState}</strong>
        </Typography>
      </Stack>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </Paper>
  );
};
