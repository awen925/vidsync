import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  Stack,
  IconButton,
  Tooltip,
  Chip,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  File,
  Download,
  AlertCircle,
  Search,
  Home,
} from 'lucide-react';
import { cloudAPI } from '../hooks/useCloudApi';
import {
  buildFileTree,
  FileNode,
  FileSnapshot,
  formatFileSize,
  formatDate,
  filterTree,
} from '../lib/fileTreeBuilder';

interface FileTreeBrowserProps {
  projectId: string;
  snapshotUrl?: string;
  isOwner?: boolean;
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  isOwner: boolean;
}

const FileTreeNodeComponent: React.FC<FileTreeNodeProps> = ({
  node,
  depth,
  isOwner,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isDirectory = node.type === 'directory';
  const hasChildren = isDirectory && (node.children?.length ?? 0) > 0;

  const getIcon = () => {
    if (isDirectory) {
      return <Folder size={16} style={{ color: '#1976d2' }} />;
    }
    return <File size={16} style={{ color: '#999' }} />;
  };

  return (
    <>
      <ListItem
        sx={{
          pl: `${depth * 24}px`,
          py: 0.75,
          '&:hover': {
            backgroundColor: 'rgba(0,0,0,0.03)',
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              sx={{ p: 0, mr: 0.5 }}
            >
              {expanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </IconButton>
          ) : isDirectory ? (
            <Box sx={{ mr: 0.5, width: 16 }} />
          ) : null}
          {getIcon()}
        </ListItemIcon>
        <ListItemText
          primary={node.name}
          secondary={
            isDirectory
              ? `${node.fileCount || 0} files`
              : formatFileSize(node.size || 0)
          }
          primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: 500 } }}
          secondaryTypographyProps={{ variant: 'caption' }}
        />
      </ListItem>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List disablePadding>
            {(node.children || []).map((child) => (
              <FileTreeNodeComponent
                key={child.id}
                node={child}
                depth={depth + 1}
                isOwner={isOwner}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

export const FileTreeBrowser: React.FC<FileTreeBrowserProps> = ({
  projectId,
  snapshotUrl,
  isOwner = false,
}) => {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayedTree, setDisplayedTree] = useState<FileNode | null>(null);

  useEffect(() => {
    fetchFileTree();
  }, [projectId, snapshotUrl]);

  const fetchFileTree = async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      if (snapshotUrl) {
        // Fetch snapshot directly
        response = await fetch(snapshotUrl);
        if (!response.ok) throw new Error('Failed to fetch snapshot');
        const snapshotData = await response.json();
        const files = snapshotData.files || [];
        const builtTree = buildFileTree(files as FileSnapshot[]);
        setTree(builtTree);
        setDisplayedTree(builtTree);
      } else {
        // Fetch from API endpoint
        const apiResponse = await cloudAPI.get(`/projects/${projectId}/file-tree`);
        const files = apiResponse.data.files || [];
        const builtTree = buildFileTree(files as FileSnapshot[]);
        setTree(builtTree);
        setDisplayedTree(builtTree);
      }
    } catch (err) {
      console.error('Failed to fetch file tree:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load file browser'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (tree) {
      if (term.trim()) {
        const filtered = filterTree(tree, term);
        setDisplayedTree(filtered);
      } else {
        setDisplayedTree(tree);
      }
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 300,
        }}
      >
        <Stack alignItems="center" spacing={1}>
          <CircularProgress size={32} />
          <Typography variant="caption" color="textSecondary">
            Building file tree...
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Paper
        sx={{
          p: 3,
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 1,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <AlertCircle size={20} style={{ color: '#dc2626' }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Could not load file browser
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {error}
            </Typography>
          </Box>
        </Stack>
      </Paper>
    );
  }

  if (!tree || tree.children?.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="textSecondary">
          No files in this project yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Search and Summary */}
      <Paper sx={{ p: 2, mb: 2, backgroundColor: 'rgba(0,0,0,0.02)' }}>
        <Stack spacing={2}>
          {/* Search */}
          <TextField
            fullWidth
            size="small"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} style={{ color: '#999' }} />
                </InputAdornment>
              ),
            }}
          />

          {/* Summary Stats */}
          <Stack direction="row" spacing={2}>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Total Files
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {tree.fileCount || 0}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Total Size
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatFileSize(tree.totalSize || 0)}
              </Typography>
            </Box>
            {!isOwner && (
              <Box sx={{ ml: 'auto' }}>
                <Chip
                  label="📖 Read-only"
                  size="small"
                  variant="outlined"
                />
              </Box>
            )}
          </Stack>
        </Stack>
      </Paper>

      {/* File Tree */}
      <Paper sx={{ backgroundColor: '#fafafa', overflow: 'hidden' }}>
        <List disablePadding>
          {displayedTree?.children && displayedTree.children.length > 0 ? (
            displayedTree.children.map((node) => (
              <FileTreeNodeComponent
                key={node.id}
                node={node}
                depth={0}
                isOwner={isOwner}
              />
            ))
          ) : (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="textSecondary">
                {searchTerm ? 'No files match your search' : 'No files'}
              </Typography>
            </Box>
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default FileTreeBrowser;
