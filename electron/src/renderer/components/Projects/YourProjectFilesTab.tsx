import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ArrowLeft, Folder, File } from 'lucide-react';

interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  fullPath?: string;
  children?: FileItem[];
}

interface YourProjectFilesTabProps {
  currentPath: FileItem[];
  pathBreadcrumbs: string[];
  loading: boolean;
  onOpenFolder: (folder: FileItem & { fullPath?: string }) => void;
  onGoBack: () => void;
  formatFileSize: (bytes?: number) => string;
}

const YourProjectFilesTab: React.FC<YourProjectFilesTabProps> = ({
  currentPath,
  pathBreadcrumbs,
  loading,
  onOpenFolder,
  onGoBack,
  formatFileSize,
}) => {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Breadcrumb Navigation */}
          {pathBreadcrumbs.length > 1 && (
            <Box
              sx={{
                p: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Button
                disableRipple
                size="small"
                startIcon={<ArrowLeft size={16} />}
                onClick={onGoBack}
                sx={{ textTransform: 'none' }}
              >
                Back
              </Button>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {pathBreadcrumbs.slice(1).join(' / ')}
              </Typography>
            </Box>
          )}

          {/* File Table */}
          {currentPath.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Typography sx={{ color: 'text.secondary' }}>No files in this folder</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: 120 }}>
                      Size
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, width: 150 }}>
                      Modified
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentPath.map((file, index) => (
                    <TableRow
                      key={`${file.name}-${index}`}
                      hover
                      onClick={() => file.type === 'folder' && onOpenFolder(file)}
                      sx={{ cursor: file.type === 'folder' ? 'pointer' : 'default' }}
                    >
                      <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {file.type === 'folder' ? (
                          <>
                            <Folder size={16} style={{ color: '#0A66C2' }} />
                            <Typography sx={{ fontWeight: 500 }}>{file.name}</Typography>
                          </>
                        ) : (
                          <>
                            <File size={16} style={{ color: '#666' }} />
                            <Typography>{file.name}</Typography>
                          </>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {file.type === 'file' ? formatFileSize(file.size) : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        {file.modified ? new Date(file.modified).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
};

export default YourProjectFilesTab;
