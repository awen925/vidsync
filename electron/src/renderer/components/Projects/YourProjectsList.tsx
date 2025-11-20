import React from 'react';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Stack,
} from '@mui/material';
import { Plus, MoreVertical } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  local_path?: string;
  created_at?: string;
  device_count?: number;
  owner_id?: string;
  snapshot_url?: string;
  snapshot_updated_at?: string;
  snapshot_file_count?: number;
  snapshot_total_size?: number;
}

interface YourProjectsListProps {
  projects: Project[];
  selectedProjectId?: string;
  loading?: boolean;
  onSelectProject: (project: Project) => void;
  onNewClick: () => void;
  onMenuClick: (event: React.MouseEvent<HTMLElement>, project: Project) => void;
}

const YourProjectsList: React.FC<YourProjectsListProps> = ({
  projects,
  selectedProjectId,
  loading,
  onSelectProject,
  onNewClick,
  onMenuClick,
}) => {
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
        bgcolor: 'primary.main',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'rgba(255, 255, 255, 0.2)' }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1, color: 'white' }}>
            Your Projects
          </Typography>
          <Button
            disableRipple
            size="small"
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={onNewClick}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.3)',
              },
            }}
          >
            New
          </Button>
        </Stack>
      </Box>

      {/* Project List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <CircularProgress />
        </Box>
      ) : projects.length === 0 ? (
        <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="body2">No projects yet</Typography>
        </Box>
      ) : (
        <List sx={{ overflow: 'auto', flex: 1, p: 0 }}>
          {projects.map((project) => (
            <ListItem
              key={project.id}
              disablePadding
              secondaryAction={
                <IconButton
                  disableRipple
                  edge="end"
                  size="small"
                  onClick={(e) => onMenuClick(e, project)}
                >
                  <MoreVertical size={16} />
                </IconButton>
              }
            >
              <ListItemButton
                disableRipple
                selected={selectedProjectId === project.id}
                onClick={() => onSelectProject(project)}
                sx={{
                  color: 'white',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(128, 128, 128, 0.3)',
                    '& .MuiListItemText-root': {
                      color: 'white',
                    },
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: 500, fontSize: '0.95rem', color: 'white' }}>
                      {project.name}
                    </Typography>
                  }
                  secondary={
                    <Stack spacing={0.25}>
                      {project.description && (
                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                          {project.description}
                        </Typography>
                      )}
                      {project.snapshot_file_count !== undefined && (
                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                          {project.snapshot_file_count?.toLocaleString()} files • {((project.snapshot_total_size || 0) / (1024 * 1024)).toFixed(1)} MB
                        </Typography>
                      )}
                    </Stack>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
};

export default YourProjectsList;
