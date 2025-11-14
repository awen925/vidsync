import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import {
  Plus,
  MoreVertical,
  Share2,
  Trash2,
  Folder,
  File,
  Copy,
  Check,
} from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';

interface Project {
  id: string;
  name: string;
  description?: string;
  local_path?: string;
  created_at?: string;
  device_count?: number;
}

interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified_at?: string;
}

interface YourProjectsPageProps {
  onSelectProject?: (projectId: string) => void;
}

const YourProjectsPage: React.FC<YourProjectsPageProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedMenuProject, setSelectedMenuProject] = useState<Project | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchProjectFiles(selectedProject.id);
      onSelectProject?.(selectedProject.id);
    }
  }, [selectedProject]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await cloudAPI.get('/projects');
      const projectList = response.data.projects || [];
      setProjects(projectList);
      if (projectList.length > 0) {
        setSelectedProject(projectList[0]);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectFiles = async (projectId: string) => {
    setFilesLoading(true);
    try {
      // Call the /files endpoint which scans the local_path
      const response = await cloudAPI.get(`/projects/${projectId}/files`);
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      await cloudAPI.post('/projects', {
        name: newProjectName,
        description: newProjectDesc,
      });
      setCreateDialogOpen(false);
      setNewProjectName('');
      setNewProjectDesc('');
      await fetchProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, project: Project) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedMenuProject(project);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedMenuProject(null);
  };

  const handleGenerateInvite = async () => {
    if (!selectedProject) return;
    try {
      const response = await cloudAPI.post(`/projects/${selectedProject.id}/invite-token`, {});
      setInviteCode(response.data.token);
      setShareDialogOpen(true);
    } catch (error) {
      console.error('Failed to generate invite:', error);
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDeleteProject = async () => {
    if (!selectedMenuProject) return;
    try {
      await cloudAPI.delete(`/projects/${selectedMenuProject.id}`);
      handleMenuClose();
      await fetchProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', bgcolor: 'background.default' }}>
      {/* Left Panel - Project List */}
      <Paper
        sx={{
          width: 300,
          flexShrink: 0,
          borderRadius: 0,
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
            <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Your Projects</Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
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
                    edge="end"
                    size="small"
                    onClick={(e) => handleMenuOpen(e, project)}
                  >
                    <MoreVertical size={16} />
                  </IconButton>
                }
              >
                <ListItemButton
                  selected={selectedProject?.id === project.id}
                  onClick={() => setSelectedProject(project)}
                  sx={{
                    '&.Mui-selected': {
                      bgcolor: 'action.selected',
                      '& .MuiListItemText-root': {
                        color: 'primary.main',
                      },
                    },
                  }}
                >
                  <ListItemText
                    primary={<Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }}>{project.name}</Typography>}
                    secondary={
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {project.description}
                      </Typography>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Right Panel - Project Details & Files */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedProject ? (
          <>
            {/* Project Header */}
            <Paper
              sx={{
                p: 2,
                borderRadius: 0,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{selectedProject.name}</Typography>
                  {selectedProject.description && (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{selectedProject.description}</Typography>
                  )}
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<Share2 size={16} />}
                  onClick={handleGenerateInvite}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Share
                </Button>
              </Stack>

              {/* Project Info */}
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
                {selectedProject.local_path && (
                  <Chip
                    icon={<Folder size={14} />}
                    label={selectedProject.local_path}
                    size="small"
                    variant="outlined"
                  />
                )}
                <Chip
                  label={`${selectedProject.device_count || 0} devices`}
                  size="small"
                  variant="outlined"
                />
              </Stack>
            </Paper>

            {/* Files Section */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Files</Typography>
              
              {filesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : files.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>No files yet</Typography>
              ) : (
                <List sx={{ p: 0 }}>
                  {files.map((file) => (
                    <ListItem key={file.id} disablePadding sx={{ mb: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', p: 1 }}>
                        {file.type === 'folder' ? <Folder size={18} /> : <File size={18} />}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{file.name}</Typography>
                          {file.size && (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <Typography sx={{ color: 'text.secondary' }}>Select a project to view details</Typography>
          </Box>
        )}
      </Box>

      {/* Create Project Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Project Name"
              placeholder="Enter project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
            />
            <TextField
              fullWidth
              label="Description"
              placeholder="Optional description"
              value={newProjectDesc}
              onChange={(e) => setNewProjectDesc(e.target.value)}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateProject}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Share/Invite Dialog */}
      <Dialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Share Project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Share this invite code with others to let them access this project:
            </Typography>
            <Paper sx={{ p: 2, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
                {inviteCode}
              </Typography>
              <IconButton
                size="small"
                onClick={handleCopyInvite}
                title={copiedCode ? 'Copied!' : 'Copy'}
              >
                {copiedCode ? <Check size={18} /> : <Copy size={18} />}
              </IconButton>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Project Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleDeleteProject}>
          <Trash2 size={16} style={{ marginRight: 8 }} />
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default YourProjectsPage;
