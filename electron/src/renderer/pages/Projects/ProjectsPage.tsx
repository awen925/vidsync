import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Card, CardContent, TextField, Button, Typography,
  Stack, List, ListItem, ListItemText, CircularProgress, Divider,
  Paper,
} from '@mui/material';
import { Plus, FolderOpen } from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const resp = await cloudAPI.get('/projects');
      setProjects(resp.data.projects || []);
    } catch (err) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleChooseFolder = async () => {
    try {
      const path = await (window as any).api.openDirectory();
      if (path) {
        setLocalPath(path);
      }
    } catch (err) {
      console.error('Failed to choose folder', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setCreating(true);
    try {
      const resp = await cloudAPI.post('/projects', { 
        name, 
        description,
        local_path: localPath || null,
      });
      const project = resp.data.project;
      
      // Start Syncthing folder for this project (if local path is provided)
      if (localPath) {
        try {
          await (window as any).api.syncthingStartForProject(project.id, localPath);
        } catch (syncError) {
          console.error('Failed to start Syncthing for project:', syncError);
          // Continue anyway - Syncthing setup failure shouldn't block project creation
        }
      }
      
      setName('');
      setDescription('');
      setLocalPath('');
      navigate(`/projects/${project.id}`);
    } catch (err) {
      console.error('Failed to create project', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ py: 4, minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="md">
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 4 }}>Projects</Typography>

        {/* Create Project Form */}
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>Create New Project</Typography>
            
            <form onSubmit={handleCreate}>
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  label="Project Name"
                  placeholder="Enter project name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                
                <TextField
                  fullWidth
                  label="Description"
                  placeholder="Optional project description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  multiline
                  rows={2}
                />
                
                <Box>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      fullWidth
                      label="Local Folder Path"
                      placeholder="Optional: select a folder to sync"
                      value={localPath}
                      InputProps={{
                        readOnly: true,
                        endAdornment: <FolderOpen size={18} style={{ marginRight: 8 }} />,
                      }}
                    />
                    <Button 
                      variant="outlined" 
                      onClick={handleChooseFolder}
                      sx={{ minWidth: 140 }}
                    >
                      Choose Folder
                    </Button>
                  </Stack>
                </Box>

                <Button 
                  type="submit" 
                  variant="contained" 
                  size="large"
                  disabled={creating}
                  startIcon={<Plus size={20} />}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>

        <Divider sx={{ my: 4 }} />

        {/* Projects List */}
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Your Projects</Typography>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : projects.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'background.paper' }}>
            <Typography sx={{ color: 'text.secondary' }}>No projects yet. Create one above!</Typography>
          </Paper>
        ) : (
          <Paper>
            <List>
              {projects.map((p, idx) => (
                <React.Fragment key={p.id}>
                  <ListItem 
                    onClick={() => navigate(`/projects/${p.id}`)}
                    sx={{ 
                      cursor: 'pointer', 
                      '&:hover': { bgcolor: 'action.hover' },
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <ListItemText
                      primary={<Typography sx={{ fontWeight: 500 }}>{p.name}</Typography>}
                      secondary={p.description || 'No description'}
                    />
                  </ListItem>
                  {idx < projects.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        )}
      </Container>
    </Box>
  );
};

export default ProjectsPage;
