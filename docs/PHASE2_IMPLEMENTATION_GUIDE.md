# Phase 2: Frontend Implementation & Syncthing Integration

## 🎯 Phase 2 Objectives

Build the complete frontend experience for invitees to see remote project files with real-time sync status.

**What Phase 2 Will Deliver:**
1. ✅ File metadata syncing from Syncthing folder
2. ✅ Frontend file list display with pagination
3. ✅ Real-time sync status badges (✓ ⟳ ⚠ ✗)
4. ✅ Folder navigation and drill-down
5. ✅ Performance optimization (virtual scrolling, caching)

**Estimated Timeline:** 2-3 days

---

## 📊 Architecture Overview

### Data Flow (Phase 2)

```
Invitee's Device
    ↓
1. Project is shared via invite token
    ↓
2. Syncthing automatically syncs owner's folder
    ↓
3. Backend scans Syncthing folder → stores metadata in remote_files
    ↓
4. Frontend queries: GET /api/projects/:id/files-paginated
    ↓
5. Merges cloud metadata + local sync status
    ↓
6. Displays file list with sync badges
    ↓
7. Real-time updates as files sync
```

### Component Hierarchy

```
YourProjectsPage
├─ ProjectListSection
│  ├─ OwnedProjectsList
│  └─ InvitedProjectsList
├─ ProjectDetailPanel
│  ├─ FileListHeader (pagination controls)
│  ├─ FileListTable (virtualized)
│  │  ├─ FileRow
│  │  │  ├─ FileIcon
│  │  │  ├─ FileName
│  │  │  ├─ FileSize
│  │  │  ├─ SyncStatusBadge
│  │  │  └─ ModifiedDate
│  │  └─ Pagination (page nav)
│  └─ BreadcrumbNavigation
└─ LoadingStates / ErrorStates
```

---

## 🔧 Phase 2 Implementation Steps

### Step 1: Create Syncthing File Scanning Service

**File:** `cloud/src/services/syncthingScanner.ts` (NEW)

**Purpose:** Scan Syncthing folders and populate remote_files table

```typescript
// Syncthing REST API client for scanning folders
interface SyncthingFile {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modTime: string;
}

async function scanSyncthingFolder(
  projectId: string,
  syncPath: string
): Promise<void> {
  // 1. Query Syncthing REST API for files
  const files = await querySyncthingApi(syncPath);
  
  // 2. Calculate file hashes for deduplication
  const filesWithHashes = files.map(f => ({
    ...f,
    hash: calculateHash(f),
  }));
  
  // 3. Upsert into remote_files table
  await supabase.from('remote_files').upsert(filesWithHashes);
  
  // 4. Mark missing files as deleted
  await markDeletedFiles(projectId, files);
}
```

**Key Features:**
- Scans Syncthing REST API (not local file system)
- Calculates SHA256 hashes for deduplication
- Upserts files into remote_files table
- Marks deleted files with soft-delete
- Handles large folders efficiently (pagination)

---

### Step 2: Add Backend Route for File Sync Trigger

**File:** `cloud/src/api/projects/routes.ts` (ALREADY HAS PLACEHOLDER)

**Current Status:** Endpoint exists, needs implementation

```typescript
// POST /api/projects/:projectId/files-sync
router.post('/:projectId/files-sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify ownership
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can sync files' });
    }

    // TODO: Phase 2
    // 1. Determine Syncthing folder path for this project
    // 2. Call syncthingScanner.scanSyncthingFolder()
    // 3. Return success with file count

    res.json({
      success: true,
      message: 'File sync completed',
      filesScanned: 250,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('File sync exception:', error);
    res.status(500).json({ error: 'Failed to sync files' });
  }
});
```

---

### Step 3: Create Frontend Hook for Remote Files

**File:** `electron/src/renderer/hooks/useRemoteFileList.ts` (NEW)

**Purpose:** React hook for fetching and managing remote file lists

```typescript
interface UseRemoteFileListOptions {
  projectId: string;
  folderPath?: string;
  perPage?: number;
}

export const useRemoteFileList = (options: UseRemoteFileListOptions) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: options.perPage || 100,
    total: 0,
    has_more: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch files
  const fetchFiles = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const response = await cloudAPI.get(
        `/projects/${options.projectId}/files-paginated`,
        {
          params: {
            path: options.folderPath || '/',
            page,
            per_page: options.per_page || 100,
          },
        }
      );

      setFiles(response.data.files || []);
      setPagination(response.data.pagination);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
    } finally {
      setLoading(false);
    }
  }, [options.projectId, options.folderPath, options.perPage]);

  // Sync status check
  const checkSyncStatus = useCallback(async () => {
    try {
      // Check local Syncthing folder for actual files
      const syncPath = getSyncthingProjectPath(options.projectId);
      const localFiles = await window.api.fsListDirectory(syncPath, false);
      
      // Update files with sync status
      setFiles(prev => prev.map(f => ({
        ...f,
        synced: localFiles.some(lf => lf.name === f.name),
      })));
    } catch (err) {
      console.warn('Could not check sync status:', err);
    }
  }, [options.projectId]);

  useEffect(() => {
    fetchFiles(1);
    checkSyncStatus();
  }, [fetchFiles, checkSyncStatus]);

  return {
    files,
    pagination,
    loading,
    error,
    fetchFiles,
    checkSyncStatus,
  };
};
```

---

### Step 4: Create Sync Status Badge Component

**File:** `electron/src/renderer/components/SyncStatusBadge.tsx` (NEW)

```typescript
interface SyncStatusBadgeProps {
  synced: boolean;
  syncStatus?: 'synced' | 'syncing' | 'waiting' | 'error';
  size?: 'small' | 'medium' | 'large';
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  synced,
  syncStatus = synced ? 'synced' : 'syncing',
  size = 'small',
}) => {
  const statusConfig = {
    synced: { icon: '✓', label: 'Synced', color: 'success' },
    syncing: { icon: '⟳', label: 'Syncing', color: 'warning' },
    waiting: { icon: '⏱', label: 'Waiting', color: 'info' },
    error: { icon: '✗', label: 'Error', color: 'error' },
  };

  const config = statusConfig[syncStatus];

  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size={size}
      variant="outlined"
    />
  );
};
```

---

### Step 5: Update YourProjectsPage for Remote Files

**File:** `electron/src/renderer/pages/Projects/YourProjectsPage.tsx` (UPDATE)

```typescript
const fetchProjectFiles = async (projectId: string) => {
  setFilesLoading(true);
  try {
    const project = projects.find(p => p.id === projectId);
    
    if (project?.local_path) {
      // LOCAL PROJECT - Use IPC (existing code)
      const result = await window.api.fsListDirectory(project.local_path, false);
      // ... existing code ...
    } else {
      // REMOTE PROJECT - New Phase 2 code
      const response = await cloudAPI.get(
        `/projects/${projectId}/files-paginated`,
        {
          params: { path: '/', page: 1, per_page: 100 }
        }
      );

      const cloudFiles = response.data.files || [];

      // Check local Syncthing folder for sync status
      let localFiles: DirectoryEntry[] = [];
      const syncthingPath = getSyncthingProjectPath(projectId);

      try {
        const localResult = await window.api.fsListDirectory(syncthingPath, false);
        if (localResult.success) {
          localFiles = localResult.entries || [];
        }
      } catch (e) {
        console.warn('Syncthing folder not yet synced');
      }

      // Merge cloud metadata + local sync status
      const mergedFiles = cloudFiles.map((cloudFile: any) => ({
        ...cloudFile,
        synced: !!localFiles.find(f => f.name === cloudFile.name),
      }));

      setFiles(mergedFiles);
      setCurrentPath(mergedFiles);
    }
  } catch (error) {
    console.error('Failed to fetch files:', error);
    setFiles([]);
  } finally {
    setFilesLoading(false);
  }
};
```

---

### Step 6: Add Sync Status Badge to File Table

**File:** `electron/src/renderer/pages/Projects/YourProjectsPage.tsx` (UPDATE TABLE)

```typescript
<TableRow>
  <TableCell>{file.name}</TableCell>
  <TableCell align="right">{formatFileSize(file.size)}</TableCell>
  <TableCell align="right">{formatDate(file.modified)}</TableCell>
  
  {/* NEW: Sync Status Badge */}
  <TableCell align="center">
    {!project?.local_path && (
      <SyncStatusBadge
        synced={file.synced}
        syncStatus={file.synced ? 'synced' : 'syncing'}
      />
    )}
  </TableCell>
</TableRow>
```

---

### Step 7: Implement Pagination UI

**File:** `electron/src/renderer/pages/Projects/YourProjectsPage.tsx` (UPDATE)

```typescript
interface PaginationState {
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

const handlePageChange = async (newPage: number) => {
  if (!selectedProject?.id) return;
  
  setFilesLoading(true);
  try {
    const response = await cloudAPI.get(
      `/projects/${selectedProject.id}/files-paginated`,
      {
        params: {
          path: pathBreadcrumbs.join('/') || '/',
          page: newPage,
          per_page: 100,
        },
      }
    );

    setFiles(response.data.files);
    setPagination(response.data.pagination);
  } finally {
    setFilesLoading(false);
  }
};

// In JSX:
{pagination.total > 0 && (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
    <Typography variant="caption">
      Showing {(pagination.page - 1) * pagination.per_page + 1}-
      {Math.min(pagination.page * pagination.per_page, pagination.total)}
      of {pagination.total} files
    </Typography>
    
    <Pagination
      count={Math.ceil(pagination.total / pagination.per_page)}
      page={pagination.page}
      onChange={(e, page) => handlePageChange(page)}
    />
  </Box>
)}
```

---

### Step 8: Add Real-Time Sync Status Updates

**File:** `electron/src/main/main.ts` (UPDATE)

```typescript
// Watch Syncthing folder for changes
import { watch } from 'fs';

const watchSyncthingFolder = (projectId: string, folderPath: string) => {
  const watcher = watch(folderPath, { recursive: true }, (eventType, filename) => {
    // Notify renderer of sync status change
    mainWindow?.webContents.send('file-sync-status-changed', {
      projectId,
      filename,
      eventType, // 'rename' or 'change'
    });
  });

  return watcher;
};

// Register watchers for each project
ipcMain.handle('watch-syncthing-folder', (event, projectId, folderPath) => {
  return watchSyncthingFolder(projectId, folderPath);
});
```

---

### Step 9: Listen for Sync Status Changes in React

**File:** `electron/src/renderer/pages/Projects/YourProjectsPage.tsx` (UPDATE)

```typescript
useEffect(() => {
  if (!selectedProject) return;

  const handleFileSyncStatusChanged = (event: any, data: any) => {
    if (data.projectId === selectedProject.id) {
      // Update sync status for this file
      setFiles(prev =>
        prev.map(f =>
          f.name === data.filename ? { ...f, synced: true } : f
        )
      );
    }
  };

  window.api.onFileSyncStatusChanged(handleFileSyncStatusChanged);

  return () => {
    window.api.offFileSyncStatusChanged(handleFileSyncStatusChanged);
  };
}, [selectedProject?.id]);
```

---

### Step 10: Add Caching for Performance

**File:** `electron/src/renderer/hooks/useRemoteFileListCache.ts` (NEW)

```typescript
const fileListCache = new Map<
  string,
  { files: FileItem[]; timestamp: number }
>();

const getCachedFiles = (key: string) => {
  const cached = fileListCache.get(key);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    // Cache valid for 5 minutes
    return cached.files;
  }
  return null;
};

const setCachedFiles = (key: string, files: FileItem[]) => {
  fileListCache.set(key, { files, timestamp: Date.now() });
};

// Clear cache on manual refresh
const handleRefreshFiles = () => {
  fileListCache.clear();
  fetchFiles(1);
};
```

---

## 📋 Phase 2 Implementation Checklist

### Backend (3-4 hours)
- [ ] 1. Implement Syncthing scanner service
- [ ] 2. Create file hashing utility
- [ ] 3. Implement file upsert logic
- [ ] 4. Handle soft-delete for missing files
- [ ] 5. Complete POST /files-sync endpoint
- [ ] 6. Add error handling & logging
- [ ] 7. Test with sample Syncthing folder

### Frontend (4-5 hours)
- [ ] 1. Create useRemoteFileList hook
- [ ] 2. Create SyncStatusBadge component
- [ ] 3. Update YourProjectsPage for remote files
- [ ] 4. Add pagination UI
- [ ] 5. Implement folder navigation
- [ ] 6. Add sync status real-time updates
- [ ] 7. Implement caching layer
- [ ] 8. Add loading/error states

### Testing (2-3 hours)
- [ ] 1. Test file metadata sync
- [ ] 2. Test pagination
- [ ] 3. Test folder navigation
- [ ] 4. Test sync status updates
- [ ] 5. Test with 10k+ files
- [ ] 6. Performance testing
- [ ] 7. Error handling

### Documentation (1-2 hours)
- [ ] 1. Update implementation guide
- [ ] 2. Document API changes
- [ ] 3. Document component APIs
- [ ] 4. Add code examples
- [ ] 5. Create testing guide

---

## 🎯 Success Criteria

✅ Invitees see complete file list from remote project  
✅ Pagination works (100 items/page)  
✅ Folder navigation works (drill into subfolders)  
✅ Sync status badges show real-time status  
✅ Performance is excellent (< 200ms page loads)  
✅ 10k+ files handled efficiently  
✅ Graceful degradation if Syncthing not ready  
✅ Full error handling and user feedback  

---

## 🚀 Getting Started

### 1. Set Up Syncthing Scanner Service
Start with Step 1: Create the Syncthing file scanning service

### 2. Implement Frontend Hook
Step 3: Create useRemoteFileList hook for data fetching

### 3. Build UI Components
Steps 4-6: Create badge component and update file table

### 4. Add Interactions
Steps 7-9: Pagination and real-time updates

### 5. Optimize Performance
Step 10: Add caching and virtual scrolling

---

## 📚 Related Documentation

- `REMOTE_PROJECT_FILE_LIST_IMPLEMENTATION.md` - Architecture overview
- `REMOTE_FILE_LIST_IMPLEMENTATION_CHECKLIST.md` - Implementation checklist
- `PHASE1_REMOTE_FILE_LIST_COMPLETE.md` - Phase 1 details

---

**Ready to start Phase 2! 🚀**
