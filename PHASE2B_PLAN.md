# Phase 2b: Go Service Calls Cloud API

## Objective
Integrate CloudClient calls into Go service so that:
1. When projects are created/deleted, database is updated via Cloud API
2. When sync operations happen, Cloud is informed
3. When devices are added/removed, Cloud is notified
4. All state changes are persisted to Cloud database

## Architecture Reminder
```
Go Service (LOCAL) ←→ Cloud API (REMOTE)
    ↓
Syncthing
```

The Go service calls OUT to the Cloud, not the other way around.

## Current State Analysis

### CloudClient Methods Available ✅
- `RegisterDevice(deviceID, deviceName, platform)` - Register a device
- `ReportSyncEvent(projectID, eventType, path, message)` - Report sync events
- `UpdateProjectStatus(projectID, status, accessToken)` - Update project status
- `UpdateDevice(deviceID, req, accessToken)` - Update device info
- `post/put/get` helpers with Bearer token auth

### Service Methods Need CloudClient Calls ⏳

**ProjectService:**
- `CreateProject()` - ✅ Has logic, needs: Cloud API call to create project
- `GetProject()` - ✅ Has logic, needs: optionally call Cloud for metadata
- `DeleteProject()` - ✅ Has logic, needs: Cloud API call to delete project
- `AddDevice()` - ✅ Has logic, needs: Cloud API call to add device to project
- `RemoveDevice()` - ✅ Has logic, needs: Cloud API call to remove device

**SyncService:**
- `StartSync()` - ✅ Has logic, needs: Cloud API call to update status to "syncing"
- `PauseSync()` - ✅ Has logic, needs: Cloud API call to update status to "paused"
- `ResumeSync()` - ✅ Has logic, needs: Cloud API call to update status to "syncing"
- `StopSync()` - ✅ Has logic, needs: Cloud API call to update status to "stopped"
- `GetSyncStatus()` - ✅ Has logic, needs: optional Cloud cache update

**DeviceService:**
- `SyncDevice()` - ✅ Has logic, needs: Cloud API call to register/update device
- `GetDeviceStatus()` - ✅ Has logic, no Cloud call needed

**FileService:**
- `GetFiles()` - ⏳ Needs implementation
- `GetFileTree()` - ⏳ Needs implementation
- `GenerateSnapshot()` - ⏳ Needs implementation

## Implementation Tasks

### Task 1: Update ProjectService with CloudClient Calls

**File:** `/go-agent/internal/services/project_service.go`

Changes needed:

```go
// CreateProject - after successfully creating Syncthing folder
// ADD:
response, err := ps.cloudClient.post("/projects", map[string]interface{}{
  "projectId": req.ProjectID,
  "name": req.Name,
  "localPath": req.LocalPath,
  "ownerId": req.OwnerID,
})
if err != nil {
  ps.logger.Warn("[ProjectService] Failed to notify cloud: %v", err)
  // Continue anyway - folder created locally even if cloud update fails
}

// DeleteProject - after removing Syncthing folder
// ADD:
err = ps.cloudClient.putWithAuth(
  fmt.Sprintf("/projects/%s", projectID),
  map[string]interface{}{"status": "deleted"},
  accessToken,
)

// AddDevice - after adding device to Syncthing folder
// ADD:
_, err := ps.cloudClient.post(
  fmt.Sprintf("/projects/%s/devices", projectID),
  map[string]interface{}{"deviceId": deviceID},
)

// RemoveDevice - after removing device from Syncthing folder
// ADD:
err := ps.cloudClient.putWithAuth(
  fmt.Sprintf("/projects/%s/devices/%s", projectID, deviceID),
  map[string]interface{}{"status": "removed"},
  accessToken,
)
```

### Task 2: Update SyncService with CloudClient Calls

**File:** `/go-agent/internal/services/sync_service.go`

Changes needed:

```go
// StartSync - after Syncthing rescan succeeds
// ADD:
_, err := ss.cloudClient.post(
  fmt.Sprintf("/projects/%s/sync-events", projectID),
  map[string]interface{}{
    "type": "sync_started",
    "timestamp": time.Now().Unix(),
  },
)

// PauseSync - after Syncthing pause succeeds
// ADD:
err := ss.cloudClient.putWithAuth(
  fmt.Sprintf("/projects/%s", projectID),
  map[string]interface{}{"syncStatus": "paused"},
  accessToken,
)

// ResumeSync - after Syncthing resume succeeds
// ADD:
err := ss.cloudClient.putWithAuth(
  fmt.Sprintf("/projects/%s", projectID),
  map[string]interface{}{"syncStatus": "syncing"},
  accessToken,
)

// StopSync - after device removed
// ADD:
err := ss.cloudClient.putWithAuth(
  fmt.Sprintf("/projects/%s", projectID),
  map[string]interface{}{"syncStatus": "stopped"},
  accessToken,
)
```

### Task 3: Update DeviceService with CloudClient Calls

**File:** `/go-agent/internal/services/device_service.go`

Changes needed:

```go
// SyncDevice - after getting Syncthing device ID
// ADD:
response, err := ds.cloudClient.post(
  "/devices/sync",
  map[string]interface{}{
    "userId": userID,
    "deviceId": deviceID,
    "syncthingId": deviceID,
    "timestamp": time.Now().Unix(),
  },
)
if err != nil {
  ds.logger.Warn("[DeviceService] Failed to sync with cloud: %v", err)
  // Continue - local sync still works
}
```

### Task 4: Implement File Operations

**File:** `/go-agent/internal/services/file_service.go`

Need to implement actual file operations:

```go
// GetFiles - list files in project folder
func (fs *FileService) GetFiles(ctx context.Context, projectID, limit, offset string) (map[string]interface{}, error) {
  // 1. Get folder status from Syncthing
  // 2. Get local file list
  // 3. Return files with metadata
  // 4. Cache for 30 seconds
}

// GetFileTree - build nested structure
func (fs *FileService) GetFileTree(ctx context.Context, projectID string) (map[string]interface{}, error) {
  // 1. Get folder path from Syncthing config
  // 2. Walk file tree
  // 3. Build nested JSON structure
  // 4. Return file tree
}

// GenerateSnapshot - create version snapshot
func (fs *FileService) GenerateSnapshot(ctx context.Context, projectID, accessToken string) (map[string]interface{}, error) {
  // 1. Scan project folder
  // 2. Generate manifest (list of all files + hashes)
  // 3. Create tar/zip archive
  // 4. POST to Cloud for storage
  // 5. Return snapshot metadata
}
```

## Error Handling Strategy

### Non-Critical Cloud Failures (Don't Block Local Operations)
- Cloud is down but Syncthing works: log warning, continue
- Cloud update slow: timeout after 5s, continue
- Examples:
  - RegisterDevice fails → local device still works
  - ReportSyncEvent fails → sync continues
  - UpdateProjectStatus fails → sync still happens

### Critical Cloud Failures (Might Block)
- Authentication fails (invalid token) → return error
- Authorization fails (no permission) → return error
- Data validation fails (bad request) → return error

Pattern:
```go
err := ss.cloudClient.UpdateProjectStatus(...)
if err != nil {
  // Check if it's auth error
  if isAuthError(err) {
    return err // Block
  }
  // Otherwise just warn and continue
  ss.logger.Warn("Cloud update failed: %v", err)
}
```

## Testing Plan

### Unit Tests
```go
// Mock CloudClient
type MockCloudClient struct {
  lastCall map[string]interface{}
}

// Test: CreateProject calls CloudClient.post
// Test: PauseSync calls CloudClient.putWithAuth
// Test: DeleteProject calls CloudClient.put
```

### Integration Tests
```bash
# Start Go service with CLOUD_URL=http://localhost:6666
# Start Cloud API on :6666
# Create project via Go service
# Verify project created in Cloud DB
# Pause sync
# Verify status updated in Cloud DB
```

## Success Criteria

- ✅ All service methods call CloudClient appropriately
- ✅ Cloud failures don't block local operations
- ✅ Bearer tokens forwarded for auth
- ✅ Error handling logs all failures
- ✅ Tests verify CloudClient calls made
- ✅ Manual testing: data appears in Cloud DB
- ✅ Go service builds without errors

## Timeline

- **CreateProjectService calls:** 30 min
- **SyncService calls:** 30 min
- **DeviceService calls:** 20 min
- **File operations impl:** 1 hour
- **Error handling:** 30 min
- **Testing:** 1 hour
- **Total:** ~4 hours

## Blocked Dependencies

None! All dependencies ready:
- ✅ CloudClient exists and initialized
- ✅ Services exist with business logic
- ✅ Config supports CLOUD_URL
- ✅ Main.go passes cloudClient to services

## Next After This Phase

**Phase 2c: Cloud Endpoint Migration** ⏳
- Update cloud backend to call Go service for Syncthing operations
- OR: Remove Syncthing operations from cloud entirely
- Replace cloud endpoints with forwarding to Go service

**Phase 2d: Error Handling & Resilience** ⏳
- Add retry logic for Cloud API calls
- Add local queue for offline operations
- Implement sync when Cloud becomes available again

**Phase 3: Production Testing** ⏳
- End-to-end testing with real Cloud API
- Performance testing
- Failure scenario testing

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Cloud API down | MEDIUM | Continue local ops, queue for retry |
| Invalid auth token | HIGH | Return 401, prompt re-auth in UI |
| Network latency | LOW | 10s timeout should be sufficient |
| Data inconsistency | MEDIUM | Cloud is source of truth, resync on mismatch |

