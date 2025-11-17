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
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Alert,
} from '@mui/material';
import {
  Plus,
  MoreVertical,
  Trash2,
  Folder,
  File,
  Copy,
  Check,
  ArrowLeft,
  Users,
  Link as LinkIcon,
  AlertCircle,
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
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  fullPath?: string; // Added for IPC-loaded files
  children?: FileItem[];
}

interface YourProjectsPageProps {
  onSelectProject?: (projectId: string) => void;
}

const YourProjectsPage: React.FC<YourProjectsPageProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<FileItem[]>([]);
  const [pathBreadcrumbs, setPathBreadcrumbs] = useState<string[]>([]);
  const [navigationHistory, setNavigationHistory] = useState<FileItem[][]>([]);
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');
  const [editProjectLocalPath, setEditProjectLocalPath] = useState('');
  const [editPathWarning, setEditPathWarning] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectLocalPath, setNewProjectLocalPath] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedMenuProject, setSelectedMenuProject] = useState<Project | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [shareEmail, setShareEmail] = useState('');
  const [shareEmailError, setShareEmailError] = useState('');

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
      // Check if this is a local project by looking for local_path
      const project = projects.find(p => p.id === projectId);
      
      if (project?.local_path) {
        // Local project - use IPC for direct OS file access
        const result = await (window as any).api.fsListDirectory(project.local_path, false);
        if (result.success && result.entries) {
          setFiles(result.entries);
          setCurrentPath(result.entries);
          setPathBreadcrumbs(['']);
          setNavigationHistory([result.entries]);
        } else {
          console.error('Failed to list directory:', result.error);
          setFiles([]);
          setCurrentPath([]);
          setPathBreadcrumbs(['']);
          setNavigationHistory([]);
        }
      } else {
        // Remote/invited project - use API
        const response = await cloudAPI.get(`/projects/${projectId}/files`);
        const filesData = response.data.files || [];
        setFiles(filesData);
        setCurrentPath(filesData);
        setPathBreadcrumbs(['']);
        setNavigationHistory([filesData]);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setFiles([]);
      setCurrentPath([]);
      setPathBreadcrumbs(['']);
      setNavigationHistory([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleOpenFolder = async (folder: FileItem & { fullPath?: string }) => {
    if (folder.type === 'folder') {
      // For local projects with fullPath, use IPC to load the folder
      const project = selectedProject;
      if (project?.local_path && folder.fullPath) {
        try {
          setFilesLoading(true);
          const result = await (window as any).api.fsListDirectory(folder.fullPath, false);
          if (result.success && result.entries) {
            setCurrentPath(result.entries);
            setPathBreadcrumbs([...pathBreadcrumbs, folder.name]);
            setNavigationHistory([...navigationHistory, result.entries]);
          }
        } catch (error) {
          console.error('Failed to open folder:', error);
        } finally {
          setFilesLoading(false);
        }
      } else if (folder.children) {
        // For remote projects or no fullPath, use cached children
        setCurrentPath(folder.children);
        setPathBreadcrumbs([...pathBreadcrumbs, folder.name]);
        setNavigationHistory([...navigationHistory, folder.children]);
      }
    }
  };

  const handleGoBack = () => {
    if (navigationHistory.length > 1) {
      const newHistory = navigationHistory.slice(0, -1);
      const previousPath = newHistory[newHistory.length - 1];
      setNavigationHistory(newHistory);
      setCurrentPath(previousPath);
      setPathBreadcrumbs(pathBreadcrumbs.slice(0, -1));
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const response = await cloudAPI.post('/projects', {
        name: newProjectName,
        description: newProjectDesc,
        local_path: newProjectLocalPath || null,
      });

      // If project has a local_path, initialize Syncthing for it
      if (response.data.project && newProjectLocalPath) {
        try {
          await (window as any).api.syncthingStartForProject(response.data.project.id, newProjectLocalPath);
        } catch (syncError) {
          console.error('Failed to start Syncthing for project:', syncError);
          // Continue anyway - Syncthing setup failure shouldn't block project creation
        }
      }

      setCreateDialogOpen(false);
      setNewProjectName('');
      setNewProjectDesc('');
      setNewProjectLocalPath('');
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
      setInviteDialogOpen(true);
    } catch (error) {
      console.error('Failed to generate invite:', error);
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleBrowseLocalPath = async () => {
    try {
      const path = await (window as any).api.openDirectory();
      if (path) {
        setNewProjectLocalPath(path);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedMenuProject) return;
    try {
      // Remove from Syncthing first (non-blocking)
      try {
        await (window as any).api.syncthingRemoveProjectFolder(selectedMenuProject.id);
      } catch (syncError) {
        console.warn('Failed to remove from Syncthing:', syncError);
        // Continue anyway - Syncthing cleanup failure shouldn't block project deletion
      }

      // Delete from backend
      await cloudAPI.delete(`/projects/${selectedMenuProject.id}`);
      handleMenuClose();
      await fetchProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleOpenEditDialog = (project: Project) => {
    setEditingProject(project);
    setEditProjectName(project.name);
    setEditProjectDesc(project.description || '');
    setEditProjectLocalPath(project.local_path || '');
    setEditPathWarning(false);
    setEditDialogOpen(true);
    handleMenuClose();
  };

  const handleEditProjectLocalPath = async () => {
    try {
      const path = await (window as any).api.openDirectory();
      if (path) {
        setEditProjectLocalPath(path);
        // Show warning if changing local path
        if (path !== editingProject?.local_path) {
          setEditPathWarning(true);
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleSaveEditProject = async () => {
    if (!editingProject) return;
    await performEditProjectSave();
  };

  const performEditProjectSave = async () => {
    if (!editingProject) return;
    try {
      await cloudAPI.put(`/projects/${editingProject.id}`, {
        name: editProjectName,
        description: editProjectDesc,
        local_path: null,  // Local path is disabled in edit dialog
      });

      setEditDialogOpen(false);
      setEditingProject(null);
      setEditPathWarning(false);
      await fetchProjects();
    } catch (error) {
      console.error('Failed to update project:', error);
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

      {/* Right Panel - Project Details & File Browser */}
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
              <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{selectedProject.name}</Typography>
                  {selectedProject.description && (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{selectedProject.description}</Typography>
                  )}
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuOpen(e, selectedProject)}
                >
                  <MoreVertical size={18} />
                </IconButton>
              </Stack>

              {/* Tabs for Files and Shared With */}
              <Tabs value={tabValue} onChange={(e, val) => setTabValue(val)} sx={{ mb: 1 }}>
                <Tab label="Files" value={0} />
                <Tab label="Shared With" value={1} />
              </Tabs>
            </Paper>

            {/* Tab Content */}
            {tabValue === 0 ? (
              // FILES TAB
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {filesLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  <>
                    {/* Breadcrumb Navigation */}
                    {pathBreadcrumbs.length > 1 && (
                      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                          size="small"
                          startIcon={<ArrowLeft size={16} />}
                          onClick={handleGoBack}
                          sx={{ textTransform: 'none' }}
                        >
                          Back
                        </Button>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {pathBreadcrumbs.slice(1).join(' / ')}
                        </Typography>
                      </Box>
                    )}

                    {/* File Table */}
                    {currentPath.length === 0 ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                        <Typography sx={{ color: 'text.secondary' }}>No files in this folder</Typography>
                      </Box>
                    ) : (
                      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, width: 120 }}>Size</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, width: 150 }}>Modified</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {currentPath.map((file, index) => (
                              <TableRow
                                key={`${file.name}-${index}`}
                                hover
                                onClick={() => file.type === 'folder' && handleOpenFolder(file)}
                                sx={{ cursor: file.type === 'folder' ? 'pointer' : 'default' }}
                              >
                                <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  {file.type === 'folder' ? (
                                    <>
                                      <Folder size={16} style={{ color: '#0A66C2' }} />
                                      <Typography sx={{ fontWeight: 500 }}>{file.name}</Typography>
                                    </>
                                  ) : (
                                    <>
                                      <File size={16} style={{ color: '#666' }} />
                                      <Typography>{file.name}</Typography>
                                    </>
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  {file.type === 'file' ? formatFileSize(file.size) : '-'}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                  {file.modified ? new Date(file.modified).toLocaleDateString() : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </>
                )}
              </Box>
            ) : (
              // SHARED WITH TAB
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', p: 2 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">Share this project with others using an invite code.</Typography>
                </Alert>

                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Generate Invite Code</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                      Create a shareable link to invite others to this project.
                    </Typography>
                    <Button
                      variant="contained"
                      startIcon={<LinkIcon size={16} />}
                      onClick={handleGenerateInvite}
                      fullWidth
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Generate Invite Code
                    </Button>
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Share by Email (Coming Soon)</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                      Or invite specific people by email address.
                    </Typography>
                    <Stack spacing={1}>
                      <TextField
                        size="small"
                        placeholder="user@example.com"
                        value={shareEmail}
                        onChange={(e) => {
                          setShareEmail(e.target.value);
                          setShareEmailError('');
                        }}
                        error={!!shareEmailError}
                        helperText={shareEmailError}
                        fullWidth
                        disabled
                      />
                      <Button
                        variant="outlined"
                        startIcon={<Users size={16} />}
                        disabled
                        fullWidth
                        sx={{ textTransform: 'none' }}
                      >
                        Send Invite
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            )}
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
            <Stack spacing={1}>
              <TextField
                fullWidth
                label="Local Path (Optional)"
                placeholder="Path to sync folder (e.g., /home/user/Videos)"
                value={newProjectLocalPath}
                onChange={(e) => setNewProjectLocalPath(e.target.value)}
                helperText="If set, files will load instantly from your local folder"
              />
              <Button
                variant="outlined"
                size="small"
                onClick={handleBrowseLocalPath}
                sx={{ alignSelf: 'flex-start' }}
              >
                Browse Folder
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateProject}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Project Name"
              placeholder="Enter project name"
              value={editProjectName}
              onChange={(e) => setEditProjectName(e.target.value)}
            />
            <TextField
              fullWidth
              label="Description"
              placeholder="Optional description"
              value={editProjectDesc}
              onChange={(e) => setEditProjectDesc(e.target.value)}
              multiline
              rows={2}
            />
            <Stack spacing={1}>
              <TextField
                fullWidth
                label="Local Path (Optional)"
                placeholder="Path to sync folder (e.g., /home/user/Videos)"
                value={editProjectLocalPath}
                onChange={(e) => setEditProjectLocalPath(e.target.value)}
                helperText="If set, files will load instantly from your local folder"
                disabled
              />
              <Button
                variant="outlined"
                size="small"
                onClick={handleEditProjectLocalPath}
                sx={{ alignSelf: 'flex-start' }}
                disabled
              >
                Browse Folder
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEditProject}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      {/* Path Change Warning Dialog */}
      <Dialog open={editPathWarning} onClose={() => setEditPathWarning(false)} maxWidth="sm">
        <DialogTitle sx={{ color: '#d32f2f', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={24} />
          Large Local Path Change
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <Alert severity="warning">
              <Typography variant="body2">
                You've made a significant change to the local folder path. This may trigger a full re-synchronization,
                which could be a large payload depending on the folder size.
              </Typography>
            </Alert>
            <Typography variant="body2" sx={{ color: '#666' }}>
              If this is a new folder with many files, consider:
            </Typography>
            <Typography component="ul" variant="body2" sx={{ color: '#666', pl: 2 }}>
              <li>Creating a new project instead of modifying this one</li>
              <li>Waiting for the sync to complete before accessing files</li>
              <li>Checking your disk space and bandwidth</li>
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditPathWarning(false)}>Cancel Edit</Button>
          <Button 
            variant="contained" 
            color="warning"
            onClick={performEditProjectSave}
          >
            Proceed Anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generate Invite Code Dialog */}
      <Dialog open={inviteDialogOpen} onClose={() => setInviteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinkIcon size={20} />
          Share Project - Invite Code
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            <Alert severity="success">
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                ✓ Invite code generated successfully
              </Typography>
            </Alert>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Share this code with others:
              </Typography>
              <Paper
                sx={{
                  p: 1.5,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  borderRadius: 1,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    flex: 1,
                    wordBreak: 'break-all',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                  }}
                >
                  {inviteCode}
                </Typography>
                <IconButton
                  size="small"
                  onClick={handleCopyInvite}
                  title={copiedCode ? 'Copied!' : 'Copy'}
                  sx={{ flexShrink: 0 }}
                >
                  {copiedCode ? (
                    <Check size={18} style={{ color: '#4CAF50' }} />
                  ) : (
                    <Copy size={18} />
                  )}
                </IconButton>
              </Paper>
            </Box>

            <Box sx={{ bgcolor: 'info.lighter', p: 1.5, borderRadius: 1 }}>
              <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 500 }}>
                💡 How to use this code:
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'info.main' }}>
                1. Share this code with the person you want to invite<br />
                2. They paste it in the "Invited Projects" → "Join Project" section<br />
                3. They'll gain access to view and sync this project
              </Typography>
            </Box>

            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              The code remains valid until you revoke it. Anyone with this code can join the project.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialogOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* Project Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedMenuProject && handleOpenEditDialog(selectedMenuProject)}>
          <Typography variant="body2">Edit Project</Typography>
        </MenuItem>
        <MenuItem onClick={handleDeleteProject}>
          <Trash2 size={16} style={{ marginRight: 8 }} />
          Delete Project
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default YourProjectsPage;
