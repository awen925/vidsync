# Phase 2 Quick Start - 3 Day Implementation Plan

## 📅 3-Day Timeline

### Day 1: Backend File Scanning (4 hours)
**Goal:** Syncthing folder → remote_files table

**Tasks:**
1. Create `syncthingScanner.ts` service
2. Implement `scanSyncthingFolder()` function
3. Add file hashing utility
4. Complete `POST /files-sync` endpoint
5. Test with sample folder

**Deliverable:** Backend can scan Syncthing folder and populate database

---

### Day 2: Frontend Display (5 hours)
**Goal:** Show file list with pagination and sync status

**Tasks:**
1. Create `useRemoteFileList()` hook
2. Create `SyncStatusBadge` component
3. Update YourProjectsPage file display
4. Add pagination UI
5. Implement folder navigation
6. Test with various file counts

**Deliverable:** Invitees see files with pagination and sync badges

---

### Day 3: Polish & Optimization (3 hours)
**Goal:** Real-time updates, caching, error handling

**Tasks:**
1. Implement file system watcher for sync updates
2. Add caching layer (5-min TTL)
3. Improve error messages
4. Test with 10k+ files
5. Virtual scrolling optimization

**Deliverable:** Smooth, responsive UX with real-time status

---

## 🔧 Quick Implementation Flow

### Step 1: Backend Scanner (2 hours)

**File:** `cloud/src/services/syncthingScanner.ts`

```typescript
import crypto from 'crypto';
import { supabase } from '../lib/supabaseClient';

interface FileMetadata {
  project_id: string;
  path: string;
  name: string;
  size: number;
  is_directory: boolean;
  mime_type?: string;
  owner_id: string;
  file_hash: string;
  modified_at: string;
}

export async function scanSyncthingFolder(
  projectId: string,
  folderPath: string,
  ownerId: string
): Promise<void> {
  try {
    // 1. Read Syncthing folder recursively
    const files = await readFolderRecursive(folderPath);
    
    // 2. Transform to metadata format
    const metadata = files.map(file => ({
      project_id: projectId,
      path: file.relativePath,
      name: file.name,
      size: file.size,
      is_directory: file.isDirectory,
      mime_type: getMimeType(file.name),
      owner_id: ownerId,
      file_hash: calculateHash(file.path),
      modified_at: new Date(file.mtime).toISOString(),
    }));

    // 3. Upsert into remote_files
    const { error } = await supabase
      .from('remote_files')
      .upsert(metadata, { onConflict: 'project_id,path' });

    if (error) {
      console.error('Failed to upsert files:', error);
      throw error;
    }

    // 4. Mark missing files as deleted
    await markMissingAsDeleted(projectId, metadata);

    console.log(`Synced ${metadata.length} files for project ${projectId}`);
  } catch (error) {
    console.error('Syncthing scan failed:', error);
    throw error;
  }
}

function calculateHash(filePath: string): string {
  // For now, use file path as hash
  // In production, calculate SHA256 of file content
  return crypto.createHash('sha256').update(filePath).digest('hex');
}

async function readFolderRecursive(folderPath: string): Promise<any[]> {
  // Implement folder reading logic
  // Return array of { name, path, size, isDirectory, mtime }
  return [];
}

async function markMissingAsDeleted(
  projectId: string,
  existingFiles: FileMetadata[]
): Promise<void> {
  const existingPaths = existingFiles.map(f => f.path);

  await supabase
    .from('remote_files')
    .update({ deleted_by: 'system', deleted_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .not('path', 'in', `(${existingPaths.join(',')})`)
    .is('deleted_by', null);
}
```

### Step 2: Frontend Hook (1.5 hours)

**File:** `electron/src/renderer/hooks/useRemoteFileList.ts`

```typescript
import { useState, useCallback, useEffect } from 'react';
import { cloudAPI } from '../api/cloudAPI';

interface FileItem {
  id: string;
  name: string;
  path: string;
  size?: number;
  is_directory: boolean;
  modified_at: string;
  synced?: boolean;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

export const useRemoteFileList = (projectId: string, folderPath = '/') => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    per_page: 100,
    total: 0,
    has_more: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(
    async (page: number = 1) => {
      setLoading(true);
      try {
        const response = await cloudAPI.get(
          `/projects/${projectId}/files-paginated`,
          {
            params: { path: folderPath, page, per_page: 100 },
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
    },
    [projectId, folderPath]
  );

  useEffect(() => {
    fetchFiles(1);
  }, [fetchFiles]);

  return { files, pagination, loading, error, fetchFiles };
};
```

### Step 3: Sync Status Badge (1 hour)

**File:** `electron/src/renderer/components/SyncStatusBadge.tsx`

```typescript
import React from 'react';
import { Chip } from '@mui/material';

interface SyncStatusBadgeProps {
  synced: boolean;
  size?: 'small' | 'medium';
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  synced,
  size = 'small',
}) => {
  return (
    <Chip
      icon={synced ? '✓' : '⟳'}
      label={synced ? 'Synced' : 'Syncing'}
      color={synced ? 'success' : 'warning'}
      size={size}
      variant="outlined"
    />
  );
};
```

### Step 4: Update File Table (1.5 hours)

In `YourProjectsPage.tsx`, add sync status column:

```typescript
<TableHead>
  <TableRow sx={{ bgcolor: 'action.hover' }}>
    <TableCell>Name</TableCell>
    <TableCell align="right" width={100}>Size</TableCell>
    <TableCell align="right" width={150}>Modified</TableCell>
    {!selectedProject?.local_path && (
      <TableCell align="center" width={100}>Status</TableCell>
    )}
  </TableRow>
</TableHead>

<TableBody>
  {files.map((file) => (
    <TableRow key={file.id}>
      <TableCell>{file.name}</TableCell>
      <TableCell align="right">{formatBytes(file.size)}</TableCell>
      <TableCell align="right">{formatDate(file.modified_at)}</TableCell>
      {!selectedProject?.local_path && (
        <TableCell align="center">
          <SyncStatusBadge synced={file.synced} />
        </TableCell>
      )}
    </TableRow>
  ))}
</TableBody>
```

---

## 🎯 Key Implementation Points

### Backend Priorities
1. **File Scanning** - Scan Syncthing folder, calculate hashes
2. **Database Sync** - Upsert to remote_files table
3. **Soft Delete** - Mark missing files as deleted
4. **Error Handling** - Handle large folders, permission issues

### Frontend Priorities
1. **Data Fetching** - useRemoteFileList hook with pagination
2. **Display** - Show files with sync status badges
3. **Navigation** - Folder drill-down with breadcrumbs
4. **Real-Time** - Update badges as files sync

### Performance Priorities
1. **Pagination** - Load 100 items per page
2. **Caching** - Cache for 5 minutes
3. **Virtual Scrolling** - For 10k+ files
4. **Batch Operations** - Upsert multiple files at once

---

## 📊 Testing Checklist

### Backend Tests
- [ ] Scanner finds all files in folder
- [ ] File hashes calculated correctly
- [ ] Database updated with metadata
- [ ] Missing files marked as deleted
- [ ] Handles large folders (10k+ files)
- [ ] Graceful error handling

### Frontend Tests
- [ ] Files display from API
- [ ] Pagination works (prev/next)
- [ ] Folder navigation works
- [ ] Sync badges update in real-time
- [ ] Loading states show correctly
- [ ] Error messages display

### Integration Tests
- [ ] Create project → invite user
- [ ] User accepts invite
- [ ] Syncthing syncs folder
- [ ] Backend scans and populates DB
- [ ] Frontend shows files
- [ ] Badges show sync status
- [ ] Drill into folders works

---

## 🚀 Implementation Commands

### Start Backend Implementation
```bash
cd /home/fograin/work1/vidsync/cloud
npm install # if needed
touch src/services/syncthingScanner.ts
```

### Start Frontend Implementation
```bash
cd /home/fograin/work1/vidsync/electron
npm install # if needed
touch src/renderer/hooks/useRemoteFileList.ts
touch src/renderer/components/SyncStatusBadge.tsx
```

### Test During Development
```bash
# Backend TypeScript check
cd cloud && npx tsc --noEmit

# Frontend TypeScript check
cd electron && npx tsc --noEmit

# Run app
cd electron && npm start
```

---

## 📚 Documentation to Reference

- `PHASE2_IMPLEMENTATION_GUIDE.md` - Full implementation guide (you are here)
- `REMOTE_PROJECT_FILE_LIST_IMPLEMENTATION.md` - Architecture details
- `PHASE1_REMOTE_FILE_LIST_COMPLETE.md` - API endpoint details

---

## ⏱️ Time Estimates

| Task | Time | Notes |
|------|------|-------|
| Syncthing Scanner | 2h | Folder reading + DB upsert |
| Frontend Hook | 1.5h | Data fetching + state management |
| Badge Component | 1h | Simple MUI component |
| File Table Update | 1.5h | Add badge column to existing table |
| Pagination UI | 1h | Add page navigation |
| Folder Navigation | 1h | Drill-down with breadcrumbs |
| Real-Time Updates | 1h | File system watcher |
| Caching Layer | 0.5h | Simple Map-based cache |
| Testing | 2h | Manual + automated tests |
| Documentation | 1h | Code comments + guides |
| **Total** | **13h** | Spread across 3 days |

---

**Ready to start Phase 2? Begin with Step 1: Backend Scanner 🚀**
