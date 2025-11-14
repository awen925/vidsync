import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  MoreHorizontal,
  Folder,
  Star,
  Zap,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  isStarred?: boolean;
  isFavorite?: boolean;
}

interface ProjectsSidebarProps {
  onSelectProject: (projectId: string) => void;
  selectedProjectId?: string;
}

const ProjectsSidebar: React.FC<ProjectsSidebarProps> = ({
  onSelectProject,
  selectedProjectId,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      // Mock projects for now - will connect to real API later
      const mockProjects: Project[] = [
        {
          id: '1',
          name: 'Design System',
          description: 'UI components and design tokens',
          isFavorite: true,
        },
        {
          id: '2',
          name: 'Mobile App',
          description: 'React Native application',
          isFavorite: false,
        },
        {
          id: '3',
          name: 'Documentation',
          description: 'API and user guides',
          isFavorite: false,
        },
      ];
      setProjects(mockProjects);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const starredProjects = filteredProjects.filter((p) => p.isFavorite);
  const regularProjects = filteredProjects.filter((p) => !p.isFavorite);

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Projects</h2>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Create Project Button */}
      <div className="px-6 py-3 border-b border-gray-200">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <div className="animate-spin inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <p className="mt-2 text-sm">Loading projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <Folder className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">No projects found</p>
          </div>
        ) : (
          <>
            {/* Starred Projects */}
            {starredProjects.length > 0 && (
              <div className="px-6 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Starred
                  </h3>
                </div>
                <div className="space-y-2">
                  {starredProjects.map((project) => (
                    <ProjectItem
                      key={project.id}
                      project={project}
                      isSelected={selectedProjectId === project.id}
                      isHovered={hoveredProject === project.id}
                      onSelect={() => onSelectProject(project.id)}
                      onHover={setHoveredProject}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Regular Projects */}
            {regularProjects.length > 0 && (
              <div className="px-6 py-4">
                {starredProjects.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Folder className="w-4 h-4 text-gray-400" />
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      All Projects
                    </h3>
                  </div>
                )}
                <div className="space-y-2">
                  {regularProjects.map((project) => (
                    <ProjectItem
                      key={project.id}
                      project={project}
                      isSelected={selectedProjectId === project.id}
                      isHovered={hoveredProject === project.id}
                      onSelect={() => onSelectProject(project.id)}
                      onHover={setHoveredProject}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-3 bg-gray-50">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Zap className="w-4 h-4" />
          <span>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>
        </div>
      </div>
    </div>
  );
};

interface ProjectItemProps {
  project: Project;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}

const ProjectItem: React.FC<ProjectItemProps> = ({
  project,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}) => {
  return (
    <div
      onMouseEnter={() => onHover(project.id)}
      onMouseLeave={() => onHover(null)}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-blue-100 text-blue-900'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
      onClick={onSelect}
    >
      <Folder
        className={`w-4 h-4 flex-shrink-0 ${
          isSelected ? 'text-blue-600' : 'text-gray-400'
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{project.name}</p>
        {project.description && (
          <p className="text-xs text-gray-500 truncate">{project.description}</p>
        )}
      </div>
      {isHovered && (
        <button className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ProjectsSidebar;
