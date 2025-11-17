import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  TextField,
  Alert,
} from '@mui/material';
import {
  Download,
  Pause,
  Play,
  Check,
  AlertCircle,
  Trash2,
  Folder,
  File,
  Plus,
} from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';

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

interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  status?: 'received' | 'receiving' | 'pending';
}

interface InvitedProjectsPageProps {
  onSelectProject?: (projectId: string) => void;
}

const InvitedProjectsPage: React.FC<InvitedProjectsPageProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<InvitedProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<InvitedProject | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState(false);

  useEffect(() => {
    fetchInvitedProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchProjectFiles(selectedProject.id);
      onSelectProject?.(selectedProject.id);
    }
  }, [selectedProject]);

  const fetchInvitedProjects = async () => {
    setLoading(true);
    try {
      // Use /list/invited endpoint to get projects where user is invited
      const response = await cloudAPI.get('/projects/list/invited');
      const projectList = response.data.projects || [];
      setProjects(projectList);
      if (projectList.length > 0) {
        setSelectedProject(projectList[0]);
      }
    } catch (error) {
      console.error('Failed to fetch invited projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectFiles = async (projectId: string) => {
    setFilesLoading(true);
    try {
      const response = await cloudAPI.get(`/projects/${projectId}/files`);
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleJoinProject = async () => {
    if (!inviteToken.trim()) {
      setJoinError('Please enter an invite token');
      return;
    }

    setJoinLoading(true);
    setJoinError('');
    setJoinSuccess(false);

    try {
      // Call API to join project with invite token
      await cloudAPI.post('/projects/join', {
        invite_code: inviteToken.trim(),
      });
      
      setJoinSuccess(true);
      setInviteToken('');
      
      // Refresh projects list
      setTimeout(() => {
        fetchInvitedProjects();
        setJoinDialogOpen(false);
        setJoinSuccess(false);
      }, 1500);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to join project. Please check the token and try again.';
      setJoinError(errorMessage);
      console.error('Failed to join project:', error);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleCloseJoinDialog = () => {
    setJoinDialogOpen(false);
    setInviteToken('');
    setJoinError('');
    setJoinSuccess(false);
  };

  const handlePauseSync = () => {
    setPauseConfirmOpen(true);
  };

  const handleConfirmPause = async () => {
    if (!selectedProject) return;
    try {
      await cloudAPI.post(`/projects/${selectedProject.id}/pause-sync`, {});
      setPauseConfirmOpen(false);
      await fetchInvitedProjects();
    } catch (error) {
      console.error('Failed to pause sync:', error);
    }
  };

  const handleResumeSync = async () => {
    if (!selectedProject) return;
    try {
      await cloudAPI.post(`/projects/${selectedProject.id}/resume-sync`, {});
      await fetchInvitedProjects();
    } catch (error) {
      console.error('Failed to resume sync:', error);
    }
  };

  const handleDeleteProject = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedProject) return;
    try {
      // Remove from Syncthing first (non-blocking)
      try {
        await (window as any).api.syncthingRemoveProjectFolder(selectedProject.id);
      } catch (syncError) {
        console.warn('Failed to remove from Syncthing:', syncError);
        // Continue anyway - Syncthing cleanup failure shouldn't block project deletion
      }

      await cloudAPI.delete(`/projects/${selectedProject.id}`);
      setDeleteConfirmOpen(false);
      await fetchInvitedProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
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

  return (
    <Box sx={{ display: 'flex', height: '100%', bgcolor: 'background.default' }}>
      {/* Left Panel - Invited Projects List */}
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
              onClick={() => setJoinDialogOpen(true)}
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
                  selected={selectedProject?.id === project.id}
                  onClick={() => setSelectedProject(project)}
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

      {/* Right Panel - Project Details & Files */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedProject ? (
          <>
            {/* Project Header */}
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
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{selectedProject.name}</Typography>
                  {selectedProject.description && (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{selectedProject.description}</Typography>
                  )}
                  {selectedProject.owner_name && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                      Shared by <strong>{selectedProject.owner_name}</strong>
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={1}>
                  {selectedProject.sync_status === 'syncing' || selectedProject.sync_status === 'paused' ? (
                    <>
                      {selectedProject.sync_status === 'syncing' ? (
                        <Button
                          disableRipple
                          size="small"
                          variant="outlined"
                          startIcon={<Pause size={16} />}
                          onClick={handlePauseSync}
                        >
                          Pause
                        </Button>
                      ) : (
                        <Button
                          disableRipple
                          size="small"
                          variant="outlined"
                          startIcon={<Play size={16} />}
                          onClick={handleResumeSync}
                        >
                          Resume
                        </Button>
                      )}
                    </>
                  ) : null}
                  <Button
                    disableRipple
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<Trash2 size={16} />}
                    onClick={handleDeleteProject}
                  >
                    Remove
                  </Button>
                </Stack>
              </Stack>

              {/* Sync Status */}
              <Stack spacing={1.5}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>Sync Status</Typography>
                    {selectedProject.sync_status === 'synced' && (
                      <Chip
                        icon={getSyncIcon(selectedProject.sync_status)}
                        label={selectedProject.sync_status}
                        size="small"
                        color="success"
                      />
                    )}
                    {selectedProject.sync_status === 'syncing' && (
                      <Chip
                        icon={getSyncIcon(selectedProject.sync_status)}
                        label={selectedProject.sync_status}
                        size="small"
                        color="warning"
                      />
                    )}
                    {selectedProject.sync_status === 'paused' && (
                      <Chip
                        icon={getSyncIcon(selectedProject.sync_status)}
                        label={selectedProject.sync_status}
                        size="small"
                      />
                    )}
                    {selectedProject.sync_status === 'error' && (
                      <Chip
                        icon={getSyncIcon(selectedProject.sync_status)}
                        label={selectedProject.sync_status}
                        size="small"
                        color="error"
                      />
                    )}
                    {!selectedProject.sync_status && (
                      <Chip label="Unknown" size="small" />
                    )}
                  </Stack>
                  {selectedProject.sync_status === 'syncing' && selectedProject.sync_progress !== undefined && (
                    <>
                      <LinearProgress
                        variant="determinate"
                        value={selectedProject.sync_progress}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        {selectedProject.sync_progress}% complete
                      </Typography>
                    </>
                  )}
                </Box>

                {/* Project Info */}
                <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
                  <Chip
                    label={`${selectedProject.file_count || 0} files`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${((selectedProject.total_size || 0) / 1024 / 1024).toFixed(2)} MB`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </Stack>
            </Paper>

            {/* Files Section */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Receiving Files</Typography>
              
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
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{file.name}</Typography>
                            {file.status === 'received' && <Check size={16} style={{ color: '#4CAF50' }} />}
                          </Stack>
                          {file.size && (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {(file.size / 1024 / 1024).toFixed(2)} MB • {file.status || 'pending'}
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

      {/* Pause Sync Confirmation */}
      <Dialog open={pauseConfirmOpen} onClose={() => setPauseConfirmOpen(false)}>
        <DialogTitle>Pause Sync?</DialogTitle>
        <DialogContent>
          <Typography>Pausing will stop receiving files. You can resume later.</Typography>
        </DialogContent>
        <DialogActions>
          <Button disableRipple onClick={() => setPauseConfirmOpen(false)}>Cancel</Button>
          <Button disableRipple variant="contained" onClick={handleConfirmPause}>Pause</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Remove Project?</DialogTitle>
        <DialogContent>
          <Typography>This will remove the project and stop receiving files. This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button disableRipple onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button disableRipple variant="contained" color="error" onClick={handleConfirmDelete}>Remove</Button>
        </DialogActions>
      </Dialog>

      {/* Join Project Dialog */}
      <Dialog open={joinDialogOpen} onClose={handleCloseJoinDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Join Project with Invite Code</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 2 }}>
            {joinSuccess && (
              <Alert severity="success">
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  ✓ Project joined successfully!
                </Typography>
              </Alert>
            )}
            
            {joinError && (
              <Alert severity="error">
                <Typography variant="body2">
                  {joinError}
                </Typography>
              </Alert>
            )}
            
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Enter the invite code shared with you:
              </Typography>
              <TextField
                fullWidth
                placeholder="Paste invite code here"
                value={inviteToken}
                onChange={(e) => {
                  setInviteToken(e.target.value);
                  setJoinError('');
                }}
                disabled={joinLoading || joinSuccess}
                multiline
                rows={3}
                variant="outlined"
              />
            </Box>

            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              💡 You can get an invite code from the person who shared a project with you. They can find it in the "Your Projects" page under the project details.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button 
            disableRipple 
            onClick={handleCloseJoinDialog}
            disabled={joinLoading}
          >
            Cancel
          </Button>
          <Button
            disableRipple
            variant="contained"
            onClick={handleJoinProject}
            disabled={joinLoading || !inviteToken.trim()}
          >
            {joinLoading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
            {joinLoading ? 'Joining...' : 'Join Project'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvitedProjectsPage;
