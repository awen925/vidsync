# Sync Status Architecture - Quick Reference

## Problem Statement

**Current Issue:**
- Invited members see file list but NO indication of sync progress
- Files show as "synced" even if still downloading
- No visual feedback on which files are ready vs still syncing
- Members can't tell if project is stuck or actively downloading

**Why Not Store File Hashes in DB?**
- 10k users × 10k projects × 10k files = 10^12 rows
- Would consume terabytes of storage
- CPU spike from comparison queries
- Completely impractical

**Solution:**
Query Syncthing REST API directly (it already knows!)

---

## Architecture Overview

```
INVITED MEMBER'S COMPUTER
┌────────────────────────────────────┐
│  React UI (Electron)               │
│  ┌──────────────────────────────┐  │
│  │ ProjectFilesPage             │  │
│  │ - File table with sync badge │  │
│  │ - Polls every 3 seconds ───┐ │  │
│  └──────────────────────────┐─┘  │
│                             │      │
│  ┌──────────────────────────┼───┐  │
│  │ Syncthing (local daemon)  │   │  │
│  │ - Manages folder sync     │   │  │
│  │ - REST API :8384 ◄────────┘   │  │
│  └──────────────────────────────┘  │
└──────────────────────────────┬──────┘
                               │
                               │ HTTP
                               ▼
            CLOUD BACKEND (Node.js)
            ┌──────────────────────────┐
            │ GET /file-sync-status    │
            │ 1. Query Syncthing API   │
            │ 2. Cache 5 seconds       │
            │ 3. Return progress %     │
            │                          │
            │ SyncthingService:        │
            │ - getFolderStatus()      │
            │ - getFileSyncStatus()    │
            │ - getDeviceStatus()      │
            └──────────────────────────┘
```

---

## Sync Status Flow

### Scenario: Member joins project with 5GB of files

```
TIMELINE                    UI DISPLAY                  BACKEND STATE
─────────────────────────────────────────────────────────────────────
T=0s   Join project         [Join Button] ──> Click    ✓ Added to project
                                                        ✓ Syncthing folder created
                                                        ✓ Device added to folder

T=1s   Page loads           "Files (5000)"              Backend queries Syncthing
                            ↻ ↻ ↻ (spinning)           Response: "syncing, 0%"

T=3s   First status         0% ████░░░░░░░░░░░░░░░░ │  Syncthing starts download
                            "Syncing: 0%"

T=30s  Download in progress 12% ███░░░░░░░░░░░░░░░░░░░ │  Partial files received

T=60s  Half way             52% ██████████░░░░░░░░░░░░ │  Cache valid for 5s,
                            "Syncing: 52%"             so polling from cache

T=120s Almost done          98% █████████████████░░░░░ │  Few last files pending

T=150s Complete!            ✓ SYNCED                   ✓ All files downloaded
                            "Last update: just now"    Status: idle
```

### User Sees:
- **Synced Files:** Green ✓ checkmark badge
- **Syncing Files:** Yellow ↻ spinner + % complete
- **Pending Files:** Gray ⏳ clock icon
- **Error Files:** Red ⚠ warning + tooltip with reason

---

## Implementation Checklist

### Backend (2-3 days)

- [ ] **1. Extend SyncthingService**
  - Add method: `getFolderFiles(folderId)`
  - Add method: `getFileSyncStatus(folderId, filePath)`
  - File: `cloud/src/services/syncthingService.ts`

- [ ] **2. New API Endpoint**
  - Endpoint: `GET /api/projects/:projectId/file-sync-status`
  - Cache: 5-second TTL (prevent Syncthing hammer)
  - File: `cloud/src/api/projects/routes.ts`

- [ ] **3. Test Backend**
  - Verify endpoint returns correct status
  - Test cache behavior
  - Test with real Syncthing folder

### Frontend (1-2 days)

- [ ] **4. FileSyncStatus Component**
  - Renders 4 states (synced, syncing, pending, error)
  - Shows progress bar/% when syncing
  - File: `electron/src/renderer/components/FileSyncStatus.tsx` (NEW)

- [ ] **5. Update ProjectFilesPage**
  - Add polling logic (every 3 seconds)
  - Add sync column to table
  - Color rows based on state
  - File: `electron/src/renderer/components/ProjectFilesPage.tsx`

- [ ] **6. Test Frontend**
  - Verify polling works
  - Check all 4 states display correctly
  - Test error handling

### Cleanup (1 day)

- [ ] **7. Remove Legacy Code**
  - Archive `backgroundSyncService.ts`
  - Remove 4x `.from('remote_files')` queries
  - Remove incomplete `/files-sync` endpoint
  - Files: `cloud/src/**`

---

## Key Data Models

### SyncthingService.getFolderStatus() Response

```json
{
  "folderState": "syncing",
  "globalBytes": 5368709120,           // Total size
  "inSyncBytes": 2684354560,           // Downloaded so far
  "needBytes": 2684354560,             // Still to download
  "inSyncFiles": 2500,                 // Files synced
  "needFiles": 2500,                   // Files still syncing
  "completion": 50.0
}
```

### /file-sync-status Endpoint Response

```json
{
  "folderState": "syncing",
  "completion": 50.0,
  "bytesDownloaded": 2684354560,
  "totalBytes": 5368709120,
  "state": "syncing",
  "devices": [
    {
      "deviceId": "ABCD123",
      "deviceName": "John's Mac",
      "isConnected": true,
      "hasFile": true
    }
  ]
}
```

### Sync Status UI State

```typescript
type SyncState = 'synced' | 'syncing' | 'pending' | 'error';

interface SyncStatus {
  state: SyncState;
  completion: number;              // 0-100
  bytesDownloaded: number;
  totalBytes: number;
  lastUpdate: Date;
  error?: string;
}
```

---

## Performance Analysis

### Current Load (Polling every 3s)

- Request size: ~100 bytes
- Response size: ~200 bytes
- Per client/minute: ~4 KB
- For 100 clients: ~25 KB/minute (~3.6 MB/hour)

**Assessment:** Acceptable ✅

### Optimization If Needed

| Optimization | Benefit | Cost |
|---|---|---|
| Increase cache TTL to 10s | 3.3× less load | Stale status for up to 10s |
| Use WebSocket instead | Real-time, lower bandwidth | Requires WebSocket server |
| Share status via Redis | Multi-backend caching | Added Redis dependency |
| Lazy-load file tree | Handle 10k+ files | UI complexity |

**Recommendation:** Start with polling. Upgrade to WebSocket if needed.

---

## Testing Scenarios

### Test Case 1: Normal Sync
1. Create project with 100 files (10 MB)
2. Add member device
3. Verify sync status progresses 0% → 100%
4. Verify UI updates every 3 seconds

### Test Case 2: Large Project
1. Create project with 10,000 files (1 GB)
2. Add member device
3. Monitor: Tree view lazy-loads
4. Monitor: No CPU spike on polling

### Test Case 3: Error Handling
1. Start sync with large project
2. Unplug network cable
3. Verify UI shows "Error" state
4. Reconnect and verify resume

### Test Case 4: Cache Effectiveness
1. Open project in 5 browser tabs
2. All tabs polling every 3 seconds
3. Verify backend cache returns same data
4. Verify only 1 Syncthing query per 5 seconds

---

## Decision Tree: Should I Use This?

```
Are you implementing remote file browser for invited members?
  ├─ YES, need to show sync progress
  │  └─ Use this architecture ✅
  │
  ├─ YES, but files are stored elsewhere (not Syncthing)
  │  └─ Modify for your file source
  │
  └─ NO, this is for something else
     └─ Use alternative approach
```

---

## FAQ

**Q: Why poll Syncthing every 3s instead of real-time?**
A: Syncthing doesn't support real-time streaming. Future upgrade: WebSocket with backend polling.

**Q: Why cache for 5 seconds?**
A: Syncthing REST API can't handle sub-second polling. This is safe (status changes gradually anyway).

**Q: What if member pauses sync?**
A: State changes to "paused". Frontend shows ⏸ badge and stops polling until resumed.

**Q: What about deleted files?**
A: Syncthing tracks deletions. Status shows "deleted" state if file was removed remotely.

**Q: Can we show per-file progress?**
A: Yes, but expensive. Syncthing API requires separate query per file. Current design shows folder-level only.

**Q: Will this work with offline members?**
A: No. Offline members won't sync. Status shows "offline" / "not connected". When reconnected, sync resumes.

---

## Next: Code Implementation

Once approved, start with:
1. Extend SyncthingService methods ← **START HERE**
2. Add /file-sync-status endpoint
3. Build FileSyncStatus component
4. Update ProjectFilesPage polling

See `SYNC_ARCHITECTURE_DESIGN.md` for detailed code examples.
