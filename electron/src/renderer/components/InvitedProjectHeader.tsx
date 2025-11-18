import React from 'react';
import {
  Paper,
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  Pause,
  Play,
  Trash2,
  Check,
  Download,
  AlertCircle,
} from 'lucide-react';

interface InvitedProject {
  id: string;
  name: string;
  description?: string;
  owner_name?: string;
  sync_status?: 'synced' | 'syncing' | 'paused' | 'error';
  sync_progress?: number;
  file_count?: number;
  total_size?: number;
}

interface InvitedProjectHeaderProps {
  project: InvitedProject;
  onPauseSync: () => void;
  onResumeSync: () => void;
  onDelete: () => void;
}

export const InvitedProjectHeader: React.FC<InvitedProjectHeaderProps> = ({
  project,
  onPauseSync,
  onResumeSync,
  onDelete,
}) => {
  const getSyncIcon = (status?: string) => {
    switch (status) {
      case 'synced': return <Check size={16} style={{ color: '#4CAF50' }} />;
      case 'syncing': return <Download size={16} style={{ color: '#FF9800' }} />;
      case 'paused': return <Pause size={16} style={{ color: '#9E9E9E' }} />;
      case 'error': return <AlertCircle size={16} style={{ color: '#F44336' }} />;
      default: return undefined;
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Title and Description */}
      <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{project.name}</Typography>
          {project.description && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{project.description}</Typography>
          )}
          {project.owner_name && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              Shared by <strong>{project.owner_name}</strong>
            </Typography>
          )}
        </Box>

        {/* Control Buttons */}
        <Stack direction="row" spacing={1}>
          {project.sync_status === 'syncing' && (
            <Button
              disableRipple
              size="small"
              variant="outlined"
              startIcon={<Pause size={16} />}
              onClick={onPauseSync}
            >
              Pause
            </Button>
          )}
          {project.sync_status === 'paused' && (
            <Button
              disableRipple
              size="small"
              variant="outlined"
              startIcon={<Play size={16} />}
              onClick={onResumeSync}
            >
              Resume
            </Button>
          )}
          <Button
            disableRipple
            size="small"
            variant="outlined"
            color="error"
            startIcon={<Trash2 size={16} />}
            onClick={onDelete}
          >
            Remove
          </Button>
        </Stack>
      </Stack>

      {/* Sync Status Section */}
      <Stack spacing={1.5}>
        {/* Status Chip */}
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Sync Status</Typography>
            {project.sync_status === 'synced' && (
              <Chip
                icon={getSyncIcon(project.sync_status)}
                label={project.sync_status}
                size="small"
                color="success"
              />
            )}
            {project.sync_status === 'syncing' && (
              <Chip
                icon={getSyncIcon(project.sync_status)}
                label={project.sync_status}
                size="small"
                color="warning"
              />
            )}
            {project.sync_status === 'paused' && (
              <Chip
                icon={getSyncIcon(project.sync_status)}
                label={project.sync_status}
                size="small"
              />
            )}
            {project.sync_status === 'error' && (
              <Chip
                icon={getSyncIcon(project.sync_status)}
                label={project.sync_status}
                size="small"
                color="error"
              />
            )}
            {!project.sync_status && (
              <Chip label="Unknown" size="small" />
            )}
          </Stack>

          {/* Progress Bar */}
          {project.sync_status === 'syncing' && project.sync_progress !== undefined && (
            <>
              <LinearProgress
                variant="determinate"
                value={project.sync_progress}
                sx={{ height: 6, borderRadius: 3 }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                {project.sync_progress}% complete
              </Typography>
            </>
          )}
        </Box>

        {/* Project Stats */}
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
          <Chip
            label={`${project.file_count || 0} files`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${((project.total_size || 0) / 1024 / 1024).toFixed(2)} MB`}
            size="small"
            variant="outlined"
          />
        </Stack>
      </Stack>
    </Paper>
  );
};

export default InvitedProjectHeader;
