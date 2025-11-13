import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

    try {
      const resp = await cloudAPI.post('/projects', { 
        name, 
        description,
        local_path: localPath || null,
      });
      const project = resp.data.project;
      setName('');
      setDescription('');
      setLocalPath('');
      navigate(`/projects/${project.id}`);
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-semibold mb-4">Projects</h2>

      <form onSubmit={handleCreate} className="mb-6">
        <div className="mb-2">
          <input
            className="border p-2 w-full"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="mb-2">
          <input
            className="border p-2 w-full"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mb-2">
          <div className="flex gap-2">
            <input
              className="border p-2 flex-1"
              placeholder="Local folder path (optional)"
              value={localPath}
              readOnly
            />
            <button
              type="button"
              onClick={handleChooseFolder}
              className="bg-gray-600 text-white px-4 py-2 rounded"
            >
              Choose Folder
            </button>
          </div>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          Create Project
        </button>
      </form>

      <div>
        {loading ? (
          <div>Loading projects...</div>
        ) : (
          <ul>
            {projects.map((p) => (
              <li key={p.id} className="mb-2">
                <Link to={`/projects/${p.id}`} className="text-blue-600">
                  {p.name}
                </Link>
                {p.description ? <div className="text-sm text-gray-600">{p.description}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ProjectsPage;
