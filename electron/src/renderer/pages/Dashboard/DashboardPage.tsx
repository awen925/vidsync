import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Grid, Card, CardContent, CardActions, Button, Typography,
  Chip, CircularProgress, Stack, Paper,
} from '@mui/material';
import { Plus } from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';
import { useAgentStatus } from '../../hooks/useAgentEvents';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { status } = useAgentStatus();

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await cloudAPI.get('/projects');
        setProjects(response.data.projects);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const handleCreateProject = () => {
    navigate('/projects/new');
  };

  return (
    <Box sx={{ py: 4, minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>Welcome to Vidsync</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>Manage your file synchronization projects</Typography>
        </Box>

        {/* Agent Status */}
        <Paper sx={{ p: 2, mb: 4, bgcolor: status?.status === 'ok' ? '#E8F5E9' : '#FFF3E0' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ 
              width: 12, 
              height: 12, 
              borderRadius: '50%', 
              bgcolor: status?.status === 'ok' ? '#4CAF50' : '#FF9800',
              animation: status?.status === 'ok' ? 'pulse 2s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.5 },
                '100%': { opacity: 1 },
              },
            }} />
            <Typography sx={{ fontWeight: 500 }}>
              {status?.status === 'ok' ? '✓ Agent Connected' : '✗ Agent Disconnected'}
            </Typography>
          </Stack>
        </Paper>

        {/* Create Project Button */}
        <Box sx={{ mb: 4 }}>
          <Button 
            variant="contained" 
            size="large"
            startIcon={<Plus size={20} />}
            onClick={handleCreateProject}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Create New Project
          </Button>
        </Box>

        {/* Projects Grid */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : projects.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'background.paper' }}>
            <Typography variant="h6" sx={{ mb: 1, color: 'text.secondary' }}>No projects yet</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>Create one to get started with file synchronization</Typography>
            <Button variant="contained" onClick={handleCreateProject}>Create First Project</Button>
          </Paper>
        ) : (
          <Grid container spacing={3}>
            {projects.map((project) => (
              <Grid key={project.id} sx={{ width: '100%' }} display="grid" gridColumn={{ xs: '1 / -1', sm: 'span 6', md: 'span 4' }}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', 
                  transition: 'all 0.3s ease',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                }} onClick={() => navigate(`/projects/${project.id}`)}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>{project.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{project.description || 'No description'}</Typography>
                    <Chip label={`ID: ${project.id.slice(0, 8)}`} size="small" variant="outlined" />
                  </CardContent>
                  <CardActions>
                    <Button size="small" onClick={() => navigate(`/projects/${project.id}`)}>View Details</Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </Box>
  );
};



export default DashboardPage;
