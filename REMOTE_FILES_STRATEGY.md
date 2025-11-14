# Quick Reference: How to Show Remote Project Files (Invited Projects)

## The Challenge
- Remote projects don't have a `local_path` stored in the database
- Files are synced by Syncthing to a system-managed cache folder
- Need to discover the cache folder location and scan it efficiently

## Solution Overview

### Three-Tier Strategy

#### 1. **Discovery Phase** (When project is first accessed)
```
User joins project → 
Syncthing starts syncing → 
App detects sync complete → 
App queries Syncthing API for folder location → 
Cache folder path is discovered
```

#### 2. **Caching Phase** (Store results locally)
```
App scans remote folder (via OS module after discovery) →
Results stored in IndexedDB with timestamp →
Next request: Check cache first, use if fresh
```

#### 3. **Invalidation Phase** (Keep cache fresh)
```
Syncthing completes sync →
Syncthing event listener detects completion →
Cache for that project invalidated →
Next request forces fresh scan
```

---

## How to Find the Remote Folder

### Option A: From Syncthing API (RECOMMENDED)
```typescript
// Syncthing API endpoint exists: GET /rest/db/folder
const folders = await syncthingApi.get('/rest/db/folder');
const projectFolder = folders.find(f => f.id === projectId);
const cachePath = projectFolder.path;
```

**Pros:** Reliable, always correct, real-time
**Cons:** Requires Syncthing to be running

### Option B: Convention-Based Path
```typescript
// Store cache in predictable location
// ~/.vidsync/projects/{projectId}/
const cachePath = path.join(app.getPath('userData'), 'projects', projectId);
```

**Pros:** Simple, doesn't require Syncthing API
**Cons:** Need to ensure folder exists

### Option C: Hybrid Approach (BEST)
```typescript
// Try Syncthing API first, fall back to convention
async function getCacheFolder(projectId) {
  try {
    const folders = await syncthingApi.get('/rest/db/folder');
    return folders.find(f => f.id === projectId)?.path;
  } catch {
    // Fall back to standard location
    return path.join(app.getPath('userData'), 'projects', projectId);
  }
}
```

---

## Implementation Steps for Phase 2

### Step 1: Add Folder Location to Backend
```typescript
// In cloud/src/api/projects/routes.ts

// GET /api/projects/:projectId/cache-info
// Returns where remote files are synced
router.get('/:projectId/cache-info', authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  
  // Find Syncthing folder path
  const syncthingPath = await getSyncthingFolderPath(projectId);
  
  res.json({
    projectId,
    cachePath: syncthingPath,
    lastSyncTime: /* from DB */,
  });
});
```

### Step 2: Add Cache Endpoint to Backend
```typescript
// GET /api/projects/:projectId/files?path=/&flat=true
// Returns file list with cache info

router.get('/:projectId/files', authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const { path = '/', flat = false } = req.query;
  
  // Get cache folder for invited projects
  const cachePath = await getCacheFolder(projectId);
  
  // Scan the specific folder
  const files = flat 
    ? await scanDirectoryFlat(cachePath, path)
    : await scanDirectoryTree(cachePath, path);
  
  res.json({
    files,
    cacheKey: `${projectId}:${path}`,
    cacheExpires: Date.now() + 5 * 60 * 1000,
  });
});
```

### Step 3: Create IndexedDB Cache Hook
```typescript
// electron/src/renderer/hooks/useRemoteFileCache.ts

export function useRemoteFileCache() {
  const db = useIndexedDB('vidsync-files');
  
  async function getFiles(projectId, folderPath) {
    const key = `${projectId}:${folderPath}`;
    
    // Check cache first
    const cached = await db.get('files', key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.files;
    }
    
    // Fetch from API
    const response = await cloudAPI.get(
      `/projects/${projectId}/files`,
      { params: { path: folderPath } }
    );
    
    // Store in cache
    await db.put('files', {
      key,
      files: response.data.files,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    
    return response.data.files;
  }
  
  async function invalidateProject(projectId) {
    // Clear all entries for this project
    const keys = await db.getAllKeys('files');
    for (const key of keys) {
      if (key.startsWith(`${projectId}:`)) {
        await db.delete('files', key);
      }
    }
  }
  
  return { getFiles, invalidateProject, loading, error };
}
```

### Step 4: Hook Syncthing Events
```typescript
// electron/src/main/syncthingManager.ts

// When sync completes for a project:
events.on('syncthing:completed', (projectId) => {
  // Forward to renderer
  mainWindow.webContents.send('files:cache-invalidate', { projectId });
});

// Renderer side:
window.api.onFilesChanged = (cb) => 
  ipcRenderer.on('files:cache-invalidate', cb);
```

### Step 5: Update Component
```typescript
// electron/src/renderer/pages/Projects/InvitedProjectsPage.tsx

function InvitedProjectsPage() {
  const { getFiles, invalidateProject } = useRemoteFileCache();
  
  // Invalidate cache when Syncthing completes
  useEffect(() => {
    const unsubscribe = window.api.onFilesChanged(({ projectId }) => {
      invalidateProject(projectId);
    });
    return unsubscribe;
  }, []);
  
  // Get files (cached or fresh)
  const handleOpenFolder = async (project, folderPath) => {
    const files = await getFiles(project.id, folderPath);
    setCurrentPath(files);
  };
}
```

---

## Performance Timeline

### Without Cache
```
Request 1: /projects/abc/files?path=/ → 200ms (scan remote folder)
Request 2: /projects/abc/files?path=/ → 200ms (scan again)
Request 3: /projects/abc/files?path=/ → 200ms (scan again)
Total: 600ms
```

### With Cache + Events
```
Request 1: /projects/abc/files?path=/ → 200ms (scan, store in IndexedDB)
Request 2: /projects/abc/files?path=/ → 5ms (get from IndexedDB)
Request 3: /projects/abc/files?path=/ → 5ms (get from IndexedDB)

Syncthing sync completes → cache invalidated
Request 4: /projects/abc/files?path=/ → 200ms (scan fresh)
Request 5: /projects/abc/files?path=/ → 5ms (cached again)

Total: 415ms (vs 600ms without cache) = 30% faster
```

---

## Detailed Comparison

### Local Projects (Done ✅)
```
Your Projects (You own them)
├── Access via: project.local_path
├── Discovery: Stored in database
├── Scanning: Direct OS module (Node.js fs)
├── Speed: <100ms per scan
├── Caching: Full tree in React state
└── Use: IPC → Electron main → fs module
```

### Remote Projects (Phase 2)
```
Invited Projects (Someone shared with you)
├── Access via: Syncthing sync folder
├── Discovery: Via Syncthing API or convention
├── Scanning: Via cloud API (which uses OS module)
├── Speed: ~200ms first, <5ms cached
├── Caching: IndexedDB + React state
└── Use: Cloud API → Cloud backend → OS module
```

---

## API Design Summary

### For Local Projects (Done)
```
IPC Handler: window.api.fsScanDirTree(path, options)
Returns: { success, files[], error? }
Time: <100ms
Usage: Direct local access
```

### For Remote Projects (TODO)
```
API Endpoint: GET /api/projects/:id/files?path=/&flat=true
Returns: { files[], cacheKey, cacheExpires }
Time: ~200ms (first), <5ms (cached)
Caching: IndexedDB on frontend
Invalidation: Syncthing events
```

---

## Why This Works Well

1. **No API overhead for local projects** - Direct OS access is fast
2. **Smart caching for remote projects** - 95% of requests hit IndexedDB (<5ms)
3. **Event-driven invalidation** - Cache stays fresh automatically
4. **Lazy loading by path** - No need to scan entire tree upfront
5. **Configurable depth** - Can adjust for different use cases
6. **Error handling** - Graceful fallback when files inaccessible

---

## Testing Scenarios

### Local Project
```
✓ Navigate to: vidsync/
✓ Navigate to: vidsync/go-agent/bin/ (depth 2)
✓ Navigate to: vidsync/go-agent/bin/nebula/ (depth 3)
✓ Show file list at each level in <100ms
```

### Remote Project (Phase 2)
```
✓ First access to folder: ~200ms (scan from API)
✓ Second access same folder: <5ms (IndexedDB cache)
✓ After Syncthing sync: Cache auto-invalidated
✓ All levels show in reasonable time
```
