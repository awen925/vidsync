import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  Button,
  CircularProgress,
  Box,
  Alert,
  Stack,
  Typography,
} from '@mui/material';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import { cloudAPI } from '../hooks/useCloudApi';
import { FileSyncStatus, SyncStatus } from './FileSyncStatus';

interface FileSnapshot {
  file_path: string;
  is_directory: boolean;
  size: number;
  file_hash: string;
  modified_at: string;
}

interface PaginationState {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ProjectFilesPageProps {
  projectId: string;
  isOwner?: boolean;
}

export const ProjectFilesPage: React.FC<ProjectFilesPageProps> = ({ projectId, isOwner = false }) => {
  const [files, setFiles] = useState<FileSnapshot[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    total: 0,
    limit: 500,
    offset: 0,
    hasMore: false,
  });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Sync status states
  const [folderSyncStatus, setFolderSyncStatus] = useState<SyncStatus | null>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(false);
  const [syncStatusError, setSyncStatusError] = useState<string | null>(null);

  // Fetch files when page or projectId changes
  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true);
      setError(null);
      try {
        const offset = page * 500;
        const response = await cloudAPI.get(`/projects/${projectId}/files-list?limit=500&offset=${offset}`);
        
        setFiles(response.data.files || []);
        setPagination(response.data.pagination);
      } catch (err) {
        console.error('Failed to fetch files:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch files');
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [projectId, page]);

  // Poll for sync status every 5 seconds (matches backend cache TTL)
  useEffect(() => {
    let isFirstFetch = true;

    const fetchSyncStatus = async () => {
      // Only show loading on first fetch, not during polling
      if (isFirstFetch) {
        setSyncStatusLoading(true);
        isFirstFetch = false;
      }
      setSyncStatusError(null);
      try {
        const response = await cloudAPI.get(`/projects/${projectId}/file-sync-status`);
        // Only update state if data actually changed to prevent unnecessary re-renders
        setFolderSyncStatus((prevStatus) => {
          if (JSON.stringify(prevStatus) === JSON.stringify(response.data)) {
            return prevStatus;
          }
          return response.data;
        });
      } catch (err) {
        console.error('Failed to fetch sync status:', err);
        setSyncStatusError(err instanceof Error ? err.message : 'Failed to fetch sync status');
      } finally {
        // Always clear loading state after first fetch
        if (!isFirstFetch) {
          setSyncStatusLoading(false);
        }
      }
    };

    // Fetch immediately
    fetchSyncStatus();

    // Then poll every 5 seconds (matches backend cache TTL of 5000ms)
    const pollInterval = setInterval(fetchSyncStatus, 5000);

    return () => clearInterval(pollInterval);
  }, [projectId]);

  const handleChangePage = (_event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  };

  const handleRefreshSnapshot = async () => {
    if (!isOwner) return;

    setRefreshing(true);
    setError(null);
    try {
      const response = await cloudAPI.put(`/projects/${projectId}/refresh-snapshot`, {});
      console.log('Snapshot refreshed:', response.data);

      // Refetch files to show updated snapshot
      setPage(0);
    } catch (err) {
      console.error('Failed to refresh snapshot:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh snapshot');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncProject = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await cloudAPI.post(`/projects/${projectId}/sync-start`, {});
      console.log('Sync started:', response.data);
      // Show success message or update UI accordingly
    } catch (err) {
      console.error('Failed to start sync:', err);
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    } finally {
      setSyncing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  if (loading && files.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {/* Header with actions */}
      <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Files ({pagination.total})
        </Typography>

        {isOwner && (
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefreshSnapshot}
            disabled={refreshing}
            size="small"
          >
            {refreshing ? 'Refreshing...' : 'Refresh Snapshot'}
          </Button>
        )}

        <Button
          variant="contained"
          startIcon={<CloudDownloadIcon />}
          onClick={handleSyncProject}
          disabled={syncing}
          disableRipple
          sx={{ borderRadius: 1 }}
        >
          {syncing ? 'Syncing...' : 'Sync This Project'}
        </Button>
      </Box>

      {/* Error alert */}
      {error && <Alert severity="error">{error}</Alert>}

      {/* Sync Status Display (Full Mode) */}
      <FileSyncStatus
        syncStatus={folderSyncStatus}
        mode="full"
        loading={syncStatusLoading}
        error={syncStatusError}
      />

      {/* Files table */}
      <TableContainer component={Paper} sx={{ borderRadius: 1 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>File Path</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold', width: '120px' }}>
                Size
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold', width: '180px' }}>Modified</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', width: '100px' }}>
                Type
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold', width: '120px' }}>
                Sync Status
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {files.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ padding: '40px' }}>
                  No files yet
                </TableCell>
              </TableRow>
            ) : (
              files.map((file, index) => {
                // Determine row background color based on sync state
                let rowBgColor = undefined;
                if (folderSyncStatus?.state === 'synced') {
                  rowBgColor = '#e8f5e9'; // Light green
                } else if (folderSyncStatus?.state === 'syncing') {
                  rowBgColor = '#fff8e1'; // Light yellow
                } else if (folderSyncStatus?.state === 'error') {
                  rowBgColor = '#ffebee'; // Light red
                } else if (folderSyncStatus?.state === 'paused') {
                  rowBgColor = '#f5f5f5'; // Light gray
                }

                return (
                  <TableRow
                    key={`${file.file_path}-${index}`}
                    hover
                    sx={{
                      backgroundColor: file.is_directory ? '#fafafa' : rowBgColor,
                    }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
                      {file.file_path}
                    </TableCell>
                    <TableCell align="right">
                      {file.is_directory ? '—' : formatFileSize(file.size)}
                    </TableCell>
                    <TableCell>{formatDate(file.modified_at)}</TableCell>
                    <TableCell align="center">
                      <Typography
                        variant="caption"
                        sx={{
                          backgroundColor: file.is_directory ? '#e3f2fd' : '#f3e5f5',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'inline-block',
                        }}
                      >
                        {file.is_directory ? 'Folder' : 'File'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <FileSyncStatus
                        syncStatus={folderSyncStatus}
                        mode="compact"
                        loading={syncStatusLoading}
                        error={syncStatusError}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {files.length > 0 && (
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" color="textSecondary">
            Showing {files.length} of {pagination.total} files
          </Typography>
          <TablePagination
            component="div"
            count={pagination.total}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={500}
            rowsPerPageOptions={[500]}
            sx={{ marginLeft: 'auto' }}
          />
        </Box>
      )}

      {/* Loading indicator for pagination */}
      {loading && <CircularProgress size={24} sx={{ margin: '0 auto' }} />}
    </Stack>
  );
};

export default ProjectFilesPage;
