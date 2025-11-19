import React, { useState, useEffect } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  TextField,
  Alert,
  Button,
  Typography,
  Stack,
} from '@mui/material';
import { cloudAPI } from '../../hooks/useCloudApi';
import InvitedProjectsList from '../../components/InvitedProjectsList';
import InvitedProjectDetailView from '../../components/InvitedProjectDetailView';

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

interface InvitedProjectsPageProps {
  onSelectProject?: (projectId: string) => void;
}

const InvitedProjectsPage: React.FC<InvitedProjectsPageProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<InvitedProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<InvitedProject | null>(null);
  const [loading, setLoading] = useState(false);
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
      onSelectProject?.(selectedProject.id);
    }
  }, [selectedProject, onSelectProject]);

  const fetchInvitedProjects = async () => {
    setLoading(true);
    try {
      const response = await cloudAPI.get('/projects/list/invited');
      const projectList = response.data.projects || [];
      setProjects(projectList);
      if (projectList.length > 0 && !selectedProject) {
        setSelectedProject(projectList[0]);
      }
    } catch (error) {
      console.error('Failed to fetch invited projects:', error);
    } finally {
      setLoading(false);
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

  return (
    <Box sx={{ display: 'flex', height: '100%', bgcolor: 'background.default' }}>
      {/* Left Panel - Invited Projects List */}
      <InvitedProjectsList
        projects={projects}
        selectedProjectId={selectedProject?.id}
        onSelectProject={setSelectedProject}
        onJoinClick={() => setJoinDialogOpen(true)}
        loading={loading}
      />

      {/* Right Panel - Project Details & File Tree */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedProject ? (
          <InvitedProjectDetailView
            project={selectedProject}
            onProjectUpdated={fetchInvitedProjects}
          />
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <Typography sx={{ color: 'text.secondary' }}>Select a project from the list</Typography>
          </Box>
        )}
      </Box>

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
