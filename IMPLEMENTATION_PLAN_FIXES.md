# Implementation Plan: Fix Event Lifecycle Issues

## Problem Summary

**Current Broken Flow**:
```
1. POST /api/projects → DB INSERT
2. Get device ID
3. PUT /rest/config/folders/{id}  ← Syncthing receives request
4. Response: { project: data }    ← Returned IMMEDIATELY
5. Client uses projectId with Syncthing APIs
   ✗ But folder not yet created in Syncthing!
   ✗ All subsequent calls fail with "folder not found"
```

## Solution Overview

### Phase 1: Cloud Backend Changes
- **Increase timeout** from 1000ms to 5000ms minimum
- **Wait for folder creation** in Syncthing before responding
- **Verify folder exists** before returning
- **Add detailed logging** at each checkpoint
- **Handle large projects** properly (no 1.5s arbitrary waits)

### Phase 2: Electron Client Changes
- **Add folder existence polling** before using folder ID
- **Detect when folder is ready** in Syncthing
- **Log all state transitions**
- **Show proper progress messages**

### Phase 3: Data Type Fixes
- **Proper JSON structure** for all responses
- **Consistent error handling**
- **Complete state information** in responses

---

## Implementation Details

### Backend Changes (Cloud API)

#### 1. Increase API Timeouts
```typescript
// Current: 30 seconds (good)
// But increase overall project creation timeout: 90 seconds
// Rationale: Large projects need time to scan
```

#### 2. Verify Folder Creation
```typescript
// After PUT /rest/config/folders/{id}
// Call: GET /rest/config/folders/{id}
// Verify: Response includes our folder with correct config
// This ensures folder actually exists before proceeding
```

#### 3. Better Event Waiting
```typescript
// Instead of: wait LocalIndexUpdated (scan complete)
// Do: wait RemoteFolderSummary (folder known to exist)
// This confirms folder is in Syncthing, even if not scanned yet
```

#### 4. Detailed Logging
```typescript
console.log(`[Project:${id}] Step 1: DB insert ✓`)
console.log(`[Project:${id}] Step 2: Device lookup ✓`)
console.log(`[Project:${id}] Step 3: Folder create request sent`)
console.log(`[Project:${id}] Step 4: Waiting for folder to exist in Syncthing...`)
console.log(`[Project:${id}] Step 5: Folder confirmed in Syncthing ✓`)
console.log(`[Project:${id}] Step 6: Waiting for index scan (LocalIndexUpdated)...`)
console.log(`[Project:${id}] Step 7: Index scan complete ✓`)
console.log(`[Project:${id}] Step 8: Files fetched - ${count} items`)
console.log(`[Project:${id}] Step 9: Snapshot saved ✓`)
console.log(`[Project:${id}] COMPLETE ✓`)
```

### Client Changes (Electron)

#### 1. Folder Existence Polling
```typescript
// Before using folder ID, poll:
// GET /rest/db/folder-stats?folder={id}
// Or: GET /rest/db/browse?folder={id}
// Loop until: folder exists in Syncthing
// Timeout: 30 seconds
// Backoff: exponential 100ms, 200ms, 500ms, 1s
```

#### 2. IPC Handler with Waiting
```typescript
// Current: Returns immediately
// New: Returns only when folder is confirmed ready
// Caller knows: folder definitely exists when response received
```

#### 3. State Machine Approach
```
State: INIT
  ↓
State: SPAWNING (Syncthing process starting)
  ↓
State: API_READY (REST API responsive)
  ↓
State: FOLDER_CREATING (PUT request sent)
  ↓
State: FOLDER_EXISTS (Confirmed in Syncthing)
  ↓
State: INDEXING (Files being scanned)
  ↓
State: READY (Can be used)
```

---

## Files to Modify

### Backend (Cloud)
1. `/cloud/src/api/projects/routes.ts` - POST /projects handler
2. `/cloud/src/services/syncthingService.ts` - Add folder verification method
3. Add logging utilities for tracing

### Frontend (Electron)
1. `/electron/src/main/syncthingManager.ts` - Add folder polling
2. `/electron/src/main/main.ts` - Update IPC handler
3. `/electron/src/renderer/pages/Projects/YourProjectsPage.tsx` - Better error handling

---

## Expected Behavior After Fix

### Backend
```
Total time for project creation: 5-20 seconds (depends on folder size)
  - DB insert: ~50ms ✓
  - Device lookup: ~20ms ✓
  - Folder create request: ~30ms ✓
  - Verify folder exists: ~200ms ✓
  - Wait for scan (if small): ~1s ✓
  - Wait for scan (if large): 5-15s ✓
  - Fetch files: ~200ms ✓
  - Save snapshot: ~100ms ✓
  - Update DB with snapshot_url: ~50ms ✓

Response sent ONLY after:
  - Folder confirmed to exist in Syncthing
  - Snapshot successfully saved
  - DB fully updated

Client receives:
{
  project: {
    id, name, local_path,
    snapshot_url: "s3://...",
    snapshot_generated_at: "2025-11-19T10:05:00Z",
    syncthing_folder_exists: true,
    syncthing_device_id: "XXXX-...",
    created_at, updated_at
  }
}
```

### Client
```
User clicks "Start Sync":

1. IPC call sent
2. Status: "Checking Syncthing..."
3. Status: "Spawning Syncthing process..."
4. Status: "Waiting for API to be ready..."
5. Status: "Creating folder..."
6. Status: "Verifying folder exists..."
7. Status: "Folder ready for sync ✓"
8. Return control to caller
9. Caller knows: folder DEFINITELY exists
10. Caller can proceed safely with folder ID

No more "folder not found" errors!
```

---

## Logging Output Example

```
[2025-11-19T10:00:00Z] [Project:uuid-123] Creating new project "My Videos"
[2025-11-19T10:00:00Z] [Project:uuid-123] → Auth check ✓
[2025-11-19T10:00:00Z] [Project:uuid-123] → Duplicate check ✓
[2025-11-19T10:00:00Z] [Project:uuid-123] → DB insert ✓ (id: uuid-123)
[2025-11-19T10:00:01Z] [Project:uuid-123] → Device lookup ✓ (syncthing_id: XXXX-...)
[2025-11-19T10:00:01Z] [Project:uuid-123] → Sending folder create request...
[2025-11-19T10:00:01Z] [Project:uuid-123] → Folder create response: 200 OK
[2025-11-19T10:00:01Z] [Project:uuid-123] → Verifying folder exists in Syncthing...
[2025-11-19T10:00:02Z] [Project:uuid-123] → Folder confirmed in Syncthing ✓
[2025-11-19T10:00:02Z] [Project:uuid-123] → Listening for LocalIndexUpdated event...
[2025-11-19T10:00:03Z] [Project:uuid-123] → Event: RemoteFolderSummary (folder known)
[2025-11-19T10:00:05Z] [Project:uuid-123] → Event: LocalIndexUpdated (scan complete)
[2025-11-19T10:00:05Z] [Project:uuid-123] → Fetching file list...
[2025-11-19T10:00:06Z] [Project:uuid-123] → Retrieved 523 files
[2025-11-19T10:00:06Z] [Project:uuid-123] → Converting to snapshot format...
[2025-11-19T10:00:06Z] [Project:uuid-123] → Saving snapshot to storage...
[2025-11-19T10:00:07Z] [Project:uuid-123] → Snapshot saved: snapshots/uuid-123-snapshot.json.gz
[2025-11-19T10:00:07Z] [Project:uuid-123] → Updating project record...
[2025-11-19T10:00:07Z] [Project:uuid-123] → CREATION COMPLETE ✓
```

This approach ensures:
1. **No premature responses** - folder is guaranteed to exist
2. **Clear visibility** - detailed logging of each step
3. **Proper timeouts** - sufficient for large projects
4. **Client safety** - folder definitely ready when response received
5. **Error detection** - any failures are caught before response
