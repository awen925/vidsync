# Implementation Action Items - Sync Status UI

## Status: Ready to Code ✅

All design decisions made. Ready for implementation in order.

---

## Phase 3A: Backend Infrastructure

### ✅ STEP 1: Extend SyncthingService.ts

**File:** `cloud/src/services/syncthingService.ts`

**What to add:**

Add two new methods after the existing `getFolderStatus()` method (around line 214):

```typescript
/**
 * Get list of files in a folder with their sync status
 * Returns flattened file list from Syncthing
 */
async getFolderFiles(
  folderId: string,
  levels: number = 5
): Promise<Array<{
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  modTime: string;
  syncStatus: 'synced' | 'syncing' | 'pending' | 'error';
}>> {
  try {
    // Query: GET /rest/db/browse?folder={folderId}&levels={levels}&prefix=
    // Response contains all files in folder hierarchy
    const browseData = await this.makeRequest(
      `/rest/db/browse?folder=${folderId}&levels=${levels}&prefix=`
    );

    // browseData.children = array of files/folders
    // Need to flatten and extract sync status from folder status

    const folderStatus = await this.getFolderStatus(folderId);

    const files: any[] = [];

    const flatten = (items: any[], prefix: string = '') => {
      if (!items) return;

      for (const item of items) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;

        // Determine sync status by checking if file is in needFiles list
        let syncStatus = 'synced';
        if (folderStatus.needFiles > 0 && folderStatus.inSyncBytes < folderStatus.globalBytes) {
          // Rough heuristic: if folder is still syncing, mark as syncing
          syncStatus = 'syncing';
        }

        files.push({
          path,
          name: item.name,
          type: item.type === 'file' ? 'file' : 'dir',
          size: item.size || 0,
          modTime: new Date().toISOString(), // Syncthing response doesn't include this
          syncStatus,
        });

        if (item.children && item.type === 'dir') {
          flatten(item.children, path);
        }
      }
    };

    flatten(browseData.children);

    return files;
  } catch (error) {
    console.error(`Failed to get folder files for ${folderId}:`, error);
    throw error;
  }
}

/**
 * Get detailed sync status for a specific file
 * Returns progress for that file's sync
 */
async getFileSyncStatus(
  folderId: string,
  filePath: string
): Promise<{
  state: 'synced' | 'syncing' | 'pending' | 'error';
  percentComplete: number;
  bytesDownloaded: number;
  totalBytes: number;
  lastError?: string;
}> {
  try {
    // Query folder status
    const folderStatus = await this.getFolderStatus(folderId);

    // Get file details from browse
    const browseData = await this.makeRequest(
      `/rest/db/browse?folder=${folderId}&prefix=${encodeURIComponent(filePath)}`
    );

    // Determine sync state
    let state: 'synced' | 'syncing' | 'pending' | 'error' = 'synced';
    let percentComplete = 100;

    if (folderStatus.needFiles > 0) {
      if (folderStatus.inSyncFiles > 0) {
        state = 'syncing';
        // Rough calculation: per-file progress
        percentComplete = Math.round(
          (folderStatus.inSyncBytes / folderStatus.globalBytes) * 100
        );
      } else {
        state = 'pending';
        percentComplete = 0;
      }
    }

    return {
      state,
      percentComplete,
      bytesDownloaded: folderStatus.inSyncBytes,
      totalBytes: folderStatus.globalBytes,
    };
  } catch (error) {
    console.error(`Failed to get file sync status for ${filePath}:`, error);
    throw error;
  }
}
```

**Verification:**
```bash
npm run build  # Check TypeScript
# Should compile with 0 errors
```

---

### ✅ STEP 2: Add /file-sync-status Endpoint

**File:** `cloud/src/api/projects/routes.ts`

**Location:** Add after the `GET /:projectId/snapshot-metadata` endpoint (around line 950)

```typescript
/**
 * GET /api/projects/:projectId/file-sync-status
 * Returns current sync status for the project folder
 * Response is cached for 5 seconds to avoid Syncthing overload
 */

// Simple cache for sync status (5-second TTL)
const syncStatusCache = new Map<string, {
  data: any;
  expiresAt: number;
}>();

function getCachedSyncStatus(projectId: string): any | null {
  const cached = syncStatusCache.get(projectId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  syncStatusCache.delete(projectId);
  return null;
}

function setCachedSyncStatus(projectId: string, data: any, ttlMs: number = 5000): void {
  syncStatusCache.set(projectId, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

router.get('/:projectId/file-sync-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify user is project member (owner or invited)
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, syncthing_folder_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;

    if (!isOwner) {
      // Check if invited member
      const { data: member } = await supabase
        .from('project_members')
        .select('status')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (!member || member.status !== 'accepted') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Check cache first
    const cached = getCachedSyncStatus(projectId);
    if (cached) {
      console.log(`[Cache HIT] Sync status for project ${projectId}`);
      return res.json(cached);
    }

    // Query Syncthing
    const folderStatus = await syncthingService.getFolderStatus(project.syncthing_folder_id);

    // Calculate completion percentage
    const completion = folderStatus.globalBytes > 0
      ? Math.round((folderStatus.inSyncBytes / folderStatus.globalBytes) * 100)
      : 100;

    // Determine state
    let state: 'synced' | 'syncing' | 'paused' | 'error' = 'synced';
    if (folderStatus.folderState === 'syncing') {
      state = 'syncing';
    } else if (folderStatus.folderState === 'stopped' || folderStatus.folderState === 'paused') {
      state = 'paused';
    } else if (folderStatus.pullErrors && folderStatus.pullErrors > 0) {
      state = 'error';
    }

    const response = {
      folderState: folderStatus.folderState,
      state,
      completion,
      bytesDownloaded: folderStatus.inSyncBytes,
      totalBytes: folderStatus.globalBytes,
      needsBytes: folderStatus.needBytes,
      filesDownloaded: folderStatus.inSyncFiles,
      totalFiles: folderStatus.globalFiles,
      lastUpdate: new Date().toISOString(),
      pullErrors: folderStatus.pullErrors || 0,
    };

    // Cache the response
    setCachedSyncStatus(projectId, response, 5000);

    res.json(response);
  } catch (error) {
    console.error('Get sync-status exception:', error);
    res.status(500).json({ error: `Failed to get sync status: ${(error as Error).message}` });
  }
});
```

**Verification:**
```bash
# Test endpoint
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/projects/<projectId>/file-sync-status

# Should return:
# {
#   "state": "syncing",
#   "completion": 45,
#   "bytesDownloaded": 1000000,
#   "totalBytes": 2200000,
#   ...
# }
```

---

### ✅ STEP 3: Test Backend

**Create test file:** `cloud/tests/syncStatus.test.ts`

```typescript
import { SyncthingService } from '../src/services/syncthingService';
import { describe, it, expect } from '@jest/globals';

describe('SyncthingService - Sync Status', () => {
  const service = new SyncthingService(process.env.SYNCTHING_API_KEY || '');

  it('should get folder status', async () => {
    const status = await service.getFolderStatus('default');
    expect(status).toHaveProperty('globalBytes');
    expect(status).toHaveProperty('inSyncBytes');
    expect(status).toHaveProperty('needFiles');
  });

  it('should get folder files', async () => {
    const files = await service.getFolderFiles('default');
    expect(Array.isArray(files)).toBe(true);
    expect(files[0]).toHaveProperty('path');
    expect(files[0]).toHaveProperty('syncStatus');
  });

  it('should get file sync status', async () => {
    const status = await service.getFileSyncStatus('default', 'test.txt');
    expect(status).toHaveProperty('state');
    expect(status).toHaveProperty('percentComplete');
  });
});
```

**Run tests:**
```bash
npm run test -- cloud/tests/syncStatus.test.ts

# Should pass with 3 assertions
```

---

## Phase 3B: Frontend Components

### ✅ STEP 4: Create FileSyncStatus Component

**File:** `electron/src/renderer/components/FileSyncStatus.tsx` (NEW)

```typescript
import React from 'react';
import {
  Box,
  CircularProgress,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
  Pause as PauseIcon,
} from '@mui/icons-material';

export type SyncState = 'synced' | 'syncing' | 'pending' | 'paused' | 'error';

interface FileSyncStatusProps {
  state: SyncState;
  completion?: number;        // 0-100 %
  bytesDownloaded?: number;
  totalBytes?: number;
  error?: string;
  compact?: boolean;          // Smaller display for table cells
}

/**
 * FileSyncStatus: Display sync state badge with progress indicator
 *
 * States:
 * - synced: Green checkmark (complete)
 * - syncing: Yellow spinner + % (in progress)
 * - pending: Gray clock (waiting)
 * - paused: Gray pause icon (stopped)
 * - error: Red warning + tooltip (failed)
 */
export const FileSyncStatus: React.FC<FileSyncStatusProps> = ({
  state,
  completion = 0,
  bytesDownloaded = 0,
  totalBytes = 0,
  error,
  compact = false,
}) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const tooltipText = {
    synced: 'All files synced',
    syncing: `Syncing: ${Math.round(completion)}% (${formatBytes(bytesDownloaded)} / ${formatBytes(totalBytes)})`,
    pending: 'Waiting to sync',
    paused: 'Sync paused',
    error: `Error: ${error || 'Unknown error'}`,
  }[state];

  if (compact) {
    // Small version for table cells
    return (
      <Tooltip title={tooltipText}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {state === 'synced' && (
            <CheckCircleIcon sx={{ color: '#4caf50', fontSize: '1.1em' }} />
          )}
          {state === 'syncing' && (
            <Box sx={{ position: 'relative', display: 'inline-flex', width: 20, height: 20 }}>
              <CircularProgress
                variant="determinate"
                value={completion}
                size={20}
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
                <Typography variant="caption" sx={{ fontSize: '0.6em', fontWeight: 'bold' }}>
                  {Math.round(completion)}
                </Typography>
              </Box>
            </Box>
          )}
          {state === 'pending' && (
            <ScheduleIcon sx={{ color: '#bdbdbd', fontSize: '1.1em' }} />
          )}
          {state === 'paused' && (
            <PauseIcon sx={{ color: '#9e9e9e', fontSize: '1.1em' }} />
          )}
          {state === 'error' && (
            <ErrorIcon sx={{ color: '#f44336', fontSize: '1.1em' }} />
          )}
        </Box>
      </Tooltip>
    );
  }

  // Full version for dedicated sections
  return (
    <Tooltip title={tooltipText}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {state === 'synced' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <CheckCircleIcon sx={{ color: '#4caf50', fontSize: '2em' }} />
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              Synced ✓
            </Typography>
          </Box>
        )}

        {state === 'syncing' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box sx={{ position: 'relative', display: 'inline-flex', width: 60, height: 60 }}>
              <CircularProgress
                variant="determinate"
                value={completion}
                size={60}
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
                  flexDirection: 'column',
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  {Math.round(completion)}%
                </Typography>
              </Box>
            </Box>
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              Syncing...
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)}
            </Typography>
          </Box>
        )}

        {state === 'pending' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ScheduleIcon sx={{ color: '#bdbdbd', fontSize: '2em' }} />
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              Pending
            </Typography>
          </Box>
        )}

        {state === 'paused' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <PauseIcon sx={{ color: '#9e9e9e', fontSize: '2em' }} />
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              Paused
            </Typography>
          </Box>
        )}

        {state === 'error' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ErrorIcon sx={{ color: '#f44336', fontSize: '2em' }} />
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              Error
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {error || 'Unknown error'}
            </Typography>
          </Box>
        )}
      </Box>
    </Tooltip>
  );
};

export default FileSyncStatus;
```

**Verification:**
```bash
npm run build  # Check TypeScript in electron folder
# Should compile with 0 errors
```

---

### ✅ STEP 5: Update ProjectFilesPage

**File:** `electron/src/renderer/components/ProjectFilesPage.tsx`

**Changes:**

1. Add imports at top:
```typescript
import FileSyncStatus from './FileSyncStatus';
import type { SyncState } from './FileSyncStatus';
```

2. Add state hook after existing useState declarations:
```typescript
const [folderSyncStatus, setFolderSyncStatus] = useState<any>(null);
const [fileStates, setFileStates] = useState<Record<string, SyncState>>({});
```

3. Add effect for polling (after existing useEffect):
```typescript
  // Poll sync status every 3 seconds (for members only)
  useEffect(() => {
    if (!projectId || isOwner) return;

    // Determine sync state for all files based on folder status
    const pollInterval = setInterval(async () => {
      try {
        const response = await cloudAPI.get(
          `/projects/${projectId}/file-sync-status`
        );

        setFolderSyncStatus(response.data);

        // Update file states based on folder status
        if (response.data.state === 'synced') {
          // All files synced
          const newStates: Record<string, SyncState> = {};
          files.forEach(file => {
            newStates[file.file_path] = 'synced';
          });
          setFileStates(newStates);
        } else if (response.data.state === 'syncing') {
          // Some files syncing
          const newStates: Record<string, SyncState> = {};
          files.forEach(file => {
            newStates[file.file_path] = 'syncing';
          });
          setFileStates(newStates);
        }
      } catch (err) {
        console.warn('Failed to fetch sync status:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [projectId, isOwner, files]);
```

4. Add new column to table header:
```typescript
<TableCell sx={{ fontWeight: 'bold', width: '100px' }}>
  Status
</TableCell>
```

5. Add cell to each table row:
```typescript
<TableCell align="center">
  <FileSyncStatus
    state={fileStates[file.file_path] || 'synced'}
    compact={true}
  />
</TableCell>
```

6. Add progress bar at top of files section:
```typescript
{folderSyncStatus && folderSyncStatus.state === 'syncing' && (
  <Box sx={{ mb: 2 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        Overall Progress
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {Math.round(folderSyncStatus.completion)}%
      </Typography>
    </Box>
    <LinearProgress
      variant="determinate"
      value={folderSyncStatus.completion}
      sx={{ height: 8, borderRadius: 1 }}
    />
  </Box>
)}
```

**Complete file after modifications:**
```bash
# File should still compile with 0 errors
npm run build --workspaces
```

---

### ✅ STEP 6: Test Frontend

**Create test scenario:**

1. Open Invited Projects page
2. Select project that's syncing
3. Verify:
   - [ ] Progress bar shows at top
   - [ ] File table shows sync badges
   - [ ] Status updates every 3 seconds
   - [ ] Completion % increases
   - [ ] "Last updated" timestamp refreshes

**Check console:**
```bash
# Open DevTools
# Should NOT see errors in console
# Should see periodic "sync status: 45%" logs
```

---

## Phase 3C: Cleanup (Legacy Code)

### ✅ STEP 7: Remove Legacy Code

**Search for orphaned remote_files queries:**

```bash
grep -r "from('remote_files')" cloud/src/
```

**Results should show 4 lines:**
- `cloud/src/api/projects/routes.ts` line 1481
- `cloud/src/api/projects/routes.ts` line 1490
- `cloud/src/api/projects/routes.ts` line 1612
- `cloud/src/api/projects/routes.ts` line 1626

**Action: Remove all 4 queries**

For each occurrence, remove the `.from('remote_files')` query and surrounding function if it has no other purpose.

**Archive legacy code:**

```bash
# Save backup
cp cloud/src/services/backgroundSyncService.ts docs/LEGACY_backgroundSyncService.ts

# Remove from codebase
rm cloud/src/services/backgroundSyncService.ts

# Remove unused imports that reference it
grep -r "backgroundSyncService" cloud/src/ | xargs rm

# Verify no references remain
grep -r "backgroundSyncService" cloud/src/  # Should return 0 results
```

**Final verification:**
```bash
npm run build  # Should compile
npm run test  # Should pass all tests
```

---

## Testing & Validation

### Comprehensive Test Checklist

- [ ] **Backend API works**
  - [ ] GET `/file-sync-status` returns correct status
  - [ ] Response cached for 5 seconds
  - [ ] Multiple calls within 5s return same data

- [ ] **FileSyncStatus component renders all states**
  - [ ] Synced: Green checkmark ✓
  - [ ] Syncing: Yellow spinner + %
  - [ ] Pending: Gray clock ⏳
  - [ ] Paused: Gray pause ⏸
  - [ ] Error: Red warning ⚠

- [ ] **ProjectFilesPage integration**
  - [ ] Polls every 3 seconds
  - [ ] Progress bar updates
  - [ ] File badges update
  - [ ] No console errors

- [ ] **Real Syncthing test**
  - [ ] Create project with 100+ files
  - [ ] Add member device
  - [ ] Start sync
  - [ ] Verify UI shows progress
  - [ ] Verify completion reaches 100%

- [ ] **Error handling**
  - [ ] Stop Syncthing
  - [ ] Verify "Error" state shown
  - [ ] Restart Syncthing
  - [ ] Verify recovery

---

## Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 3A | Extend SyncthingService | 2 hours |
| 3A | Add /file-sync-status endpoint | 2 hours |
| 3A | Backend testing | 1 hour |
| 3B | FileSyncStatus component | 1 hour |
| 3B | Update ProjectFilesPage | 2 hours |
| 3B | Frontend testing | 1 hour |
| 3C | Clean up legacy code | 1 hour |
| — | **TOTAL** | **~10 hours** |

---

## Success Criteria ✅

When complete, verify:

1. Invited members see file list with sync badges ✓
2. Sync progress updates in real-time (every 3s) ✓
3. UI shows: Synced, Syncing %, Pending, Paused, Error states ✓
4. No database bloat (no file hash table) ✓
5. No CPU spike from polling (cache effective) ✓
6. Legacy code cleaned up ✓
7. All tests passing ✓
8. Zero TypeScript errors ✓

---

## Start Here 👉

Begin with **STEP 1: Extend SyncthingService.ts**

Once that's working, move to STEP 2.

Good luck! 🚀
