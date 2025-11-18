import React from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  IconButton,
  Tab,
  Tabs,
} from '@mui/material';
import { MoreVertical } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  local_path?: string;
  created_at?: string;
  device_count?: number;
  owner_id?: string;
}

interface YourProjectHeaderProps {
  project: Project | null;
  tabValue: number;
  onTabChange: (event: React.SyntheticEvent, newValue: number) => void;
  onMenuClick: (event: React.MouseEvent<HTMLElement>) => void;
}

const YourProjectHeader: React.FC<YourProjectHeaderProps> = ({
  project,
  tabValue,
  onTabChange,
  onMenuClick,
}) => {
  if (!project) return null;

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
      <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            {project.name}
          </Typography>
          {project.description && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {project.description}
            </Typography>
          )}
        </Box>
        <IconButton disableRipple size="small" onClick={onMenuClick}>
          <MoreVertical size={18} />
        </IconButton>
      </Stack>

      {/* Tabs for Files and Shared With */}
      <Tabs value={tabValue} onChange={onTabChange} sx={{ mb: 1 }}>
        <Tab label="Files" value={0} />
        <Tab label="Shared With" value={1} />
      </Tabs>
    </Paper>
  );
};

export default YourProjectHeader;
