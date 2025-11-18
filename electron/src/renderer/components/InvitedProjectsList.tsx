import React from 'react';
import {
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  Box,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  Check,
  Download,
  Pause,
  AlertCircle,
  Plus,
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

interface InvitedProjectsListProps {
  projects: InvitedProject[];
  selectedProjectId?: string | null;
  onSelectProject: (project: InvitedProject) => void;
  onJoinClick: () => void;
  loading?: boolean;
}

export const InvitedProjectsList: React.FC<InvitedProjectsListProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  onJoinClick,
  loading = false,
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
        width: 300,
        flexShrink: 0,
        borderRadius: 1,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Incoming Projects</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Files from others</Typography>
          </Box>
          <Button
            disableRipple
            size="small"
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={onJoinClick}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: 'rgba(255, 255, 255, 0.2)',
              color: 'text.primary',
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.3)',
              }
            }}
          >
            Join
          </Button>
        </Stack>
      </Box>

      {/* Projects List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <CircularProgress />
        </Box>
      ) : projects.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">No incoming projects</Typography>
          <Typography variant="caption">Invitations will appear here</Typography>
        </Box>
      ) : (
        <List sx={{ overflow: 'auto', flex: 1, p: 0 }}>
          {projects.map((project) => (
            <ListItem
              key={project.id}
              disablePadding
            >
              <ListItemButton
                disableRipple
                selected={selectedProjectId === project.id}
                onClick={() => onSelectProject(project)}
                sx={{
                  '&.Mui-selected': {
                    bgcolor: 'rgba(128, 128, 128, 0.3)',
                    '& .MuiListItemText-root': {
                      color: 'primary.main',
                    },
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', mr: 1 }}>
                  {getSyncIcon(project.sync_status)}
                  <ListItemText
                    primary={<Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }}>{project.name}</Typography>}
                    secondary={
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        From {project.owner_name || 'Unknown'}
                      </Typography>
                    }
                  />
                </Box>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
};

export default InvitedProjectsList;
