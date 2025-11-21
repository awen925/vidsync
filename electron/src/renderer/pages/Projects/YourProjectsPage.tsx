import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Menu,
  MenuItem,
  Alert,
  Typography,
  Paper,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { Trash2, LinkIcon, Copy, Check, AlertCircle } from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';
import { supabase } from '../../lib/supabaseClient';
import YourProjectsList from '../../components/Projects/YourProjectsList';
import YourProjectHeader from '../../components/Projects/YourProjectHeader';
import YourProjectFilesTab from '../../components/Projects/YourProjectFilesTab';
import YourProjectSharedTab from '../../components/Projects/YourProjectSharedTab';
import SnapshotProgressModal from '../../components/SnapshotProgressModal';


interface Project {
  id: string;
  name: string;
  description?: string;
  local_path?: string;
  created_at?: string;
  device_count?: number;
  snapshot_url?: string;
  snapshot_updated_at?: string;
  snapshot_file_count?: number;
  snapshot_total_size?: number;
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
  const [creatingProject, setCreatingProject] = useState(false);
  const [creationStatus, setCreationStatus] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
  const [duplicateErrorOpen, setDuplicateErrorOpen] = useState(false);
  const [duplicateErrorData, setDuplicateErrorData] = useState<{
    path: string;
    existingProjectName: string;
    existingProjectId: string;
  } | null>(null);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressProjectId, setProgressProjectId] = useState<string | null>(null);

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
      // Fetch ONLY owned projects from new /list/owned endpoint
      const response = await cloudAPI.get('/projects/list/owned');
      const projects = response.data.projects || [];
      
      setProjects(projects);
      if (projects.length > 0) {
        setSelectedProject(projects[0]);
      } else {
        setSelectedProject(null);
      }
    } catch (error) {
      console.error('Failed to fetch owned projects:', error);
      setProjects([]);
      setSelectedProject(null);
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

  // Poll for snapshot completion - stops polling when generation completes
  const pollForSnapshotCompletion = async (
    projectId: string,
    maxWaitSeconds: number = 300
  ): Promise<boolean> => {
    const pollStartTime = Date.now();
    const MAX_POLL_TIMEOUT = maxWaitSeconds * 1000;
    const POLL_INTERVAL = 5000; // Fixed 5-second interval as requested
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5; // Allow more errors before giving up
    let pollTimer: NodeJS.Timeout | null = null;

    return new Promise((resolve) => {
      const executePoll = async () => {
        try {
          const statusResponse = await (window as any).api.getProjectStatus(projectId);
          consecutiveErrors = 0; // Reset error counter on success

          // Check if snapshot generation is complete
          if (statusResponse) {
            // Check for completion signal from backend
            if (statusResponse.finalStatus === true) {
              console.log('✓ Snapshot generation completed', statusResponse.progress);
              if (pollTimer) clearTimeout(pollTimer);
              return resolve(true);
            }

            // Fallback: check progress state directly
            if (statusResponse.progress?.step === 'completed' || statusResponse.progress?.step === 'failed') {
              console.log('✓ Snapshot generation completed:', statusResponse.progress?.step);
              if (pollTimer) clearTimeout(pollTimer);
              return resolve(statusResponse.progress?.step === 'completed');
            }

            console.debug('Snapshot still generating...', statusResponse.progress?.step);
          }

          // Check if we've exceeded timeout
          if (Date.now() - pollStartTime >= MAX_POLL_TIMEOUT) {
            console.warn('Snapshot polling timeout reached');
            if (pollTimer) clearTimeout(pollTimer);
            return resolve(false);
          }

          // Schedule next poll in 5 seconds
          pollTimer = setTimeout(executePoll, POLL_INTERVAL);
        } catch (statusErr) {
          consecutiveErrors++;
          console.debug(`Status check failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, statusErr);

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error('Too many consecutive polling errors, stopping');
            if (pollTimer) clearTimeout(pollTimer);
            return resolve(false);
          }

          // Check timeout before retry
          if (Date.now() - pollStartTime >= MAX_POLL_TIMEOUT) {
            console.warn('Snapshot polling timeout reached');
            if (pollTimer) clearTimeout(pollTimer);
            return resolve(false);
          }

          // Retry after 5 seconds
          pollTimer = setTimeout(executePoll, POLL_INTERVAL);
        }
      };

      // Start polling
      executePoll();
    });
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    setCreationStatus('Creating project...');
    try {
      setCreationStatus('Creating project in database...');
      
      // Add a small delay for the first status to be visible
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setCreationStatus('Setting up Syncthing folder...');

      // Get access token from Supabase
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('Failed to get authentication token. Please log in again.');
      }
      const accessToken = sessionData.session.access_token;

      // Create project through Go agent (which handles cloud API + Syncthing + snapshot generation)
      const response = await (window as any).api.createProjectWithSnapshot({
        name: newProjectName,
        description: newProjectDesc || undefined,
        localPath: newProjectLocalPath || undefined,
        accessToken,
      });

      if (!response.ok) {
        throw new Error(response.error || 'Failed to create project');
      }

      const projectId = response.projectId;

      // Show progress modal for real-time snapshot generation updates
      setProgressProjectId(projectId);
      setProgressModalOpen(true);

      // Fall back to polling if progress modal fails to connect
      const snapshotReady = await pollForSnapshotCompletion(projectId, 300); // 5 minute timeout

      if (snapshotReady) {
        setCreationStatus('✓ Snapshot generated!');
      } else {
        console.warn('Snapshot generation timeout - proceeding anyway');
        setCreationStatus('Note: Snapshot still generating in background...');
      }

      setCreationStatus('✓ Project created successfully!');
      setTimeout(() => {
        setCreateDialogOpen(false);
        setCreatingProject(false);
        setCreationStatus('');
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectLocalPath('');
        fetchProjects();
      }, 1500);
    } catch (error: any) {
      console.error('Failed to create project:', error);
      setCreatingProject(false);
      setCreationStatus('');
      
      // Check if this is a duplicate path error (from Go agent)
      if (error.response?.status === 409 && error.response?.data?.code === 'DUPLICATE_PROJECT_PATH') {
        setDuplicateErrorData({
          path: newProjectLocalPath || '',
          existingProjectName: error.response.data.existingProjectName || 'Unknown',
          existingProjectId: error.response.data.existingProjectId || '',
        });
        setDuplicateErrorOpen(true);
      }
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
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedMenuProject) return;
    setDeleteConfirmLoading(true);
    try {
      // Delete from backend (backend handles Syncthing folder and snapshots cleanup)
      await cloudAPI.delete(`/projects/${selectedMenuProject.id}`);
      handleMenuClose();
      setDeleteConfirmOpen(false);
      await fetchProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeleteConfirmLoading(false);
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
      <YourProjectsList
        projects={projects}
        selectedProjectId={selectedProject?.id}
        loading={loading}
        onSelectProject={setSelectedProject}
        onNewClick={() => setCreateDialogOpen(true)}
        onMenuClick={handleMenuOpen}
      />

      {/* Right Panel - Project Details & File Browser */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedProject ? (
          <>
            {/* Project Header */}
            <YourProjectHeader
              project={selectedProject}
              tabValue={tabValue}
              onTabChange={(e, val) => setTabValue(val)}
              onMenuClick={(e) => handleMenuOpen(e, selectedProject)}
            />

            {/* Tab Content */}
            {tabValue === 0 ? (
              <YourProjectFilesTab
                currentPath={currentPath}
                pathBreadcrumbs={pathBreadcrumbs}
                loading={filesLoading}
                onOpenFolder={handleOpenFolder}
                onGoBack={handleGoBack}
                formatFileSize={formatFileSize}
              />
            ) : (
              <YourProjectSharedTab
                projectId={selectedProject?.id}
                inviteCode={inviteCode}
                copiedCode={copiedCode}
                shareEmail={shareEmail}
                shareEmailError={shareEmailError}
                onGenerateInvite={handleGenerateInvite}
                onCopyInvite={handleCopyInvite}
                onShareEmailChange={(email) => {
                  setShareEmail(email);
                  setShareEmailError('');
                }}
              />
            )}
          </>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <Typography sx={{ color: 'text.secondary' }}>Select a project to view details</Typography>
          </Box>
        )}
      </Box>

      {/* Create Project Dialog */}
      <Dialog open={createDialogOpen} onClose={() => !creatingProject && setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent>
          {creatingProject ? (
            <Stack spacing={2} sx={{ pt: 2, justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
              <CircularProgress size={40} />
              <Typography variant="body1" sx={{ textAlign: 'center' }}>
                {creationStatus}
              </Typography>
              <Typography variant="caption" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                This may take a moment while we set up your project and scan files...
              </Typography>
            </Stack>
          ) : (
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
                  disableRipple
                  variant="outlined"
                  size="small"
                  onClick={handleBrowseLocalPath}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Browse Folder
                </Button>
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disableRipple onClick={() => !creatingProject && setCreateDialogOpen(false)} disabled={creatingProject}>Cancel</Button>
          <Button disableRipple variant="contained" onClick={handleCreateProject} disabled={creatingProject}>
            {creatingProject ? 'Creating...' : 'Create'}
          </Button>
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
          <Button disableRipple onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button disableRipple variant="contained" onClick={handleSaveEditProject}>Save Changes</Button>
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
          <Button disableRipple onClick={() => setEditPathWarning(false)}>Cancel Edit</Button>
          <Button 
            disableRipple
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
                elevation={0}
                sx={{
                  p: 1.5,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
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
                  disableRipple
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
          <Button disableRipple onClick={() => setInviteDialogOpen(false)}>Done</Button>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete Project?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to delete <strong>{selectedMenuProject?.name}</strong>?
          </Typography>
          <Alert severity="warning">
            ⚠️ This will:
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>Delete the project and all its data</li>
              <li>Remove the Syncthing folder (if created)</li>
              <li>Delete all file snapshots</li>
              <li>Remove access for all invited members</li>
            </ul>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={deleteConfirmLoading}
          >
            {deleteConfirmLoading ? 'Deleting...' : 'Delete Project'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Path Error Dialog */}
      <Dialog open={duplicateErrorOpen} onClose={() => setDuplicateErrorOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={24} color="#d32f2f" />
          Duplicate Local Path
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="error">
              A project with this local path already exists
            </Alert>
            
            <Box sx={{ 
              p: 2, 
              backgroundColor: '#f5f5f5', 
              borderRadius: 1,
              border: '1px solid #e0e0e0'
            }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Local Path:
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ 
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                  mb: 2,
                  fontWeight: 500
                }}
              >
                {duplicateErrorData?.path}
              </Typography>

              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Already used by:
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: 500,
                  color: 'primary.main'
                }}
              >
                {duplicateErrorData?.existingProjectName}
              </Typography>
            </Box>

            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Each local path can only be used for one project. Please choose a different path or edit the existing project if needed.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setDuplicateErrorOpen(false);
              setDuplicateErrorData(null);
            }}
            variant="contained"
            disableRipple
          >
            Understood
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snapshot Progress Modal */}
      <SnapshotProgressModal
        projectId={progressProjectId}
        isOpen={progressModalOpen}
        onClose={() => {
          setProgressModalOpen(false);
          setProgressProjectId(null);
        }}
        onComplete={() => {
          // Refresh projects after successful snapshot
          fetchProjects();
        }}
        onError={(error) => {
          console.error('Snapshot progress error:', error);
        }}
      />
    </Box>
  );
};

export default YourProjectsPage;
