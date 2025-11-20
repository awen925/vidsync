# Electron → Go Binary: Quick Reference

## IPC Actions Using GoAgentClient (9 Currently Active)

### ✅ ACTIVE - Called in Real Application Flow

```
PROJECT CREATION FLOW:
  Electron UI → IPC: project:createWithSnapshot
                     ↓
                 GoAgentClient.createProjectWithSnapshot()
                 └→ POST /api/v1/projects/with-snapshot
                    • Creates in Cloud API
                    • Sets up Syncthing folder
                    • Triggers snapshot generation


SYNC CONTROL FLOW:
  Electron UI → IPC: project:pauseSync
                     ↓
                 GoAgentClient.pauseSync()
                 └→ POST /api/v1/projects/{id}/sync/pause
  
  Electron UI → IPC: project:resumeSync
                     ↓
                 GoAgentClient.resumeSync()
                 └→ POST /api/v1/projects/{id}/sync/resume
  
  Electron UI → IPC: project:stopSync
                     ↓
                 GoAgentClient.stopSync()
                 └→ POST /api/v1/projects/{id}/sync/stop


DEVICE MANAGEMENT FLOW:
  Electron UI → IPC: project:addDeviceToFolder
                     ↓
                 GoAgentClient.addDevice()
                 └→ POST /api/v1/projects/{id}/devices
                    • Updates Syncthing
                    • Updates Cloud API
  
  Electron UI → IPC: project:removeDeviceFromFolder
                     ↓
                 GoAgentClient.removeDevice()
                 └→ DELETE /api/v1/projects/{id}/devices/{id}
                    • Removes from Syncthing
                    • Updates Cloud API


STATUS POLLING FLOW:
  Electron UI → IPC: project:getStatus
                     ↓
                 GoAgentClient.getProjectStatus()
                 └→ GET /api/v1/projects/{id}/status
                    Returns: {
                      projectId,
                      snapshotUrl,
                      snapshotFileCount,
                      snapshotTotalSize,
                      syncStatus
                    }


PROGRESS TRACKING FLOW (Phase 2e):
  Electron → ProgressClient.getSnapshotProgress()
             ↓
         GoAgentClient.getSnapshotProgress()
         └→ GET /api/v1/projects/{id}/progress (polling)
            Returns: {
              step,
              stepNumber,
              totalSteps,
              progress (0-100%),
              fileCount,
              totalSize,
              message,
              snapshotUrl
            }
  
  Electron → ProgressClient.subscribeSnapshotProgress()
             ↓
         GoAgentClient.subscribeSnapshotProgress()
         └→ EventSource: GET /api/v1/projects/{id}/progress/stream (SSE)
            Real-time progress updates
```

---

## Method Reference

### GoAgentClient Methods

**Project Operations:**
```typescript
createProjectWithSnapshot(projectId, name, localPath, deviceId, ownerId, accessToken)
  POST /projects/with-snapshot
  → Creates project + Syncthing + triggers snapshot

getProjectStatus(projectId)
  GET /projects/{projectId}/status
  → Returns current status + snapshot metadata

deleteProject(projectId, accessToken)
  DELETE /projects/{projectId}
  → Deletes project + Syncthing folder

getProject(projectId, accessToken)
  GET /projects/{projectId}
  → Returns project details
```

**Sync Control:**
```typescript
pauseSync(projectId, accessToken)
  POST /projects/{projectId}/sync/pause
  
resumeSync(projectId, accessToken)
  POST /projects/{projectId}/sync/resume
  
stopSync(projectId, accessToken)
  POST /projects/{projectId}/sync/stop
  
startSync(projectId, localPath, accessToken)
  POST /projects/{projectId}/sync/start
  
getSyncStatus(projectId, accessToken)
  GET /projects/{projectId}/sync/status
```

**Device Management:**
```typescript
addDevice(projectId, deviceId, accessToken)
  POST /projects/{projectId}/devices
  → Adds device to folder (collaboration)
  
removeDevice(projectId, deviceId, accessToken)
  DELETE /projects/{projectId}/devices/{deviceId}
  → Removes device from folder
  
syncDevice(userID, accessToken)
  POST /devices/sync
  → Syncs device info with Cloud
  
getDeviceStatus(deviceId)
  GET /devices/{deviceId}/status
```

**Snapshot & Files:**
```typescript
generateSnapshot(projectId, accessToken)
  POST /projects/{projectId}/snapshot
  
getFiles(projectId, limit, offset, accessToken)
  GET /projects/{projectId}/files
  
getFileTree(projectId, accessToken)
  GET /projects/{projectId}/files-tree
```

**Progress Tracking (Phase 2e):**
```typescript
getSnapshotProgress(projectId)
  GET /projects/{projectId}/progress
  → Polling endpoint for progress
  
subscribeSnapshotProgress(projectId)
  GET /projects/{projectId}/progress/stream (SSE)
  → Server-Sent Events stream
  → Returns EventSource object
```

---

## IPC Handler Mapping

| IPC Handler | GoAgentClient Method | Endpoint |
|-------------|---------------------|----------|
| `project:createWithSnapshot` | `createProjectWithSnapshot()` | POST /projects/with-snapshot |
| `project:getStatus` | `getProjectStatus()` | GET /projects/{id}/status |
| `project:pauseSync` | `pauseSync()` | POST /projects/{id}/sync/pause |
| `project:resumeSync` | `resumeSync()` | POST /projects/{id}/sync/resume |
| `project:stopSync` | `stopSync()` | POST /projects/{id}/sync/stop |
| `project:addDeviceToFolder` | `addDevice()` | POST /projects/{id}/devices |
| `project:removeDeviceFromFolder` | `removeDevice()` | DELETE /projects/{id}/devices/{id} |

---

## What Doesn't Use GoAgentClient?

### Direct Syncthing Calls (SyncthingManager)
```typescript
syncthing:startForProject(projectId, localPath)
syncthing:getDeviceId(projectId)
syncthing:importRemote(projectId, remoteDeviceId)
syncthing:statusForProject(projectId)
syncthing:progressForProject(projectId)
syncthing:stopForProject(projectId)
syncthing:openGui(projectId)
syncthing:removeProjectFolder(projectId)
```

### Direct Filesystem Calls
```typescript
fs:listDir(dirPath)
fs:listDirectory(dirPath, includeHidden)
fs:scanDirTree(dirPath, options)
fs:scanDirFlat(dirPath)
fs:getDirStats(dirPath)
```

### File Watching
```typescript
fileWatcher:startWatching(projectId, localPath, authToken)
fileWatcher:stopWatching(projectId)
fileWatcher:getStatus(projectId)
```

### Direct Device Info
```typescript
device:getInfo() → Local storage + fallback to agent port 29999
```

### Nebula Management
```typescript
nebula:generateConfig(projectId)
nebula:start(projectId)
nebula:openFolder(projectId)
bundle:extract(projectId, base64Zip)
```

### Other Utils
```typescript
secureStore:set(token)
secureStore:get()
secureStore:clear()
privilege:applySetcap(binaryPath)
privilege:elevateSetcap(binaryPath)
snapshot:getCached(projectId)
snapshot:downloadAndCache(projectId, downloadUrl)
snapshot:clearProject(projectId)
snapshot:clearAll()
```

---

## Go Agent as Orchestrator

### What It Handles
1. **Project Creation**: Coordinates Cloud API + Syncthing + Snapshot
2. **Device Sync**: Updates both Syncthing and Cloud API
3. **Project Status**: Aggregates info from multiple sources
4. **Progress Tracking**: Real-time streaming with reconnection logic

### What It Doesn't Handle
1. **File Operations**: Local filesystem access (uses OS directly)
2. **Direct Syncthing Control**: Some operations still go direct
3. **Nebula Management**: Managed by electron separately
4. **Authentication**: No token refresh (Electron handles this)

---

## Current Flow vs Potential Optimization

### Today (Phases 1-2e)
```
Electron UI
  ├→ GoAgentClient (9 orchestration methods)
  ├→ SyncthingManager (direct API calls)
  ├→ CloudAPI (direct API calls via fetch/axios)
  └→ Filesystem (direct OS calls)
```

### Potential Future (Phase 3+)
```
Electron UI
  └→ GoAgentClient (all coordinated calls)
      ├→ Cloud API
      ├→ Syncthing API
      └→ File operations
```

**Pros of consolidation**:
- Single error handling
- Centralized logging/audit
- Easier to add features (rate limiting, caching)
- Better fault isolation

**Cons of consolidation**:
- Go binary becomes bottleneck
- Harder to debug (more layers)
- Latency for simple operations
- Larger surface area for bugs

---

## Connection Details

**Go Agent Server**:
- Address: `http://localhost:5001`
- Base URL: `http://localhost:5001/api/v1`
- Timeout: 30 seconds
- Health check: `GET /api/v1/health`

**Authentication**:
- Method: Bearer token in Authorization header
- Source: `accessToken` parameter (passed from Electron)
- Refresh: Handled by Electron (not Go agent)

**Error Handling**:
- HTTP status codes used for errors
- Response body: `{ error: "message" }`
- Logging: Forwarded to console + renderer logs

---

## Testing GoAgentClient Locally

```bash
# Check if Go agent is running
curl http://localhost:5001/api/v1/health

# Create project with snapshot
curl -X POST http://localhost:5001/api/v1/projects/with-snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-1",
    "name": "Test Project",
    "localPath": "/tmp/test",
    "deviceId": "device-1",
    "ownerId": "user-1",
    "accessToken": "test-token"
  }'

# Get project status
curl http://localhost:5001/api/v1/projects/test-1/status

# Get progress
curl http://localhost:5001/api/v1/projects/test-1/progress

# Subscribe to progress (SSE)
curl -N http://localhost:5001/api/v1/projects/test-1/progress/stream
```

---

## Next: Where to Add New Features?

**Add to GoAgentClient if**:
- Requires coordinating multiple services (Cloud + Syncthing)
- Needs progress tracking
- Should be atomic operation
- Needs error resilience/retry logic

**Keep Direct if**:
- Local filesystem only
- Simple single API call
- No coordination needed
- Performance-critical with many calls
