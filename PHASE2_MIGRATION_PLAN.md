# Phase 2: Cloud Endpoint Migration Plan

## Objective
Migrate Syncthing-related endpoints from Cloud backend to Go service, keeping cloud endpoints DB-only.

## Current State Analysis

### Cloud Backend Endpoints (33 total in projects)
Located in: `/cloud/src/api/projects/routes.ts`

**DB-Only (Safe as-is):**
1. `POST /api/projects` - Creates project DB record
2. `GET /api/projects` - Lists user's projects
3. `GET /api/projects/list/invited` - Lists invited projects
4. `GET /api/projects/list/owned` - Lists owned projects
5. `GET /api/projects/:projectId` - Get project details
6. `PUT /api/projects/:projectId` - Update project info
7. `DELETE /api/projects/:projectId` - Delete project
8. `POST /api/projects/:projectId/invite` - Send invite
9. `POST /api/projects/:projectId/invite-token` - Create invite token
10. `POST /api/projects/:projectId/join` - Join project
11. `GET /api/projects/:projectId/invited-users` - List invited users

**NEEDS_SPLIT (Syncthing operations):**
1. `POST /api/projects/:projectId/devices` - **Add device to project** ⚠️
2. `DELETE /api/projects/:projectId/devices/:deviceId` - **Remove device** ⚠️
3. `POST /api/projects/:projectId/sync-start` - **Start sync** ⚠️
4. `POST /api/projects/:projectId/pause-sync` - **Pause sync** ⚠️
5. `POST /api/projects/:projectId/resume-sync` - **Resume sync** ⚠️
6. `POST /api/projects/:projectId/sync-stop` - **Stop sync** ⚠️
7. `GET /api/projects/:projectId/sync-status` - **Get sync status** ⚠️
8. `GET /api/projects/:projectId/files-list` - **List files** ⚠️
9. `GET /api/projects/:projectId/file-tree` - **Get file tree** ⚠️
10. `POST /api/projects/:projectId/files-sync` - **Sync file metadata** ⚠️
11. `POST /api/projects/:projectId/generate-snapshot` - **Generate snapshot** ⚠️
12. `GET /api/projects/:projectId/sync-events` - **Get sync events** ⚠️
13. `GET /api/projects/:projectId/file-sync-status` - **Get file sync status** ⚠️
14. `PUT /api/projects/:projectId/refresh-snapshot` - **Refresh snapshot** ⚠️
15. `GET /api/projects/:projectId/snapshot-metadata` - **Get snapshot metadata** ⚠️
16. `POST /api/projects/:projectId/ensure-folder` - **Ensure folder exists** ⚠️

## Migration Strategy

### Phase 2a: Critical Sync Operations (Week 1)
**Priority: HIGH** - These are the core operations needed for basic sync to work

**Go Service Endpoints Already Ready:**
- ✅ `POST /api/v1/projects/:projectId/devices` - AddDevice
- ✅ `DELETE /api/v1/projects/:projectId/devices/:deviceId` - RemoveDevice
- ✅ `POST /api/v1/projects/:projectId/sync/start` - StartSync
- ✅ `POST /api/v1/projects/:projectId/sync/pause` - PauseSync
- ✅ `POST /api/v1/projects/:projectId/sync/resume` - ResumeSync
- ✅ `POST /api/v1/projects/:projectId/sync/stop` - StopSync
- ✅ `GET /api/v1/projects/:projectId/sync/status` - GetSyncStatus

**Steps:**
1. Update Electron IPC handlers in `/electron/src/ipcHandlers/project.ts` to call Go service
2. Add auth token forwarding to Go service from Electron main
3. Update cloud endpoints to accept sync operations but delegate to Go service
4. Test sync operations end-to-end

### Phase 2b: File Operations (Week 1-2)
**Priority: MEDIUM** - File listing and tree building

**Go Service Endpoints Already Ready:**
- ✅ `GET /api/v1/projects/:projectId/files` - GetFiles
- ✅ `GET /api/v1/projects/:projectId/files-tree` - GetFileTree

**Steps:**
1. Implement actual file listing in FileService.GetFiles()
2. Implement file tree building in FileService.GetFileTree()
3. Update cloud endpoints to call Go service
4. Test file operations

### Phase 2c: Snapshot Operations (Week 2)
**Priority: MEDIUM** - Snapshots for version control

**Go Service Endpoints Already Ready:**
- ✅ `POST /api/v1/projects/:projectId/snapshot` - GenerateSnapshot

**Steps:**
1. Implement snapshot generation logic
2. Coordinate with cloud for storage
3. Update cloud endpoints to call Go service

### Phase 2d: Status & Event Operations (Week 2-3)
**Priority: LOW** - Informational endpoints

**Endpoints to implement:**
- GET /api/v1/projects/:projectId/events
- GET /api/v1/projects/:projectId/sync-events
- GET /api/v1/projects/:projectId/file-sync-status
- GET /api/v1/projects/:projectId/snapshot-metadata

## Implementation Tasks

### Task 1: Update Electron IPC Handlers (Immediate)
**File:** `/electron/src/ipcHandlers/project.ts`

Changes needed:
```typescript
// OLD: Direct Syncthing calls
await syncthingClient.addFolder(projectId, name, localPath);

// NEW: Call Go service
const response = await fetch('http://localhost:5001/api/v1/projects', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    projectId, name, localPath, deviceId, ownerId, accessToken
  })
});
```

### Task 2: Create Electron HTTP Client (Immediate)
**File:** `/electron/src/services/goAgentClient.ts`

Needed methods:
- createProject(req)
- deleteProject(projectId)
- addDevice(projectId, deviceId)
- removeDevice(projectId, deviceId)
- startSync(projectId)
- pauseSync(projectId)
- resumeSync(projectId)
- stopSync(projectId)
- getSyncStatus(projectId)
- getFiles(projectId)
- getFileTree(projectId)
- generateSnapshot(projectId)

### Task 3: Update Cloud Endpoints (Phase 2a)
**File:** `/cloud/src/api/projects/routes.ts`

For each NEEDS_SPLIT endpoint:
1. Keep the DB operation
2. Call Go service endpoint instead of SyncthingService
3. Forward auth token from request

Example:
```typescript
router.post('/:projectId/devices', authMiddleware, async (req: Request, res: Response) => {
  // 1. Update DB
  const { data, error } = await supabase
    .from('project_devices')
    .insert({ project_id: projectId, device_id: deviceId });

  // 2. Call Go service
  try {
    const response = await fetch('http://localhost:5001/api/v1/projects/:projectId/devices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(req as any).user.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ deviceId })
    });
    
    if (!response.ok) throw new Error('Go service failed');
  } catch (e) {
    // Go service may not be available, but DB is updated
    console.warn('Go service call failed, but DB updated');
  }

  res.json({ success: true });
});
```

### Task 4: Implement File Operations in Go Service (Phase 2b)

**File:** `/go-agent/internal/services/file_service.go`

Need to implement:
1. `GetFiles()` - Call Syncthing API to list files
2. `GetFileTree()` - Build nested structure from files
3. Caching for performance

```go
// Get folder contents from Syncthing
folders, err := fs.syncClient.GetFolderStatus(projectID)
// Convert to file list format
// Cache for 30 seconds
```

### Task 5: Implement Snapshot in Go Service (Phase 2c)

**File:** `/go-agent/internal/services/file_service.go`

Need to implement:
1. Scan project directory
2. Generate file manifest
3. Create tar/zip archive
4. Upload to cloud storage
5. Store metadata in DB

## Success Criteria

### Phase 2a (Critical - End of Week 1)
- ✅ Electron IPC handlers updated to call Go service
- ✅ Go service receives all sync operation requests
- ✅ Sync operations work end-to-end (start, pause, resume, stop)
- ✅ Device add/remove works
- ✅ Cloud endpoints can delegate or call directly

### Phase 2b (File Ops - End of Week 1-2)
- ✅ File listing works
- ✅ File tree structure returns correct hierarchy
- ✅ Performance acceptable (< 500ms for typical project)

### Phase 2c (Snapshots - End of Week 2)
- ✅ Snapshot generation works
- ✅ Snapshots stored and retrievable

### Phase 2d (Status - End of Week 2-3)
- ✅ All event and status endpoints working
- ✅ Real-time updates via WebSocket

## Rollback Plan

If Phase 2 encounters issues:
1. Keep both code paths active (check flag)
2. Route based on environment variable
3. Fallback to cloud endpoints if Go service unavailable
4. Gradual rollout by user segment

## Next Steps

**Immediate (Next session):**
1. ✅ Verify Phase 1 builds and deploys
2. Create Electron HTTP client for Go service
3. Update first set of Electron IPC handlers
4. Test sync operations with Go service

**Then:**
1. Update cloud endpoints to call Go service
2. Implement file operations
3. Test full workflow

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Go service not running | CRITICAL | Fallback to cloud endpoints, auto-restart |
| Auth token invalid | HIGH | Pass token from Electron main to Go service |
| Syncthing API changes | MEDIUM | Version check, graceful degradation |
| Network latency | MEDIUM | Cache results, async operations |
| Data inconsistency | HIGH | Transaction-like operations, DB as source of truth |

