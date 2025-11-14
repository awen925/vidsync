# Remote File List Implementation Checklist

## Overview
Implementing file list for invitees on remote projects using hybrid approach (cloud metadata + local Syncthing scanning).

---

## Phase 1: Database & Cloud API

### 1.1 Database Schema
- [ ] Create `remote_files` table in Supabase
  - [ ] Fields: id, project_id, path, name, size, is_directory, mime_type, owner_id, file_hash, created_at, modified_at, deleted_by, deleted_at
  - [ ] Indexes: idx_remote_files_project_path (project_id, path)
  - [ ] Constraints: UNIQUE(project_id, path), CHECK deleted_by logic

- [ ] Create `file_synced_devices` table (for tracking)
  - [ ] Fields: id, file_id, device_id, synced_at, synced_bytes

### 1.2 Cloud API Endpoint - File List
- [ ] Create `GET /api/projects/:projectId/files` endpoint
  - [ ] Query params: path, page, per_page (default 100)
  - [ ] Authentication: Verify owner or accepted member
  - [ ] Returns: files[], total, page, per_page, has_more
  - [ ] Pagination: offset = (page - 1) * per_page

- [ ] Test endpoint with curl:
  ```bash
  curl http://localhost:3000/api/projects/abc123/files?path=/&page=1&per_page=100
  ```

### 1.3 File Scanning Job (Cloud Function)
- [ ] Create Cloud Function to scan owner's Syncthing folder
  - [ ] Triggered: On project creation, on invite, every 5 min
  - [ ] Scans: Syncthing folder for project
  - [ ] Updates: remote_files table with new files
  - [ ] Marks: Files as deleted if removed from Syncthing

- [ ] Implement helper function:
  ```typescript
  async function scanAndStoreFiles(projectId: string, syncthingPath: string)
  ```

---

## Phase 2: Frontend - File Display

### 2.1 Add Helper Function
- [ ] Create `getSyncthingProjectPath()` function
  - [ ] Handles: Windows, Mac, Linux paths
  - [ ] Input: projectId
  - [ ] Output: ~/.config/vidsync/syncthing/shared/Project:id

### 2.2 Update `fetchProjectFiles()` Function
- [ ] Detect: Is project local or remote?
  - [ ] Local: Use existing IPC code
  - [ ] Remote: New cloud API + Syncthing merge logic

- [ ] For remote projects:
  - [ ] Fetch file metadata from cloud API
  - [ ] Scan local Syncthing folder
  - [ ] Merge: Add `synced`, `syncStatus`, `fullPath` to files
  - [ ] Include local-only files (uploading)

### 2.3 Update `handleOpenFolder()` Function
- [ ] For remote projects:
  - [ ] Build folder path from breadcrumbs
  - [ ] Fetch child files from cloud API
  - [ ] Scan local Syncthing subfolder
  - [ ] Merge sync status
  - [ ] Update breadcrumbs and navigation history

### 2.4 Add Sync Status Badge
- [ ] Display badge for each file:
  - [ ] ✓ Green: Synced
  - [ ] ⟳ Blue: Syncing (in progress)
  - [ ] ⚠ Amber: Waiting (queued)
  - [ ] ✗ Red: Not synced (if error)

---

## Phase 3: Performance & Caching

### 3.1 Memory Cache
- [ ] Add state variable: `fileListCache`
  - [ ] Key: `projectId:path`
  - [ ] Value: `{ files, timestamp }`
  - [ ] TTL: 5 minutes

- [ ] Implement cache check before API call:
  ```typescript
  const cached = fileListCache[`${projectId}:${path}`];
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.files;
  }
  ```

### 3.2 Manual Refresh Button
- [ ] Add "Refresh" button in file browser
  - [ ] Clears memory cache entry
  - [ ] Re-fetches from cloud API
  - [ ] Re-scans Syncthing folder
  - [ ] Updates UI

### 3.3 Pagination
- [ ] Add pagination controls
  - [ ] Show: Page X of Y
  - [ ] Previous/Next buttons
  - [ ] Jump to page input
  - [ ] Items per page dropdown (100, 250, 500)

### 3.4 Virtual Scrolling (For 10k+ files)
- [ ] Install: react-window library
- [ ] Wrap file list in FixedSizeList
  - [ ] Item height: ~40px
  - [ ] Visible items: ~20 at a time
  - [ ] Rendering: Only visible + buffer

---

## Phase 4: Real-time Updates

### 4.1 Syncthing Event Listener
- [ ] Listen for Syncthing folder changes
  - [ ] Via IPC: Syncthing API polling
  - [ ] Via IPC: File system watcher
  - [ ] Updates: Sync status in real-time

- [ ] Invalidate cache on changes:
  ```typescript
  window.api.onSyncthingEvent(() => {
    clearFileListCache();
    refreshUI();
  });
  ```

### 4.2 Update Badges on Sync
- [ ] Watch for file sync completion
  - [ ] When file size matches cloud metadata
  - [ ] Update UI: ✓ Synced badge
  - [ ] Transition smoothly

---

## Phase 5: Error Handling

### 5.1 Graceful Degradation
- [ ] If Syncthing folder not found:
  - [ ] Show files from cloud
  - [ ] Display "Waiting for sync" message
  - [ ] Hide sync status (not yet synced)

- [ ] If cloud API fails:
  - [ ] Show files from local cache
  - [ ] Display "Offline mode" banner
  - [ ] Offer manual refresh when online

### 5.2 Permission Errors
- [ ] Handle Syncthing folder access denied
  - [ ] Show error message
  - [ ] Suggest: Check folder permissions
  - [ ] Provide: Browse button for manual folder selection

---

## Phase 6: Testing

### 6.1 Unit Tests
- [ ] Test `getSyncthingProjectPath()` for all platforms
- [ ] Test file merge logic (cloud + local)
- [ ] Test cache invalidation
- [ ] Test pagination calculations

### 6.2 Integration Tests
- [ ] Create project locally → Invite user
- [ ] Invitee accepts invite
- [ ] Invitee sees file list from cloud
- [ ] Invitee's Syncthing folder syncs
- [ ] File badges update ✓ → ⟳ → ✓
- [ ] Navigation into nested folders works
- [ ] Pagination shows correct subset
- [ ] Virtual scrolling renders efficiently

### 6.3 Performance Tests
- [ ] Load time: 1k files < 100ms
- [ ] Load time: 10k files < 250ms
- [ ] Cache hit: < 20ms
- [ ] Scroll: 10k files, 60 FPS

### 6.4 Edge Cases
- [ ] Empty folder (0 files)
- [ ] Very large folder (100k files)
- [ ] Special characters in filenames
- [ ] Symlinks in Syncthing folder
- [ ] File deleted mid-scroll
- [ ] Network interruption mid-load
- [ ] Syncthing not running
- [ ] Syncthing folder not shared yet

---

## Phase 7: Documentation

### 7.1 Code Comments
- [ ] Comment hybrid approach logic
- [ ] Document cache strategy
- [ ] Explain merge algorithm
- [ ] Add examples for future maintainers

### 7.2 User Documentation
- [ ] Explain sync status badges
- [ ] Document refresh button
- [ ] Explain pagination
- [ ] Troubleshooting guide

---

## Detailed Implementation Guide

### Step 1: Syncthing Path Helper

**File: `electron/src/renderer/pages/Projects/YourProjectsPage.tsx`**

```typescript
const getSyncthingProjectPath = (projectId: string): string => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const platform = (window as any).process?.platform || 'linux';
  
  let configDir = '';
  if (platform === 'win32') {
    configDir = path.join(homeDir, 'AppData', 'Local');
  } else if (platform === 'darwin') {
    configDir = path.join(homeDir, 'Library', 'Application Support');
  } else {
    configDir = path.join(homeDir, '.config');
  }
  
  return path.join(configDir, 'vidsync', 'syncthing', 'shared', `Project:${projectId}`);
};
```

### Step 2: File Merge Logic

```typescript
interface FileWithStatus extends FileItem {
  synced?: boolean;
  syncStatus?: 'synced' | 'syncing' | 'waiting';
  cloudMetadata?: {
    size: number;
    modified_at: string;
  };
}

const mergeCloudAndLocalFiles = (
  cloudFiles: FileItem[],
  localFiles: DirectoryEntry[]
): FileWithStatus[] => {
  const localMap = new Map(localFiles.map(f => [f.name, f]));
  
  return cloudFiles.map(cf => ({
    ...cf,
    synced: localMap.has(cf.name),
    syncStatus: localMap.has(cf.name) ? 'synced' : 'syncing',
    cloudMetadata: {
      size: cf.size,
      modified_at: cf.modified,
    },
  }));
};
```

### Step 3: Fetch with Fallback

```typescript
const fetchProjectFilesHybrid = async (
  projectId: string,
  folderPath: string = '/'
) => {
  try {
    setFilesLoading(true);
    
    // Try cloud API first
    let cloudFiles: FileItem[] = [];
    try {
      const response = await cloudAPI.get(`/projects/${projectId}/files`, {
        params: { path: folderPath, page: 1, per_page: 100 }
      });
      cloudFiles = response.data.files || [];
    } catch (cloudError) {
      console.warn('Cloud API failed, falling back to local:', cloudError);
      // Could fail due to network, but we can still show local files
    }
    
    // Try local Syncthing folder
    let localFiles: DirectoryEntry[] = [];
    const syncthingPath = getSyncthingProjectPath(projectId);
    
    try {
      const localResult = await window.api.fsListDirectory(syncthingPath, false);
      if (localResult.success) {
        localFiles = localResult.entries || [];
      }
    } catch (localError) {
      console.warn('Local folder not accessible:', syncthingPath);
    }
    
    // If we have either, show merged result
    if (cloudFiles.length > 0 || localFiles.length > 0) {
      const merged = mergeCloudAndLocalFiles(cloudFiles, localFiles);
      setFiles(merged);
    } else {
      setFiles([]);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  } finally {
    setFilesLoading(false);
  }
};
```

---

## Implementation Order (Recommended)

1. ✅ **Day 1 Morning:** Database schema + API endpoint
2. ✅ **Day 1 Afternoon:** Frontend helper + file fetch logic
3. ✅ **Day 2 Morning:** Navigation + pagination
4. ✅ **Day 2 Afternoon:** Caching + sync badges
5. ✅ **Day 3 Morning:** Testing + edge cases
6. ✅ **Day 3 Afternoon:** Documentation + performance tuning

---

## Success Criteria

✅ Invitees can see all files from owner's shared folder
✅ Files show accurate sync status (✓ / ⟳ / ⚠ / ✗)
✅ Can navigate into nested folders
✅ Performance: First load < 300ms, cached < 20ms
✅ Handles 10k+ files without slowdown
✅ Works offline (with cached metadata)
✅ Graceful degradation if Syncthing not synced
✅ All edge cases handled

---

**Status:** Ready to implement - Start with Phase 1
