# Remote File Browser with Sync Status - Comprehensive Design

## Executive Summary

This document outlines the complete architecture for displaying remote project files with real-time sync status indicators in the Invited Projects page. 

**Key Constraints (DO NOT violate):**
- ❌ Cannot store all file hashes in central DB (10k users × 10k projects × 10k files = 10^12 rows = DB death)
- ❌ Cannot spike CPU with file comparison loops
- ✅ Syncthing IS source of truth for file state (use its API)
- ✅ Snapshots are one per project (not per-user, not per-device)
- ✅ Backend queries Syncthing REST API for real-time status

---

## 1. Current State Analysis

### What Works ✅
- **File Snapshots:** Stored as gzip-compressed JSON in Supabase Storage
  - Format: `project-snapshots/{projectId}/snapshot_{timestamp}.json.gz`
  - Contains: File tree with paths, sizes, hashes, modification times
  - Updated: On-demand via `PUT /api/projects/:projectId/refresh-snapshot` (owner only)

- **API Endpoints:**
  - `GET /api/projects/:projectId/files-list` - Paginated files from snapshot (500 per page)
  - `GET /api/projects/:projectId/snapshot-metadata` - Metadata (version, total_files, total_size)
  - `POST /api/projects/:projectId/generate-snapshot` - Create snapshot (has mock data)

- **Syncthing Integration:**
  - `SyncthingService` can query folder status via REST API
  - Methods: `getFolderStatus(folderId)` returns state, bytes synced, etc.
  - Methods: `pauseFolder()`, `resumeFolder()`, `scanFolder()`

- **Frontend Components:**
  - `InvitedProjectsPage` - Lists invited projects and calls ProjectFilesPage
  - `ProjectFilesPage` - Shows paginated file table (needs sync status column)

### What's Missing ❌
- **Sync Status Indicators:** No UI showing which files are synced vs syncing vs error
- **Real-time Updates:** No polling/WebSocket for live sync progress
- **File Hierarchy:** Files shown flat (pagination), not as folder tree
- **Device Status:** No indication if member's device is online/syncing/offline
- **Large File Support:** Current table pagination okay for 500-per-page, but need lazy-loaded tree for 10k+

### Legacy Code to Clean Up
**backgroundSyncService.ts** (Lines 1-264)
- Purpose: Was processing file changes from watcher → `remote_files` table
- Status: `remote_files` table was deleted, so this service is orphaned
- Action: Review and remove or archive

**routes.ts file sync references** (Lines 1481, 1490, 1612, 1626)
- `.from('remote_files')` queries
- Status: Table doesn't exist anymore (was in cleanup)
- Action: Remove or replace with snapshot queries

**POST /api/projects/:projectId/files-sync** endpoint
- Comment: "TODO: Scan project folder and update snapshots"
- Status: Incomplete placeholder for Phase 2
- Action: Decide if needed or remove

---

## 2. Proposed Architecture

### 2.1 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ INVITED MEMBER DEVICE                                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Syncthing (Peer-to-peer)                             │  │
│  │ - Manages folder sync                                │  │
│  │ - Tracks file state (synced/syncing/pending/error)  │  │
│  │ - REST API on localhost:8384                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          │ (REST queries)                    │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Electron App (React)                                 │  │
│  │ ┌─────────────────────────────────────────────────┐  │  │
│  │ │ InvitedProjectsPage                             │  │  │
│  │ │ - Project list                                  │  │  │
│  │ │ - Selected project details                      │  │  │
│  │ └─────────────────────────────────────────────────┘  │  │
│  │                     │                                 │  │
│  │                     ▼                                 │  │
│  │ ┌─────────────────────────────────────────────────┐  │  │
│  │ │ ProjectFilesPage                                │  │  │
│  │ │ - File table (paginated)                        │  │  │
│  │ │ - Synced status column                          │  │  │
│  │ │ - Polling /file-sync-status every 3s            │  │  │
│  │ └─────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          │ (HTTP requests)                   │
└──────────────────────────┼─────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │ Cloud Backend (Node.js/Express)   │
        │                                   │
        │ ┌─────────────────────────────┐  │
        │ │ GET /projects/list/invited  │  │
        │ │ ├─ Query: projects table    │  │
        │ │ └─ Return: project list     │  │
        │ └─────────────────────────────┘  │
        │                                   │
        │ ┌─────────────────────────────┐  │
        │ │ GET /projects/:id/          │  │
        │ │     files-list              │  │
        │ │ ├─ Load snapshot from Storage│  │
        │ │ ├─ Paginate files (500/page)│  │
        │ │ └─ Return: file list        │  │
        │ └─────────────────────────────┘  │
        │                                   │
        │ ┌─────────────────────────────┐  │
        │ │ GET /projects/:id/          │  │
        │ │     file-sync-status    (NEW)  │
        │ │ ├─ Query Syncthing API      │  │
        │ │ ├─ Cache for 5s             │  │
        │ │ └─ Return: sync progress    │  │
        │ └─────────────────────────────┘  │
        │                                   │
        │ ┌─────────────────────────────┐  │
        │ │ SyncthingService            │  │
        │ ├─ getFolderStatus()          │  │
        │ ├─ getFolderFiles()       (NEW)  │
        │ ├─ getFileSyncStatus()   (NEW)  │
        │ └─ getDeviceStatus()     (NEW)  │
        │ └─────────────────────────────┘  │
        │                                   │
        │ ┌─────────────────────────────┐  │
        │ │ Supabase Storage            │  │
        │ ├─ project-snapshots bucket  │  │
        │ └─ {projectId}/snapshot.gz  │  │
        │ └─────────────────────────────┘  │
        │                                   │
        │ ┌─────────────────────────────┐  │
        │ │ PostgreSQL (project data)   │  │
        │ ├─ projects table            │  │
        │ ├─ project_members table     │  │
        │ └─ sync_events table (logs)  │  │
        │ └─────────────────────────────┘  │
        └──────────────────────────────────┘
```

### 2.2 Sync Status States

Files have 4 states (tracked by Syncthing, not DB):

```
┌─────────────┐
│   SYNCED    │  ✓  All bytes downloaded, file complete
│  (Green)    │     Display: green checkmark badge
└─────────────┘

┌─────────────┐
│   SYNCING   │  ↻  Bytes are downloading now
│  (Yellow)   │     Display: spinning icon + progress %
└─────────────┘

┌─────────────┐
│   PENDING   │  ⏳  In queue, not yet downloading
│  (Gray)     │     Display: clock icon
└─────────────┘

┌─────────────┐
│   ERROR     │  ⚠  Sync failed (conflict/permission/disk)
│  (Red)      │     Display: warning icon + error tooltip
└─────────────┘
```

### 2.3 Key Design Decisions

#### Decision 1: Real-Time Status Source
**Choice: Syncthing REST API (not database)**

Why:
- ✅ Syncthing already knows which files are synced/syncing/pending/error
- ✅ No need to duplicate this data in DB (avoids 10k×10k×10k bloat)
- ✅ Always accurate (source of truth)
- ✅ No CPU spike from hash comparisons

Downside:
- Requires API calls to Syncthing (mitigate with 5-second cache)
- Syncthing must be running (should be for any project)

#### Decision 2: File Snapshot vs Streaming
**Choice: Snapshot-based (gzip JSON) for now, upgrade to streaming later**

Snapshots (Phase 1 - Current):
- One file per project: `snapshot_{timestamp}.json.gz` (~1MB for 10k files)
- Updated: On-demand by owner (PUT /refresh-snapshot)
- Load: Download and decompress entire tree
- Good for: < 100k files
- Bad for: Real-time precision (stale if files change between refreshes)

Streaming (Phase 2 - Future):
- Backend watches Syncthing folder
- Broadcasts file changes via WebSocket
- Frontend subscribes to project channel
- Good for: Real-time accuracy, huge file counts
- Bad for: Higher backend complexity

#### Decision 3: UI Layout - Tree vs Table
**Choice: Hybrid approach**

For members (invited users):
- Show folder tree (collapsible)
- Lazy-load files on expand
- Display sync status badge per file
- Good for: Navigation, finding specific files

For owners:
- Show flat table (current behavior)
- Better for: Bulk operations, sorting

#### Decision 4: Polling Frequency
**Choice: 3 seconds for members, 10 seconds for owners**

Members polling frequently:
- They care about real-time progress
- 3s gives smooth visual updates
- `/file-sync-status` endpoint cached 5s (avoids Syncthing hammer)

Owners polling slowly:
- Less critical for status (already started sync)
- 10s saves CPU/bandwidth

---

## 3. Implementation Plan

### Phase 3A: Backend Infrastructure (NEW ENDPOINTS)

#### Step 1: Extend SyncthingService (2 new methods)

**File: `cloud/src/services/syncthingService.ts`**

Add method: `getFolderFiles(folderId)`
```typescript
async getFolderFiles(folderId: string): Promise<Array<{
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  syncStatus: 'synced' | 'syncing' | 'pending' | 'error';
  modTime: string;
}>> {
  // Query Syncthing REST API: /rest/db/browse?folder=...&levels=...
  // Return flattened file list with sync status
}
```

Add method: `getFileSyncStatus(folderId, filePath)`
```typescript
async getFileSyncStatus(
  folderId: string,
  filePath: string
): Promise<{
  state: 'synced' | 'syncing' | 'pending' | 'error';
  bytesDownloaded: number;
  totalBytes: number;
  percentComplete: number;
  error?: string;
}> {
  // Query /rest/db/status for folder
  // Match file in result to get precise sync state
}
```

#### Step 2: New API Endpoint

**File: `cloud/src/api/projects/routes.ts`**

Add endpoint: `GET /api/projects/:projectId/file-sync-status`
```typescript
router.get('/:projectId/file-sync-status', authMiddleware, async (req, res) => {
  // 1. Verify user is project member (owner or invited)
  // 2. Get project's Syncthing folder ID
  // 3. Query SyncthingService.getFolderStatus()
  // 4. Return:
  //    {
  //      folderState: 'idle' | 'syncing' | 'error',
  //      bytesGlobalLocal: 0,
  //      bytesGlobalNetwork: 1000000,
  //      completion: 45.5,  // % complete
  //      needsBytes: 550000,
  //      lastUpdate: '2024-11-17T...',
  //      globalDevices: [...],
  //      lastError?: 'permission denied'
  //    }
  // 5. Cache response for 5 seconds (avoid Syncthing overload)
});
```

**Cache Implementation:**
```typescript
// Simple in-memory cache with TTL
const statusCache = new Map<string, { data: any; expiresAt: number }>();

function getCachedStatus(key: string): any | null {
  const cached = statusCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  statusCache.delete(key);
  return null;
}

function setCachedStatus(key: string, data: any, ttlMs: number = 5000): void {
  statusCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs
  });
}
```

---

### Phase 3B: Frontend Components (UI)

#### Step 1: Sync Status Component

**File: `electron/src/renderer/components/FileSyncStatus.tsx`** (NEW)

```typescript
interface FileSyncStatusProps {
  state: 'synced' | 'syncing' | 'pending' | 'error';
  bytesDownloaded?: number;
  totalBytes?: number;
  lastUpdate?: string;
  error?: string;
}

export const FileSyncStatus: React.FC<FileSyncStatusProps> = ({
  state,
  bytesDownloaded,
  totalBytes,
  lastUpdate,
  error,
}) => {
  const completion = totalBytes ? (bytesDownloaded || 0) / totalBytes * 100 : 0;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {state === 'synced' && (
        <Tooltip title="All files synced">
          <CheckCircleIcon sx={{ color: '#4caf50', fontSize: '1.2em' }} />
        </Tooltip>
      )}
      {state === 'syncing' && (
        <Tooltip title={`Syncing: ${completion.toFixed(1)}%`}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress 
              variant="determinate" 
              value={completion}
              size={24}
              sx={{ color: '#ff9800' }}
            />
            <Box
              sx={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography variant="caption" sx={{ fontSize: '0.6em' }}>
                {completion.toFixed(0)}%
              </Typography>
            </Box>
          </Box>
        </Tooltip>
      )}
      {state === 'pending' && (
        <Tooltip title="Waiting to sync">
          <ScheduleIcon sx={{ color: '#bdbdbd', fontSize: '1.2em' }} />
        </Tooltip>
      )}
      {state === 'error' && (
        <Tooltip title={`Error: ${error || 'Unknown error'}`}>
          <ErrorIcon sx={{ color: '#f44336', fontSize: '1.2em' }} />
        </Tooltip>
      )}
    </Box>
  );
};
```

#### Step 2: Update ProjectFilesPage

**File: `electron/src/renderer/components/ProjectFilesPage.tsx`**

Modifications:
1. Add state: `folderSyncStatus` to track overall folder sync
2. Add effect: Poll `/file-sync-status` every 3 seconds
3. Add column: Display sync status badge for each file
4. Color rows: Green (synced), Yellow (syncing), Red (error)
5. Add progress bar: Show overall folder sync progress

```typescript
export const ProjectFilesPage: React.FC<ProjectFilesPageProps> = ({ 
  projectId, 
  isOwner = false 
}) => {
  const [folderSyncStatus, setFolderSyncStatus] = useState<any>(null);
  
  // Poll sync status every 3 seconds
  useEffect(() => {
    if (!projectId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await cloudAPI.get(
          `/projects/${projectId}/file-sync-status`
        );
        setFolderSyncStatus(response.data);
      } catch (err) {
        console.warn('Failed to fetch sync status:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [projectId]);

  // Add column to table header
  // Add <FileSyncStatus> badge to each row
};
```

#### Step 3: Tree View Component (Optional, for large projects)

**File: `electron/src/renderer/components/FileTreeView.tsx`** (NEW)

For projects with 10k+ files, showing everything at once is slow. Use collapsible tree:

```typescript
interface FileTreeNode {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  syncStatus?: string;
  children?: FileTreeNode[];
  isExpanded?: boolean;
}

export const FileTreeView: React.FC<{
  files: FileTreeNode[];
  onSyncStatusUpdate?: (filePath: string, status: string) => void;
}> = ({ files, onSyncStatusUpdate }) => {
  // Recursively render tree
  // Lazy-load children on expand
  // Display sync badge per folder
};
```

---

### Phase 3C: Data Models

#### Syncthing Folder Status Response

```typescript
interface FolderStatus {
  folderState: 'idle' | 'syncing' | 'error' | 'stopped' | 'scan-waiting' | 'cleaning';
  globalBytes: number;          // Total bytes in folder
  globalDeleted: number;        // Total deleted files
  globalFiles: number;          // Total files
  globalTotalItems: number;
  ignorePatterns: boolean;
  inSyncBytes: number;          // Synced bytes
  inSyncFiles: number;          // Synced files
  invalid: string;
  needBytes: number;            // Still need to download
  needDeletes: number;
  needFiles: number;            // Files still syncing
  pullErrors: number;
  receiveEncrypted: boolean;
  sequence: number;
  sequenceIgnored: number;
  stateChanged: string;
}

interface ProjectFileSyncStatus {
  folderState: string;
  completion: number;           // 0-100 %
  bytesDownloaded: number;
  totalBytes: number;
  needsBytes: number;
  state: 'synced' | 'syncing' | 'error';
  lastUpdate: string;
  devices: Array<{
    deviceId: string;
    deviceName: string;
    isConnected: boolean;
    hasFile: boolean;
  }>;
  error?: string;
}
```

---

## 4. Legacy Code Cleanup

### Code to Remove/Archive

1. **`cloud/src/services/backgroundSyncService.ts`**
   - Purpose: Was processing file changes → remote_files table
   - Status: remote_files table removed, so orphaned
   - Action: Archive to `docs/LEGACY_backgroundSyncService.ts`

2. **`cloud/src/api/projects/routes.ts` lines 1481, 1490, 1612, 1626**
   - References to `remote_files` table (doesn't exist)
   - Action: Search and remove all `.from('remote_files')` queries
   - Verify: No endpoints depend on it

3. **`POST /api/projects/:projectId/files-sync`**
   - Incomplete placeholder endpoint
   - Action: Remove or document as future endpoint

### Code to Keep

1. **`SyncthingService`** - Core Syncthing integration (extend, don't remove)
2. **`FileMetadataService`** - Snapshot management (working as designed)
3. **`GET /api/projects/:projectId/files-list`** - Snapshot reading (working)
4. **`ProjectFilesPage`** - File UI (enhance with sync status)

---

## 5. Performance Considerations

### API Caching Strategy

| Endpoint | Cache TTL | Reason |
|----------|-----------|--------|
| `/file-sync-status` | 5 seconds | Syncthing API can't handle sub-second polling |
| `/files-list` | No cache | Files can change; client side pagination |
| `/projects/list/invited` | 30 seconds | Project list changes rarely |

### Database Impact

✅ **NO new tables** - Use Syncthing as source of truth
✅ **NO file hash storage** - Avoids 10^12 row explosion
✅ **Minimal queries** - Only project metadata (already optimized)

### Syncthing Load

Current polling: 3 seconds per file browser instance

Optimization if needed:
- Share status across instances (broadcast via WebSocket)
- Increase cache TTL to 10 seconds
- Only poll when tab is visible (use Page Visibility API)

### Network Usage

File list download:
- 10,000 files @ 500 bytes each = 5 MB
- Gzipped: ~1 MB
- One-time on page load (paginated)

Sync status polling:
- 100 bytes per request
- Every 3 seconds = ~3.3 KB/min per client
- For 100 clients = 5.5 MB/hour (acceptable)

---

## 6. WebSocket Integration (Future - Phase 3D)

Currently polling. Future upgrade:

```typescript
// Channel: projects:{projectId}:sync-status
// Events:
// - sync:start
// - sync:progress { completion: 45 }
// - sync:complete
// - sync:error { message: '...' }

websocket.on('projects:sync-status', (event) => {
  if (event.type === 'sync:progress') {
    setFolderSyncStatus({ ...event.data });
  }
});
```

Benefits:
- Real-time precision (no polling lag)
- Lower bandwidth (only changes sent)
- Scales to 1000s of clients

Complexity:
- Need WebSocket server (could use Supabase Realtime)
- Need file watcher on backend

---

## 7. Testing Plan

### Unit Tests
- [ ] `FileSyncStatus` component renders correctly for each state
- [ ] `file-sync-status` endpoint caches properly
- [ ] `SyncthingService.getFolderStatus()` parses response correctly

### Integration Tests
- [ ] Create project with 1000+ files
- [ ] Add member device
- [ ] Verify sync status progresses (0% → 100%)
- [ ] Files marked as synced after completion
- [ ] Error handling (disconnect device, simulate sync error)

### Load Tests
- [ ] 100 concurrent members polling status (should cache effectively)
- [ ] Syncthing folder with 100k+ files (tree view lazy-loads)
- [ ] No CPU spike, response time < 200ms

---

## 8. Rollout Plan

### Week 1: Backend Infrastructure
- [ ] Extend `SyncthingService` (2 methods)
- [ ] Add `/file-sync-status` endpoint
- [ ] Cache implementation
- [ ] Deploy and test against real Syncthing

### Week 2: Frontend Components
- [ ] Build `FileSyncStatus` component
- [ ] Update `ProjectFilesPage` with polling
- [ ] Add sync badge to file table
- [ ] Test on invite scenario

### Week 3: Large File Support
- [ ] Build `FileTreeView` component
- [ ] Lazy-load on expand
- [ ] Performance testing (10k+ files)

### Week 4: Polish & Cleanup
- [ ] Archive legacy code
- [ ] Remove orphaned references
- [ ] Final testing
- [ ] Documentation update

---

## 9. Decision Checklist

Before coding, confirm:

- [ ] **Syncthing as source of truth?** → YES (not DB file hash table)
- [ ] **API endpoint caching?** → YES (5-second TTL)
- [ ] **Polling frequency?** → 3 seconds (acceptable Syncthing load)
- [ ] **File snapshot format?** → Keep gzip JSON (upgrade to streaming later)
- [ ] **UI layout?** → Start with flat table, add tree later
- [ ] **Remove backgroundSyncService?** → Archive to docs/LEGACY_
- [ ] **Remove remote_files queries?** → All 4 lines removed
- [ ] **Real-time precision needed?** → Phase 3D (WebSocket future)

---

## Next Steps

1. **Confirm this design** with user feedback
2. **Start Phase 3A:** Extend SyncthingService
3. **Create branch:** `feature/remote-file-sync-status`
4. **Test each step** before moving to next
5. **Measure performance** to validate assumptions

---

*Document Version: 1.0*
*Date: 2024-11-17*
*Status: Design Review*
