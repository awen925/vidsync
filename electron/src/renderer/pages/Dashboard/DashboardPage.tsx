import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// styles are imported globally from App.tsx
import { cloudAPI } from '../../hooks/useCloudApi';
import { useAgentEvents, useAgentStatus } from '../../hooks/useAgentEvents';

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
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Welcome to Vidsync</h1>
        <p>Manage your file synchronization projects</p>
      </div>

      <div className="agent-status">
        <span className={`status-indicator ${status?.status === 'ok' ? 'active' : 'inactive'}`}></span>
        <span>{status?.status === 'ok' ? 'Agent Connected' : 'Agent Disconnected'}</span>
      </div>

      <button onClick={handleCreateProject} className="btn-primary">
        Create New Project
      </button>

      {loading ? (
        <div className="loader">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <div key={project.id} className="project-card">
              <h3>{project.name}</h3>
              <p>{project.description}</p>
              <button onClick={() => navigate(`/projects/${project.id}`)}>
                Open
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
