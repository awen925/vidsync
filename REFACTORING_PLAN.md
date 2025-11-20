# Architecture Refactoring Plan: Go Service as Bridge

## Current State Analysis

### Cloud API Endpoints Classification

**DB_ONLY (16 endpoints)** - Keep in Cloud:
- Authentication endpoints
- Device registration/listing
- Project CRUD operations
- Project membership management
- File event tracking (already in DB)
- Download path management

**NEEDS_SPLIT (16 endpoints)** - Move Syncthing logic to Go:

1. **POST /projects** - Creates folder (Line 38)
   - Current: Syncthing folder creation
   - Target: DB only; Go service handles folder

2. **GET /projects/:projectId/files-list** (Line 947)
   - Current: SyncthingService.getFolderFiles()
   - Target: Go service calls Syncthing REST API

3. **GET /projects/:projectId/file-tree** (Line 1160)
   - Current: SyncthingService.getFolderFiles()
   - Target: Go service calls Syncthing REST API

4. **GET /projects/:projectId/file-sync-status** (Line 1235)
   - Current: SyncthingService.getFolderStatus()
   - Target: Go service calls Syncthing REST API

5. **PUT /projects/:projectId/refresh-snapshot** (Line 1340)
   - Current: SyncthingService.getFolderFiles()
   - Target: Go service calls Syncthing REST API

6. **POST /projects/:projectId/sync-start** (Line 1393) ⭐ HIGH PRIORITY
   - Current: 5 Syncthing operations
   - Target: Go service orchestrates all

7. **POST /projects/:projectId/pause-sync** (Line 1513)
   - Current: SyncthingService.pauseFolder()
   - Target: Go service calls Syncthing REST API

8. **POST /projects/:projectId/resume-sync** (Line 1595)
   - Current: SyncthingService.resumeFolder()
   - Target: Go service calls Syncthing REST API

9. **POST /projects/:projectId/sync-stop** (Line 1652)
   - Current: SyncthingService.removeDeviceFromFolder()
   - Target: Go service calls Syncthing REST API

10. **GET /projects/:projectId/files** (Line 1789)
    - Current: SyncthingService.getFolderFiles()
    - Target: Go service calls Syncthing REST API

11. **POST /projects/:projectId/files-sync** (Line 1940)
    - Current: SyncthingService folder scan
    - Target: Go service calls Syncthing REST API

12. **POST /projects/:projectId/generate-snapshot** (Line 2180)
    - Current: SyncthingService folder scan
    - Target: Go service calls Syncthing REST API

13. **GET /projects/:projectId/sync-status** (Line 2273)
    - Current: SyncthingService.getFolderStatus()
    - Target: Go service calls Syncthing REST API

14. **POST /projects/:projectId/devices** (Line 826)
    - Current: SyncthingService.addDeviceToFolder()
    - Target: Go service calls Syncthing REST API

15. **DELETE /projects/:projectId/devices/:deviceId** (Line 871)
    - Current: SyncthingService.removeDeviceFromFolder()
    - Target: Go service calls Syncthing REST API

16. **POST /projects/:projectId/ensure-folder** (Line 2438)
    - Current: SyncthingService.createFolder()
    - Target: Go service calls Syncthing REST API

### Current Code Locations

**Syncthing operations in:**
- `cloud/src/services/syncthingService.ts` - 22 methods
- `electron/src/main/syncthingManager.ts` - 18 methods
- `electron/src/main/main.ts` - 4 IPC handlers (recently added)

## Target Architecture

```
┌─────────────────────────────────┐
│  Electron Renderer (UI only)    │
└────────────────┬────────────────┘
                 │ (IPC calls)
┌────────────────▼────────────────┐
│   Electron Main (IPC handlers)  │
│   Delegates to Go service       │
└────────────────┬────────────────┘
                 │ (HTTP REST API)
┌────────────────▼────────────────┐
│  Go Service (Business Logic)    │
├─────────────────────────────────┤
│ Modules:                        │
│ ├─ project/                     │
│ ├─ sync/                        │
│ ├─ device/                      │
│ ├─ file/                        │
│ └─ handlers/                    │
├─────────────────────────────────┤
│ Dependencies:                   │
│ ├─ Syncthing REST API           │
│ ├─ Supabase API                 │
│ └─ File System (OS)             │
└─────────────────────────────────┘
```

## Implementation Order

### Phase 1: Go Service Module Structure (Days 1-2)

1.1 **Create Go service module structure:**
```
go-agent/internal/
├── handlers/           (HTTP request handlers)
│   ├── project.go
│   ├── sync.go
│   ├── device.go
│   ├── file.go
│   └── routes.go
├── services/          (Business logic)
│   ├── project_service.go
│   ├── sync_service.go
│   ├── device_service.go
│   ├── file_service.go
│   └── syncthing_service.go (new)
├── client/            (External API clients)
│   ├── supabase.go
│   ├── syncthing.go
│   └── types.go
└── models/            (Data models)
    ├── project.go
    ├── sync.go
    ├── device.go
    └── file.go
```

1.2 **Enhance SyncthingClient in Go:**
   - Currently has basic methods
   - Add: getPauseFolder(), resumeFolder(), addDevice(), removeDevice()
   - Add: getFileList(), getFolderStatus(), createFolder()

1.3 **Create Go HTTP Router:**
   - Add project endpoints that call Go services
   - Parallel with cloud backend restructuring

### Phase 2: Move Syncthing Logic from Cloud to Go (Days 2-3)

2.1 **Move 16 "NEEDS_SPLIT" endpoints:**
   - For each endpoint, extract Syncthing logic
   - Move to Go service equivalent
   - Keep cloud endpoint as DB-only proxy

2.2 **Example refactoring pattern:**
   
   **Before (Cloud):**
   ```typescript
   // POST /projects/:projectId/pause-sync
   router.post('/:projectId/pause-sync', async (req, res) => {
     // Call Syncthing API (BAD)
     await syncthingService.pauseFolder(projectId);
     res.json({ success: true });
   });
   ```

   **After (Cloud):**
   ```typescript
   // POST /projects/:projectId/pause-sync
   router.post('/:projectId/pause-sync', async (req, res) => {
     // Only DB operations
     await supabase.from('projects').update(...);
     // Tell client to call Go service
     res.json({ success: true, message: 'Call Go service' });
   });
   ```

   **New (Go Service):**
   ```go
   // POST /api/v1/projects/{projectId}/pause
   func PauseSyncHandler(w http.ResponseWriter, r *http.Request) {
     projectId := chi.URLParam(r, "projectId")
     
     // Call Syncthing
     err := syncService.PauseFolder(projectId)
     // Call Supabase to update DB
     err := dbService.UpdateProjectStatus(projectId, "paused")
     
     w.Header().Set("Content-Type", "application/json")
     json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
   }
   ```

### Phase 3: Move Syncthing Logic from Electron to Go (Days 3-4)

3.1 **Move 4 IPC handlers from electron/main.ts:**
   - `project:pauseSync`
   - `project:resumeSync`
   - `project:removeDeviceFromFolder`
   - `project:stopSync`

3.2 **Create corresponding Electron IPC handlers that call Go:**
   ```typescript
   ipcMain.handle('project:pauseSync', async (_ev, { projectId }) => {
     try {
       const response = await fetch('http://localhost:5001/api/v1/projects/pause', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ projectId })
       });
       const data = await response.json();
       return { ok: data.ok, error: data.error };
     } catch (e) {
       return { ok: false, error: e.message };
     }
   });
   ```

3.3 **Update all syncthingManager calls:**
   - Remove direct Syncthing operations
   - Replace with Go service calls

### Phase 4: Cloud Backend Cleanup (Days 4-5)

4.1 **Remove SyncthingService from cloud:**
   - Delete `cloud/src/services/syncthingService.ts`
   - Delete imports from all routes

4.2 **Verify all cloud endpoints are DB-only:**
   - Run grep for SyncthingService
   - Verify all Syncthing logic removed

4.3 **Update cloud API documentation:**
   - Mark endpoints as "DB operations only"
   - Document which Go service endpoints to call

### Phase 5: Electron Main Process Cleanup (Days 5-6)

5.1 **Remove direct Syncthing calls:**
   - Delete all HTTPS/fetch calls to Syncthing in main.ts
   - Keep IPC handlers that call Go service

5.2 **Remove syncthingManager module:**
   - Backup file operations only
   - Remove Syncthing REST API operations
   - Keep file operations for now

5.3 **Update preload.ts:**
   - All project IPC handlers now call Go service
   - No breaking changes for renderer

### Phase 6: Renderer Integration (Days 6-7)

6.1 **Verify renderer still works:**
   - No changes needed (IPC interface same)
   - All calls now routed through Go service

6.2 **Test end-to-end:**
   - UI → Electron IPC → Go Service → Syncthing + Supabase

## Go Service Module Details

### project_service.go
- CreateProject(name, path, owner) - Creates DB record + Syncthing folder
- DeleteProject(projectId) - Deletes DB record + Syncthing folder
- GetProject(projectId) - Reads from DB + Syncthing status
- AddDevice(projectId, deviceId) - DB update + Syncthing device add
- RemoveDevice(projectId, deviceId) - DB update + Syncthing device remove

### sync_service.go
- PauseFolder(projectId) - Calls Syncthing + updates DB
- ResumeFolder(projectId) - Calls Syncthing + updates DB
- StartSync(projectId, localPath) - Full orchestration
- GetFolderStatus(projectId) - Calls Syncthing
- GetFileList(projectId) - Calls Syncthing
- GenerateSnapshot(projectId) - Scans Syncthing + creates snapshot

### device_service.go
- RegisterDevice(deviceId, syncthingId) - DB + Syncthing
- GetDeviceStatus(deviceId) - Calls Syncthing
- SyncDeviceInfo(userId) - Gets latest Syncthing ID + updates DB

### file_service.go
- GetFiles(projectId) - Calls Syncthing
- GetFileTree(projectId) - Calls Syncthing + formats
- GetSyncStatus(projectId) - Calls Syncthing

### syncthing_service.go (Enhanced)
- CreateFolder(projectId, path, devices)
- RemoveFolder(projectId)
- PauseFolder(projectId)
- ResumeFolder(projectId)
- AddDeviceToFolder(projectId, deviceId)
- RemoveDeviceFromFolder(projectId, deviceId)
- GetFolderFiles(projectId, limit)
- GetFolderStatus(projectId)
- WaitForFolderKnown(projectId, timeout)
- WaitForFolderScanned(projectId, timeout)
- ScanFolder(projectId)
- GetDeviceId() - Gets local device ID

## Expected Benefits

1. **Separation of Concerns:**
   - Cloud = Database operations only
   - Go = Business logic + external APIs
   - Electron = UI only

2. **Better Testing:**
   - Go service can be unit tested independently
   - Mock Syncthing and Supabase responses
   - Deterministic behavior

3. **Scalability:**
   - Go service runs on user's machine (same as Syncthing)
   - Cloud remains stateless
   - No resource contention

4. **Maintainability:**
   - Single source of truth for business logic
   - Easier to add new features
   - Clear API boundaries

5. **Future Extensibility:**
   - Can add Syncthing discovery
   - Can add other sync providers
   - Can add system tray operations

## Rollback Plan

If issues occur during refactoring:
1. Keep current implementations in parallel
2. Feature-flag Go service calls
3. Revert to cloud-side Syncthing calls if needed
4. Gradual migration per endpoint

## Timeline

- **Week 1:** Phases 1-2 (Structure + Cloud refactor)
- **Week 2:** Phases 3-4 (Move from Electron, cleanup)
- **Week 3:** Phases 5-6 (Integration + testing)

**Estimated Total:** 2-3 weeks for full refactoring
