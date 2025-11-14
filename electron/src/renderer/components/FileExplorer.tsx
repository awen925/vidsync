import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  Download,
  Share2,
  Trash2,
  Clock,
} from 'lucide-react';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modifiedAt?: string;
  children?: FileNode[];
}

interface FileExplorerProps {
  projectId?: string;
  projectName?: string;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ projectId, projectName }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['root'])
  );
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const mockFiles: FileNode = {
    id: 'root',
    name: 'root',
    type: 'folder',
    children: [
      {
        id: 'src',
        name: 'src',
        type: 'folder',
        children: [
          {
            id: 'components',
            name: 'components',
            type: 'folder',
            children: [
              {
                id: 'Button.tsx',
                name: 'Button.tsx',
                type: 'file',
                size: 2048,
                modifiedAt: '2024-01-20',
              },
              {
                id: 'Modal.tsx',
                name: 'Modal.tsx',
                type: 'file',
                size: 3072,
                modifiedAt: '2024-01-19',
              },
            ],
          },
          {
            id: 'index.ts',
            name: 'index.ts',
            type: 'file',
            size: 512,
            modifiedAt: '2024-01-20',
          },
        ],
      },
      {
        id: 'public',
        name: 'public',
        type: 'folder',
        children: [
          {
            id: 'favicon.ico',
            name: 'favicon.ico',
            type: 'file',
            size: 1024,
            modifiedAt: '2024-01-10',
          },
        ],
      },
      {
        id: 'package.json',
        name: 'package.json',
        type: 'file',
        size: 1024,
        modifiedAt: '2024-01-20',
      },
      {
        id: 'tsconfig.json',
        name: 'tsconfig.json',
        type: 'file',
        size: 512,
        modifiedAt: '2024-01-15',
      },
    ],
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const renderFileTree = (nodes: FileNode[] | undefined, depth = 0): React.ReactNode => {
    if (!nodes || nodes.length === 0) return null;

    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className={`flex items-center group py-1 px-2 rounded hover:bg-gray-100 transition-colors ${
            hoveredItem === node.id ? 'bg-gray-100' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onMouseEnter={() => setHoveredItem(node.id)}
          onMouseLeave={() => setHoveredItem(null)}
        >
          {node.type === 'folder' ? (
            <>
              <button
                onClick={() => toggleFolder(node.id)}
                className="flex items-center justify-center w-5 h-5 mr-1 text-gray-600 hover:text-gray-900"
              >
                {expandedFolders.has(node.id) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <Folder className="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" />
            </>
          ) : (
            <>
              <div className="w-5 mr-1"></div>
              <File className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
            </>
          )}
          <span className="flex-1 text-sm text-gray-700 truncate font-medium">
            {node.name}
          </span>

          {hoveredItem === node.id && (
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <button className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200">
                <Download className="w-4 h-4" />
              </button>
              <button className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200">
                <Share2 className="w-4 h-4" />
              </button>
              <button className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-gray-200">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {node.type === 'folder' && expandedFolders.has(node.id) && (
          <>{renderFileTree(node.children, depth + 1)}</>
        )}
      </div>
    ));
  };

  return (
    <div className="flex-1 flex flex-col bg-white h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {projectName || 'Project'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              File browser and version control
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Sync
            </button>
            <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              Share
            </button>
          </div>
        </div>

        {/* Info Row */}
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📁</span>
            <span>0 folders</span>
          </div>
          <div className="flex items-center gap-2">
            <span>📄</span>
            <span>0 files</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Clock className="w-4 h-4" />
            <span>Last modified: 2024-01-20</span>
          </div>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-0">
          {renderFileTree(mockFiles.children)}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Synced • {new Date().toLocaleDateString()}
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm text-gray-600 hover:text-gray-900">
            View History
          </button>
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            Version Control
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileExplorer;
