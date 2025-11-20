# Electron → Go Binary API Flow Analysis

## Overview

In Electron, **16 actions** go through the Go binary (localhost:5001) for calling Cloud API or Syncthing services. The Go agent acts as a bridge that orchestrates both APIs transparently.

---

## Actions Using GoAgentClient

### Category 1: Project Management (5 actions)

#### 1. **Create Project with Snapshot** ✅ (Go + Cloud + Syncthing)
```typescript
// File: main.ts, Line 306-315
ipcMain.handle('project:createWithSnapshot', async (_ev, { name, description, localPath, accessToken }) => {
  const result = await goAgentClient.createProjectWithSnapshot(
    projectId, name, localPath, deviceId, ownerId, accessToken
  );
});
```
**Endpoint**: `POST /api/v1/projects/with-snapshot`  
**What it does**:
- Creates project in Cloud API
- Creates Syncthing folder locally
- Triggers background snapshot generation
- Returns projectId for progress tracking

#### 2. **Get Project Status** ✅ (Cloud + Syncthing)
```typescript
// File: main.ts, Line 324-330
ipcMain.handle('project:getStatus', async (_ev, projectId) => {
  const result = await goAgentClient.getProjectStatus(projectId);
});
```
**Endpoint**: `GET /api/v1/projects/{projectId}/status`  
**What it does**:
- Fetches current project status from Cloud
- Includes Syncthing sync status
- Returns snapshot metadata (URL, file count, size)

#### 3. **Delete Project** ❌ (Not used in IPC)
```typescript
async deleteProject(projectId, accessToken)
```
**Endpoint**: `DELETE /api/v1/projects/{projectId}`  
**What it does**:
- Removes project from Cloud
- Deletes local Syncthing folder

#### 4. **Get Project Details** ❌ (Not used in IPC)
```typescript
async getProject(projectId, accessToken)
```
**Endpoint**: `GET /api/v1/projects/{projectId}`  
**What it does**:
- Fetches project details from Cloud
- Includes Syncthing metadata

#### 5. **Create Project** ❌ (Replaced by createProjectWithSnapshot)
```typescript
async createProject(projectId, name, localPath, deviceId, ownerId, accessToken)
```
**Endpoint**: `POST /api/v1/projects`  
**What it does**:
- Basic project creation without snapshot

---

### Category 2: Sync Control (4 actions)

#### 6. **Pause Sync** ✅ (Syncthing)
```typescript
// File: main.ts, Line 283-290
ipcMain.handle('project:pauseSync', async (_ev, { projectId, accessToken }) => {
  const result = await goAgentClient.pauseSync(projectId, accessToken);
});
```
**Endpoint**: `POST /api/v1/projects/{projectId}/sync/pause`  
**What it does**:
- Pauses Syncthing folder synchronization
- Notifies Cloud API of state change

#### 7. **Resume Sync** ✅ (Syncthing)
```typescript
// File: main.ts, Line 347-354
ipcMain.handle('project:resumeSync', async (_ev, { projectId, accessToken }) => {
  const result = await goAgentClient.resumeSync(projectId, accessToken);
});
```
**Endpoint**: `POST /api/v1/projects/{projectId}/sync/resume`  
**What it does**:
- Resumes Syncthing folder synchronization
- Updates Cloud API

#### 8. **Stop Sync** ✅ (Syncthing + Cloud)
```typescript
// File: main.ts, Line 371-379
ipcMain.handle('project:stopSync', async (_ev, { projectId, deviceId, accessToken }) => {
  const result = await goAgentClient.stopSync(projectId, accessToken);
});
```
**Endpoint**: `POST /api/v1/projects/{projectId}/sync/stop`  
**What it does**:
- Stops Syncthing synchronization
- Removes device from folder
- Updates Cloud API

#### 9. **Start Sync** ❌ (Not used in IPC)
```typescript
async startSync(projectId, localPath, accessToken)
```
**Endpoint**: `POST /api/v1/projects/{projectId}/sync/start`  
**What it does**:
- Starts Syncthing synchronization
- Updates Cloud API

#### 10. **Get Sync Status** ❌ (Not used in IPC)
```typescript
async getSyncStatus(projectId, accessToken)
```
**Endpoint**: `GET /api/v1/projects/{projectId}/sync/status`  
**What it does**:
- Fetches current Syncthing sync status

---

### Category 3: Device Management (4 actions)

#### 11. **Add Device to Folder** ✅ (Syncthing + Cloud)
```typescript
// File: main.ts, Line 359-366
ipcMain.handle('project:addDeviceToFolder', async (_ev, { projectId, deviceId, accessToken }) => {
  const result = await goAgentClient.addDevice(projectId, deviceId, accessToken);
});
```
**Endpoint**: `POST /api/v1/projects/{projectId}/devices`  
**What it does**:
- Adds device to Syncthing folder (for collaboration)
- Updates Cloud API with device info
- Syncs device keys

#### 12. **Remove Device from Folder** ✅ (Syncthing + Cloud)
```typescript
// File: main.ts, Line 335-342
ipcMain.handle('project:removeDeviceFromFolder', async (_ev, { projectId, deviceId, accessToken }) => {
  const result = await goAgentClient.removeDevice(projectId, deviceId, accessToken);
});
```
**Endpoint**: `DELETE /api/v1/projects/{projectId}/devices/{deviceId}`  
**What it does**:
- Removes device from Syncthing folder
- Updates Cloud API
- Revokes device access

#### 13. **Sync Device** ❌ (Not used in IPC, but available)
```typescript
async syncDevice(userID, accessToken)
```
**Endpoint**: `POST /api/v1/devices/sync`  
**What it does**:
- Syncs device information with Cloud
- Updates Syncthing device list

#### 14. **Get Device Status** ❌ (Not used in IPC)
```typescript
async getDeviceStatus(deviceId)
```
**Endpoint**: `GET /api/v1/devices/{deviceId}/status`  
**What it does**:
- Fetches device status from Go agent
- Returns Syncthing device info

---

### Category 4: File Operations (3 actions)

#### 15. **Generate Snapshot** ❌ (Not directly used, triggered during project creation)
```typescript
async generateSnapshot(projectId, accessToken)
```
**Endpoint**: `POST /api/v1/projects/{projectId}/snapshot`  
**What it does**:
- Generates file snapshot
- Uploads to Cloud storage
- Updates project snapshot metadata

#### 16. **Get Files** ❌ (Not used in IPC, available for API)
```typescript
async getFiles(projectId, limit, offset, accessToken)
```
**Endpoint**: `GET /api/v1/projects/{projectId}/files`  
**What it does**:
- Fetches file list from Cloud or local snapshot

#### 17. **Get File Tree** ❌ (Not used in IPC, available for API)
```typescript
async getFileTree(projectId, accessToken)
```
**Endpoint**: `GET /api/v1/projects/{projectId}/files-tree`  
**What it does**:
- Fetches hierarchical file structure

---

### Category 5: Progress Tracking (2 actions - Phase 2e)

#### 18. **Get Snapshot Progress** ✅ (Real-time polling)
```typescript
async getSnapshotProgress(projectId)
```
**Endpoint**: `GET /api/v1/projects/{projectId}/progress`  
**What it does**:
- Polls current snapshot generation progress
- Returns: step, progress %, file count, size, message

#### 19. **Subscribe to Progress Stream** ✅ (Server-Sent Events)
```typescript
subscribeSnapshotProgress(projectId)
```
**Endpoint**: `GET /api/v1/projects/{projectId}/progress/stream` (SSE)  
**What it does**:
- Opens EventSource for real-time progress updates
- Streams progress events as snapshot generates
- Auto-reconnects on connection loss
- Falls back to polling if SSE fails

---

## Summary Table

| # | Action | IPC Used? | Go Endpoint | Cloud API | Syncthing API | Phase |
|----|--------|-----------|----------|-----------|-----------|--------|
| 1 | Create Project with Snapshot | ✅ Yes | POST /projects/with-snapshot | ✅ | ✅ | 2c-2d |
| 2 | Get Project Status | ✅ Yes | GET /projects/{id}/status | ✅ | ✅ | 2d |
| 3 | Pause Sync | ✅ Yes | POST /projects/{id}/sync/pause | ✅ | ✅ | 2d |
| 4 | Resume Sync | ✅ Yes | POST /projects/{id}/sync/resume | ✅ | ✅ | 2d |
| 5 | Stop Sync | ✅ Yes | POST /projects/{id}/sync/stop | ✅ | ✅ | 2d |
| 6 | Add Device | ✅ Yes | POST /projects/{id}/devices | ✅ | ✅ | 2a |
| 7 | Remove Device | ✅ Yes | DELETE /projects/{id}/devices/{id} | ✅ | ✅ | 2a |
| 8 | Get Snapshot Progress | ✅ Yes | GET /projects/{id}/progress | - | - | 2e |
| 9 | Subscribe Progress (SSE) | ✅ Yes | GET /projects/{id}/progress/stream | - | - | 2e |
| 10 | Delete Project | ❌ No | DELETE /projects/{id} | ✅ | ✅ | - |
| 11 | Get Project Details | ❌ No | GET /projects/{id} | ✅ | - | - |
| 12 | Create Project (basic) | ❌ No | POST /projects | ✅ | ✅ | - |
| 13 | Start Sync | ❌ No | POST /projects/{id}/sync/start | ✅ | ✅ | - |
| 14 | Get Sync Status | ❌ No | GET /projects/{id}/sync/status | ✅ | ✅ | - |
| 15 | Sync Device | ❌ No | POST /devices/sync | ✅ | ✅ | - |
| 16 | Get Device Status | ❌ No | GET /devices/{id}/status | - | ✅ | - |
| 17 | Generate Snapshot | ❌ No | POST /projects/{id}/snapshot | ✅ | ✅ | - |
| 18 | Get Files | ❌ No | GET /projects/{id}/files | ✅ | - | - |
| 19 | Get File Tree | ❌ No | GET /projects/{id}/files-tree | ✅ | - | - |

---

## Direct IPC Handlers vs Go Agent Flow

### Actions Using GoAgentClient (9 total)
1. `project:createWithSnapshot` → Go
2. `project:getStatus` → Go
3. `project:pauseSync` → Go
4. `project:resumeSync` → Go
5. `project:stopSync` → Go
6. `project:addDeviceToFolder` → Go
7. `project:removeDeviceFromFolder` → Go
8. `project:getSnapshotProgress` → Go (polling)
9. Progress streaming via EventSource → Go (SSE)

### Direct IPC Handlers (NOT using Go)
- `fs:listDir` - Direct OS file system (Node.js)
- `fs:listDirectory` - Direct OS file system
- `fs:scanDirTree` - Direct OS file system
- `fs:scanDirFlat` - Direct OS file system
- `fs:getDirStats` - Direct OS file system
- `syncthing:*` - Direct Syncthing API (bypasses Go)
- `fileWatcher:*` - Direct local file watching
- `device:getInfo` - Local or agent API (29999)
- `nebula:*` - Direct Nebula binary control

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────┐
│ Electron Renderer (React UI)                        │
├─────────────────────────────────────────────────────┤
│ - YourProjectsPage                                  │
│ - Project creation, sync control, device management│
└──────────────────────┬──────────────────────────────┘
                       │ IPC Events
                       ▼
┌─────────────────────────────────────────────────────┐
│ Electron Main (Node.js + IPC Handlers)              │
├─────────────────────────────────────────────────────┤
│ main.ts - IPC Setup                                 │
└──────────┬──────────────────────────────┬───────────┘
           │                              │
    ┌──────▼────────┐              ┌─────▼─────────┐
    │ GoAgentClient │              │ Direct APIs   │
    │ (9 actions)   │              │ (10 actions)  │
    └──────┬────────┘              └───────────────┘
           │                              │
    ┌──────▼────────────────────┐  ┌──────▼──────────┐
    │ Go Agent (localhost:5001) │  │ Syncthing API   │
    ├──────────────────────────┤  │ File System     │
    │ - Project orchestration  │  │ Nebula control  │
    │ - Cloud API calls        │  │                 │
    │ - Syncthing management   │  │                 │
    │ - Progress tracking      │  │                 │
    └──────┬────────────────────┘  └─────────────────┘
           │
    ┌──────▼──────────────────────┐
    │ Backend Services            │
    ├─────────────────────────────┤
    │ Cloud API (localhost:5000)  │
    │ Syncthing API (localhost:*)  │
    │ S3/Cloud Storage            │
    └─────────────────────────────┘
```

---

## Key Insights

### 1. **Why Go Agent?**
- **Single orchestration point**: Manages complex workflows (project creation requires: Cloud API + Syncthing + snapshot generation)
- **Authentication**: Go agent handles Bearer token auth transparently
- **Error resilience**: Go agent can retry failed operations
- **Progress tracking**: Real-time updates without exposing internal APIs

### 2. **What Still Bypasses Go?**
- **Local file operations**: Direct OS access (listing, scanning)
- **Syncthing direct control**: Some operations bypass Go (getStatus, getProgress)
- **Nebula management**: Direct binary control
- **Device info**: Local storage or agent port 29999

### 3. **Phase 2e Addition**
- Added `getSnapshotProgress()` for polling
- Added `subscribeSnapshotProgress()` for SSE streaming
- Both use Go as bridge (not called directly in IPC yet, but available for future use)

### 4. **Which Actions Are "Hot Path"?**
Most frequently used (actively called in IPC):
1. `createProjectWithSnapshot` - Project creation
2. `pauseSync` / `resumeSync` - Project management
3. `addDevice` / `removeDevice` - Collaboration
4. `getProjectStatus` - Status polling
5. `getSnapshotProgress` - Progress tracking (new in Phase 2e)

---

## Recommendations

### Should CloudAPI be called through Go?
Currently: **NO** - Electron makes direct Cloud API calls for list/read operations  
Reason: Go agent focuses on orchestration, not routing all APIs

### Should this change?
**Possibly for Phase 3+**:
- Unified error handling across all APIs
- Centralized auth token refresh
- Request logging/audit trail
- Rate limiting and backoff

### Next Steps
- Monitor which operations fail most often
- Consider adding more operations to Go if they need complex orchestration
- Document the current split for new developers
