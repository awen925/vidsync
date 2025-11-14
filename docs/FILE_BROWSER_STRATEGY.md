# File Browser Strategy: Local vs Remote Projects

## Current Architecture

### Local Projects (Your Projects)
- Projects where the user is the **owner**
- Files exist on the user's local machine at `project.local_path`
- Should use **OS module directly** via Electron IPC for performance

### Invited Projects (Invited Projects)
- Projects where the user is a **member** (not owner)
- Files are synced via **Syncthing** to a local cache folder
- Need smart caching strategy to avoid performance issues

---

## Strategy 1: Local Projects - Direct OS Access (FAST)

### Implementation
1. **Enhance `fs:scanDirTree` IPC handler** in `electron/src/main/main.ts`
   - Use Node.js `fs` module to recursively scan directory
   - Return full tree structure with metadata (size, modified date)
   - Support configurable depth limit
   - Run on main process (no blocking UI)

2. **Update Frontend** to use IPC instead of API
   - Replace `/api/projects/:id/files` calls with `window.api.fsReadDirTree()`
   - Keep navigation history in React state (already implemented)

### Advantages
✅ Instant response (no network latency)
✅ Direct access to actual local files
✅ Can show real-time changes without polling
✅ No API overhead
✅ Handles arbitrarily deep directories

### Code Structure
```typescript
// IPC Handler
ipcMain.handle('fs:scanDirTree', async (_ev, dirPath: string, maxDepth: number = 5) => {
  // Recursively scan with metadata
  // Return { files: FileItem[] }
})

// FileItem interface
interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  children?: FileItem[];
}
```

---

## Strategy 2: Invited Projects - Smart Caching (PERFORMANT)

### Problem
- Can't use local path API (user doesn't have `project.local_path` stored)
- Files are synced to a cache folder via Syncthing
- Full tree scan for every request is expensive

### Three-Tier Solution

#### Tier 1: Directory Caching (IndexedDB)
Store file metadata in browser IndexedDB:
- Key: `{projectId}:{folderPath}`
- Value: `{ files: FileItem[], timestamp, version }`
- TTL: 5 minutes or invalidated by Syncthing events

#### Tier 2: Change Detection (Syncthing Events)
Use existing Syncthing event monitoring:
- Subscribe to sync completion events
- On completion, invalidate project cache
- Re-scan only affected paths

#### Tier 3: Lazy Loading
Only fetch what user sees:
- Fetch root directory immediately
- Fetch subdirectories only when user clicks
- Batch requests for visible items

### API Design for Invited Projects
```typescript
// New endpoint: GET /api/projects/:projectId/cache/files
// Returns files from cache if valid, scans if needed
// Query params:
//   - folderPath: '/' or relative path
//   - cacheVersion: timestamp for validation
//   - includeSize: boolean (skip for large trees)

Response:
{
  files: FileItem[],
  cacheKey: string,
  cacheExpires: number,
  isFromCache: boolean
}
```

### Frontend Cache Manager
```typescript
class RemoteFileCache {
  private db: IDBDatabase;
  
  async getFiles(projectId, folderPath, options) {
    const cached = await this.getFromIndexedDB(projectId, folderPath);
    if (cached && !this.isExpired(cached)) {
      return cached.files;
    }
    
    const fresh = await cloudAPI.get(`/projects/${projectId}/cache/files`, {
      folderPath, cacheVersion: cached?.version
    });
    
    await this.saveToIndexedDB(projectId, folderPath, fresh);
    return fresh.files;
  }
  
  invalidateProject(projectId) {
    // Called when Syncthing completes sync
    // Clears all entries for this project
  }
}
```

---

## Implementation Priority

### Phase 1 (IMMEDIATE): Local Projects
1. Create `fs:scanDirTree` IPC handler ✅
2. Update `YourProjectsPage` to use IPC ✅
3. Remove `/api/projects/:id/files` API call

### Phase 2 (NEXT): Invited Projects Cache
1. Create `project_invites` table (if not exists) ✅
2. Add cache endpoint to cloud API
3. Implement IndexedDB cache on frontend
4. Add Syncthing event listener for cache invalidation

---

## File Structure After Implementation

```
electron/
├── src/
│   ├── main/
│   │   ├── main.ts (updated: fs:scanDirTree handler)
│   │   └── fileScanner.ts (new: recursive dir scanner)
│   └── renderer/
│       ├── hooks/
│       │   └── useLocalFileTree.ts (new: IPC wrapper)
│       │   └── useRemoteFileCache.ts (new: IndexedDB cache)
│       └── pages/Projects/
│           ├── YourProjectsPage.tsx (updated: use IPC)
│           └── InvitedProjectsPage.tsx (updated: use cache)

cloud/
└── src/api/projects/
    └── routes.ts (updated: add cache endpoint)
```

---

## Performance Metrics

### Local Projects
- **Time to display root**: < 100ms (direct OS access)
- **Time to navigate deeper**: < 50ms (already scanned)
- **Memory**: Depends on tree depth (configurable)

### Invited Projects (with caching)
- **First load**: API call + network latency
- **Subsequent loads**: < 5ms (IndexedDB)
- **After Syncthing sync**: Cache invalidated, next call updates

### Comparison vs Current API Approach
| Metric | Current | New |
|--------|---------|-----|
| Local root display | ~200ms (API + Network) | <100ms (IPC) |
| Invited root display | ~200ms (API + Network) | ~200ms (first), <5ms (cached) |
| Deep navigation | Broken at depth 4 | Works at any depth |
| Memory | Full tree in RAM | Only visible nodes + cache |
