# Remote Project File List Implementation - Comprehensive Guide

## 🎯 Objective
Show files from Syncthing-synced remote projects to invitees with excellent performance and sync status indicators.

---

## 📊 Architecture Overview

```
INVITEE (Your Device)
  ↓
Electron App (YourProjectsPage)
  ├─ Local Project → IPC → Instant ⚡
  └─ Remote Project → ?
       ↓
   Option A: Syncthing Folder Scanning
       ├─ Pros: Real-time sync status, local access, instant
       ├─ Cons: Need to manage folder path for invitees
       └─ Speed: ~10ms (same as local)
       ↓
   Option B: Cloud API + Metadata
       ├─ Pros: Owner controls what's visible, searchable metadata
       ├─ Cons: Network latency, need to keep metadata updated
       └─ Speed: 200-500ms (HTTP)
       ↓
   Option C: Hybrid (RECOMMENDED)
       ├─ Cloud: Owner publishes file list + metadata
       ├─ Syncthing: Invitee checks actual sync status locally
       ├─ Combined: Show all files + real sync status
       └─ Speed: 50-100ms (cache + local checks)
```

---

## 🏗️ Recommended Implementation: Hybrid Approach

### Phase 1: Backend - File Metadata Publishing
**What:** Owner's backend publishes file list from Syncthing folder

**When:** 
- On project creation
- On project share (when adding invitee)
- On scheduled sync (every 5 min or on Syncthing event)

**How:**
```typescript
// Cloud API - Scan owner's Syncthing folder and store metadata
POST /api/projects/:projectId/sync-files

// In owner's Syncthing folder:
// Get all files recursively
// Store in DB: remote_files table
// Include: path, size, hash, modified_time, is_deleted

// Endpoint for invitees:
GET /api/projects/:projectId/files?path=/&page=1&per_page=100
```

### Phase 2: Frontend - Smart File Discovery
**Local Invitee Discovery:**
```typescript
// 1. Fetch file list from cloud (metadata)
const cloudFiles = await api.get('/projects/:id/files');

// 2. Check local Syncthing folder for actual files
const syncthingPath = '~/.config/vidsync/syncthing/shared/Project:id'
const localFiles = await api.fsListDirectory(syncthingPath);

// 3. Merge: Use cloud metadata + local sync status
const merged = cloudFiles.map(cloudFile => {
  const localFile = localFiles.find(f => f.name === cloudFile.name);
  return {
    ...cloudFile,
    synced: !!localFile,  // ✓ or ✗
    size: localFile?.size || cloudFile.size,
    localPath: localFile?.fullPath,
  };
});
```

### Phase 3: Performance Optimization
**Caching Strategy:**
```
1st load: 
  ├─ Fetch from cloud (cached in memory)
  └─ Scan local folder
  └─ Response: ~100ms

Subsequent loads:
  ├─ Use memory cache (no network)
  └─ Check local folder (real-time)
  └─ Response: ~10ms

Cache invalidation:
  ├─ Manual refresh (user clicks button)
  └─ Syncthing event listener (folder changed)
  └─ Timer: refresh every 5 minutes
```

---

## 🔧 Implementation Steps

### Step 1: Determine Syncthing Path for Invitees

First, invitees need to know where the synced folder is. Two approaches:

**Approach A: Standard Path (Simpler)**
```typescript
// All projects sync to: ~/.config/vidsync/syncthing/shared/Project:{id}
const getSyncthingProjectPath = (projectId: string) => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homeDir, '.config/vidsync/syncthing/shared', `Project:${projectId}`);
};
```

**Approach B: Discover from Syncthing API**
```typescript
// Query Syncthing API to find folder
GET http://localhost:8384/rest/system/config
// Look for folders where label matches project ID
```

**Recommendation:** Use Approach A (simpler, faster)

---

### Step 2: Create Cloud API Endpoint for File List

```typescript
// cloud/src/api/projects/routes.ts

// GET /api/projects/:projectId/files - Paginated file list
router.get('/:projectId/files', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { path: folderPath = '/', page = 1, per_page = 100 } = req.query;
    const userId = (req as any).user.id;

    // Check access: owner or accepted member
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    const isOwner = project?.owner_id === userId;
    const { data: member } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .single();

    if (!isOwner && !member) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch file metadata from remote_files table
    const offset = (page - 1) * per_page;
    
    const { data: files, error: filesErr } = await supabase
      .from('remote_files')
      .select('*')
      .eq('project_id', projectId)
      .like('path', `${folderPath}%`)
      .is('deleted_by', null)  // Exclude deleted files
      .order('path')
      .range(offset, offset + per_page - 1);

    const { count } = await supabase
      .from('remote_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .like('path', `${folderPath}%`)
      .is('deleted_by', null);

    res.json({
      success: true,
      files: files || [],
      total: count || 0,
      page,
      per_page,
      has_more: offset + per_page < (count || 0),
    });
  } catch (error) {
    console.error('Get files exception:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});
```

---

### Step 3: Update Frontend to Show Remote Files with Sync Status

```typescript
// electron/src/renderer/pages/Projects/YourProjectsPage.tsx

const fetchProjectFiles = async (projectId: string) => {
  setFilesLoading(true);
  try {
    const project = projects.find(p => p.id === projectId);
    
    if (project?.local_path) {
      // LOCAL PROJECT - Use IPC (existing code)
      const result = await window.api.fsListDirectory(project.local_path, false);
      // ... existing code ...
    } else {
      // REMOTE PROJECT - New code
      
      // 1. Fetch file list from cloud API
      const response = await cloudAPI.get(`/projects/${projectId}/files`, {
        params: { path: '/', page: 1, per_page: 100 }
      });
      
      const cloudFiles = response.data.files || [];
      
      // 2. Try to find Syncthing folder locally
      let localFiles: DirectoryEntry[] = [];
      const syncthingPath = getSyncthingProjectPath(projectId);
      
      try {
        const localResult = await window.api.fsListDirectory(syncthingPath, false);
        if (localResult.success) {
          localFiles = localResult.entries || [];
        }
      } catch (e) {
        console.warn('Syncthing folder not yet synced:', syncthingPath);
        // Folder not synced yet, that's OK
      }
      
      // 3. Merge: Cloud metadata + local sync status
      const mergedFiles = cloudFiles.map((cloudFile: FileItem) => {
        const localFile = localFiles.find(f => f.name === cloudFile.name);
        
        return {
          ...cloudFile,
          synced: !!localFile,
          syncStatus: localFile ? 'synced' : 'syncing',
          size: localFile?.size || cloudFile.size,
          fullPath: localFile?.fullPath,
        };
      });
      
      // Also include local files not yet in cloud (uploading)
      const localOnlyFiles = localFiles.filter(lf => 
        !cloudFiles.find(cf => cf.name === lf.name)
      );
      
      const allFiles = [...mergedFiles, ...localOnlyFiles];
      
      setFiles(allFiles);
      setCurrentPath(allFiles);
      setPathBreadcrumbs(['']);
      setNavigationHistory([allFiles]);
    }
  } catch (error) {
    console.error('Failed to fetch files:', error);
    setFiles([]);
  } finally {
    setFilesLoading(false);
  }
};

// Helper function
const getSyncthingProjectPath = (projectId: string): string => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const platform = (window as any).process?.platform || process.platform;
  
  const syncthingDir = path.join(
    homeDir,
    platform === 'win32' ? 'AppData\\Local' : '.config',
    'vidsync',
    'syncthing',
    'shared'
  );
  
  return path.join(syncthingDir, `Project:${projectId}`);
};
```

---

### Step 4: Update File Navigation for Remote Projects

```typescript
const handleOpenFolder = async (folder: FileItem & { fullPath?: string }) => {
  if (folder.type === 'folder') {
    const project = selectedProject;
    
    if (project?.local_path) {
      // LOCAL PROJECT - Existing code
      // ... existing IPC code ...
    } else {
      // REMOTE PROJECT - New code
      
      // Get folder path from breadcrumbs
      const folderPath = pathBreadcrumbs.join('/') + '/' + folder.name;
      
      try {
        setFilesLoading(true);
        
        // 1. Fetch metadata from cloud
        const response = await cloudAPI.get(`/projects/${project.id}/files`, {
          params: { path: folderPath, page: 1, per_page: 100 }
        });
        
        const cloudFiles = response.data.files || [];
        
        // 2. Check local Syncthing folder
        let localFiles: DirectoryEntry[] = [];
        if (folder.fullPath) {
          try {
            const localResult = await window.api.fsListDirectory(folder.fullPath, false);
            if (localResult.success) {
              localFiles = localResult.entries || [];
            }
          } catch (e) {
            // Folder not yet synced
          }
        }
        
        // 3. Merge files
        const mergedFiles = cloudFiles.map((cf: FileItem) => ({
          ...cf,
          synced: !!localFiles.find(lf => lf.name === cf.name),
        }));
        
        setCurrentPath(mergedFiles);
        setPathBreadcrumbs([...pathBreadcrumbs, folder.name]);
        setNavigationHistory([...navigationHistory, mergedFiles]);
      } catch (error) {
        console.error('Failed to open folder:', error);
      } finally {
        setFilesLoading(false);
      }
    }
  }
};
```

---

### Step 5: Add Sync Status Badge

```typescript
interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  fullPath?: string;
  children?: FileItem[];
  synced?: boolean;        // NEW
  syncStatus?: string;     // 'synced' | 'syncing' | 'waiting'
}

// In render, add status badge:
<TableCell>
  {item.synced !== undefined && (
    <Chip
      icon={item.synced ? '✓' : '⟳'}
      label={item.synced ? 'Synced' : 'Syncing'}
      color={item.synced ? 'success' : 'warning'}
      size="small"
    />
  )}
</TableCell>
```

---

## 📋 Database Schema Updates Needed

```sql
-- Create remote_files table
CREATE TABLE remote_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  path TEXT NOT NULL,              -- e.g., "folder/subfolder/file.txt"
  name TEXT NOT NULL,
  size BIGINT,
  is_directory BOOLEAN DEFAULT false,
  mime_type TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  file_hash TEXT,                  -- SHA256 for dedup
  created_at TIMESTAMP DEFAULT now(),
  modified_at TIMESTAMP,
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMP,
  
  UNIQUE(project_id, path),
  CHECK (deleted_by IS NULL OR deleted_at IS NOT NULL)
);

CREATE INDEX idx_remote_files_project_path ON remote_files(project_id, path);
```

---

## 🚀 Performance Analysis

### Load Times
```
Scenario 1: Fresh load (10k files)
├─ Cloud API: 200ms (paginated, cached)
├─ Syncthing scan: 50ms (if folder synced)
├─ Merge: 10ms
└─ Total: ~260ms ✅ Good

Scenario 2: Cached load
├─ Memory cache: 5ms (no network)
├─ Local scan: 10ms
├─ Merge: 5ms
└─ Total: ~20ms ✅ Excellent

Scenario 3: Paginated (100 items per page)
├─ Cloud API: 50ms (fast, paginated)
├─ Local scan: 10ms
├─ Merge: 2ms
└─ Total: ~62ms ✅ Responsive
```

### Caching Strategy
```
L1: Memory cache (5-10 min TTL)
  ├─ File list from cloud
  └─ Invalidate on: manual refresh, Syncthing event

L2: IndexedDB (persistent)
  ├─ Store file metadata
  └─ Survives app restart

L3: Syncthing cache
  ├─ Real-time folder scanning
  └─ Direct OS access, no network
```

---

## 🎯 Key Points

✅ **For Invitees:**
- See all files from owner's folder
- Real-time sync status
- Instant navigation (once synced locally)
- Works offline (with cached metadata)

✅ **Performance:**
- First load: ~260ms (acceptable)
- Cached load: ~20ms (excellent)
- Per-page navigation: ~62ms (responsive)
- Pagination handles 10k+ files easily

✅ **No Owner Setup Needed:**
- Automatic metadata updates
- Syncthing handles actual file sync
- Cloud keeps metadata in sync

✅ **Data Privacy:**
- Only invited members see files
- Owner controls access
- Files shown based on project membership

---

## ⏰ Implementation Timeline

1. **Phase 1 (1-2 days):** Database schema + Cloud API endpoint
2. **Phase 2 (1-2 days):** Frontend file list + sync status
3. **Phase 3 (1 day):** Caching + pagination
4. **Phase 4 (0.5 days):** Testing + optimization

---

## 🧪 Testing Checklist

- [ ] Create local project → invite user
- [ ] Invitee sees files (from cloud metadata)
- [ ] Syncthing folder appears in invitee's Syncthing
- [ ] Files show "Syncing" until downloaded
- [ ] Files show "Synced" ✓ once downloaded
- [ ] Navigation works for nested folders
- [ ] Pagination works with 10k+ files
- [ ] Memory cache improves performance
- [ ] Manual refresh updates file list
- [ ] Sync status updates in real-time

---

**Status: Ready for implementation**

This hybrid approach combines the best of both worlds:
- **Cloud metadata** for availability and search
- **Local Syncthing** for real sync status and performance
- **Pagination** for 10k+ file handling
- **Caching** for responsiveness

All while maintaining excellent performance and user experience.
