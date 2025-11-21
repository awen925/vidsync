# Create Project Flow - End-to-End Architecture

## Overview
The "create project" flow is a complex orchestration across 4 components: Electron UI, Electron Main (IPC), Go-Agent, Cloud API, and Syncthing. It includes both synchronous and asynchronous operations.

---

## STEP 1: User initiates from Electron Renderer (React UI)

**File:** `electron/src/renderer/pages/Projects/YourProjectsPage.tsx`

```
User clicks "Create Project" button
  ↓
handleCreateProject() called
  ├─ Gets Supabase session (JWT access token)
  ├─ Calls window.api.createProjectWithSnapshot({
  │   name: string
  │   description?: string
  │   localPath?: string
  │   accessToken: JWT (Supabase)
  │ })
  └─ Polls for snapshot completion (300s timeout)
```

**Key Data:**
- `name`: Project name
- `localPath`: Filesystem path to sync
- `accessToken`: JWT from Supabase (used to call Cloud API)

---

## STEP 2: Electron Main - IPC Handler

**File:** `electron/src/main/main.ts` line 293

```typescript
ipcMain.handle('project:createWithSnapshot', async (_ev, { name, description, localPath, accessToken }) => {
  // Get local device ID from shared Syncthing instance
  const deviceId = await syncthingManager.getDeviceIdForProject('__app_shared__');
  
  // Generate project UUID
  const projectId = crypto.randomUUID();
  
  // Call Go-Agent
  const result = await goAgentClient.createProjectWithSnapshot(
    projectId,
    name,
    localPath || '',
    deviceId,          // Local Syncthing device ID
    'current-user',    // ⚠️ Placeholder - should be actual user ID
    accessToken         // JWT to pass to Cloud
  );
  
  return result;
});
```

**What Happens:**
1. Extracts device ID from locally running Syncthing
2. Generates project UUID
3. Passes token (JWT) to Go-Agent
4. Returns immediately with projectId

---

## STEP 3: Electron Main → Go-Agent HTTP Call

**File:** `electron/src/main/services/goAgentClient.ts` line 128

```typescript
async createProjectWithSnapshot(
  projectId, name, localPath, deviceId, ownerId, accessToken
) {
  // Set Bearer token in Authorization header
  this.setCloudAuthToken(accessToken);
  
  // POST to Go-Agent
  const response = await this.client.post('/projects/with-snapshot', {
    projectId,
    name,
    localPath,
    deviceId,
    ownerId,
  });
  
  // Go-Agent adds Authorization header automatically via interceptor
  // Headers sent:
  // - Authorization: Bearer <JWT>
  
  return { ok: true, projectId };
}
```

**HTTP Request:**
```
POST http://localhost:5001/api/v1/projects/with-snapshot
Authorization: Bearer <JWT from Supabase>
Content-Type: application/json

{
  "projectId": "uuid-xxx",
  "name": "My Project",
  "localPath": "/home/user/projects/my-data",
  "deviceId": "SYNCTHING_DEVICE_ID",
  "ownerId": "current-user"
}
```

---

## STEP 4: Go-Agent Handler - Initial Processing

**File:** `go-agent/internal/handlers/project.go` line 102

```go
func (h *ProjectHandler) CreateProjectWithSnapshot(w http.ResponseWriter, r *http.Request) {
  // Extract JWT from Authorization header
  authHeader := r.Header.Get("Authorization")  // "Bearer <JWT>"
  accessToken := authHeader[7:]  // Strip "Bearer "
  
  // Call service layer
  result, err := h.service.CreateProjectWithSnapshot(r.Context(), &services.CreateProjectRequest{
    ProjectID:   req.ProjectID,
    Name:        req.Name,
    LocalPath:   req.LocalPath,
    DeviceID:    req.DeviceID,
    OwnerID:     req.OwnerID,
    AccessToken: accessToken,  // JWT to pass to Cloud
  })
  
  // Return immediately with projectId (async background tasks start in service)
}
```

---

## STEP 5: Go-Agent Service - Multi-Step Orchestration

**File:** `go-agent/internal/services/project_service.go` line 102

### 5a. SYNCHRONOUS: Create in Cloud Database

```go
func (ps *ProjectService) CreateProjectWithSnapshot(...) {
  ps.logger.Info("STEP 1: Creating project in cloud database...")
  
  payload := map[string]interface{}{
    "name":      req.Name,
    "localPath": req.LocalPath,
    "deviceId":  req.DeviceID,
    "ownerId":   req.OwnerID,
    "status":    "active",
  }
  
  // Call Cloud API with JWT token
  cloudResponse, err := ps.cloudClient.PostWithAuth(
    "/projects",
    payload,
    req.AccessToken,  // JWT token forwarded
  )
  
  if err != nil {
    return &CreateProjectResponse{OK: false, Error: err.Error()}, err
  }
  
  // Extract projectId from cloud response (Cloud may assign its own ID)
  projectID := req.ProjectID
  if cloudProjectID, ok := cloudResponse["projectId"].(string); ok && cloudProjectID != "" {
    projectID = cloudProjectID
  }
}
```

**What Cloud API does:**
- Receives JWT in Authorization header
- Validates JWT with Supabase
- Extracts user ID from JWT
- Creates project record in database
- Returns projectId

**Cloud Endpoint:**
```
POST http://localhost:5000/api/projects
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "name": "My Project",
  "localPath": "/home/user/projects/my-data",
  "deviceId": "SYNCTHING_DEVICE_ID",
  "ownerId": "current-user",
  "status": "active"
}
```

### 5b. SYNCHRONOUS: Create Syncthing Folder

```go
  ps.logger.Info("STEP 2: Creating Syncthing folder...")
  
  err = ps.syncClient.AddFolder(projectID, req.Name, req.LocalPath)
  if err != nil {
    return &CreateProjectResponse{OK: false, Error: err.Error()}, err
  }
```

**What Syncthing does:**
- Receives AddFolder request from Go-Agent
- Creates folder config locally
- Starts scanning files
- Updates config.xml

**Syncthing API Call:**
```
POST http://localhost:8384/rest/config/folders
X-API-Key: <Syncthing API Key>
Content-Type: application/json

{
  "id": "project-uuid",
  "path": "/home/user/projects/my-data",
  "label": "My Project",
  ...
}
```

### 5c. RETURN TO CLIENT (Handler Returns)

At this point (Step 2 complete), the handler returns immediately to Electron:

```go
  ps.logger.Info("CreateProjectWithSnapshot completed successfully: %s", projectID)
  return &CreateProjectResponse{OK: true, ProjectID: projectID}, nil
}
```

**Response to Electron:**
```json
{
  "ok": true,
  "projectId": "project-uuid-xxx"
}
```

---

## STEP 6: Go-Agent Service - ASYNC Background Tasks (Goroutine)

**File:** `go-agent/internal/services/project_service.go` line 137

While Electron waits for snapshot, Go-Agent spawns a background goroutine:

```go
go func() {
  ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
  defer cancel()

  ps.logger.Info("STEP 3: Starting background snapshot generation...")
  
  // STEP 3a: Wait for Syncthing folder scan to complete
  ps.logger.Info("STEP 3a: Waiting for Syncthing folder scan...")
  err := ps.fileService.WaitForScanCompletion(ctx, projectID, 120)
  if err != nil {
    ps.logger.Error("STEP 3a FAILED: %v", err)
    return
  }
  
  // STEP 3b: Generate snapshot
  ps.logger.Info("STEP 3b: Generating file snapshot...")
  _, err = ps.fileService.GenerateSnapshot(ctx, projectID, req.AccessToken)
  if err != nil {
    ps.logger.Error("STEP 3b FAILED: %v", err)
    return
  }
  
  ps.logger.Info("STEP 3b SUCCESS: File snapshot generated and uploaded")
}()
```

### 6a. ASYNC Step 3a: Wait for Syncthing Scan Completion

**File:** `go-agent/internal/services/file_service.go` line 129

```go
func (fs *FileService) WaitForScanCompletion(ctx context.Context, projectID string, maxWaitSeconds int) error {
  deadline := time.Now().Add(time.Duration(maxWaitSeconds) * time.Second)
  pollInterval := 500 * time.Millisecond

  for {
    // Poll Syncthing status every 500ms
    status, err := fs.syncClient.GetFolderStatus(projectID)
    
    state, ok := status["state"].(string)
    if ok {
      if state != "scanning" && state != "syncing" {
        // Scan complete, folder is "idle"
        return nil
      }
    }
    
    if time.Now().After(deadline) {
      return fmt.Errorf("scan completion timeout")
    }
    
    time.Sleep(pollInterval)
  }
}
```

**Syncthing API Calls (Polling):**
```
GET http://localhost:8384/rest/db/status?folder=project-uuid
X-API-Key: <Syncthing API Key>

Response:
{
  "state": "idle",  // Changed from "scanning" to "idle"
  "path": "/home/user/projects/my-data",
  "localFiles": 150,
  "globalFiles": 150
}
```

### 6b. ASYNC Step 3b: Generate & Upload Snapshot

**File:** `go-agent/internal/services/file_service.go` line 179

```go
func (fs *FileService) GenerateSnapshot(ctx context.Context, projectID, accessToken string) (...) {
  
  // Get folder status
  status, err := fs.syncClient.GetFolderStatus(projectID)
  folderPath, ok := status["path"].(string)  // e.g. "/home/user/projects/my-data"
  
  // Browse all files in folder
  files, err := fs.syncClient.BrowseFiles(folderPath, 0)  // Full recursion
  
  // Build snapshot metadata
  totalSize := int64(0)
  for _, f := range files {
    totalSize += f.Size
  }
  
  snapshot := &SnapshotMetadata{
    ProjectID:  projectID,
    CreatedAt:  time.Now(),
    Files:      files,
    FileCount:  len(files),
    TotalSize:  totalSize,
    SyncStatus: status,
  }
  
  // Convert to JSON
  snapshotJSON, err := json.Marshal(snapshot)
  
  // Upload to Cloud/Supabase Storage
  // POST to Cloud API with snapshot data
  _, err = fs.cloudClient.PostWithAuth(
    fmt.Sprintf("/projects/%s/snapshot", projectID),
    snapshot,
    accessToken,  // JWT forwarded
  )
}
```

**Cloud API Snapshot Upload:**
```
POST http://localhost:5000/api/projects/<projectId>/snapshot
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "projectId": "project-uuid",
  "createdAt": "2025-11-20T...",
  "files": [
    {"name": "file1.txt", "path": "file1.txt", "size": 1024, "isDirectory": false},
    {"name": "subdir", "path": "subdir", "size": 0, "isDirectory": true},
    ...
  ],
  "fileCount": 150,
  "totalSize": 52428800,
  "syncStatus": {...}
}
```

---

## STEP 7: Electron Polls for Snapshot Completion

**File:** `electron/src/renderer/pages/Projects/YourProjectsPage.tsx` line 240

While Go-Agent generates snapshot in background:

```typescript
// Poll for snapshot completion (timeout 5 minutes)
const snapshotReady = await pollForSnapshotCompletion(projectId, 300);

// Polling loop:
// - Calls window.api.getProjectStatus(projectId) every 500ms-2s (exponential backoff)
// - Checks if snapshot is "ready" or "completed"
// - Returns true if snapshot ready within 5 minutes
// - Returns false if timeout
```

**Go-Agent API Poll Endpoint:**
```
GET http://localhost:5001/api/v1/projects/<projectId>/status
```

---

## Complete Flow Diagram

```
ELECTRON UI
├─ User clicks "Create Project"
└─ handleCreateProject()
   ├─ Get JWT from Supabase
   └─ Call api.createProjectWithSnapshot()

ELECTRON MAIN (IPC Handler)
├─ Get device ID from Syncthing
├─ Generate project UUID
└─ HTTP POST to Go-Agent

GO-AGENT HANDLER
├─ Extract JWT from Authorization header
└─ Call service.CreateProjectWithSnapshot()

GO-AGENT SERVICE (SYNC)
├─ STEP 1: POST /projects to Cloud API
│          ├─ Pass JWT in Authorization header
│          └─ Cloud creates DB record, returns projectId
├─ STEP 2: Call Syncthing AddFolder
│          ├─ Pass API key in X-API-Key header
│          └─ Syncthing starts scanning folder
└─ Return projectId to Electron

GO-AGENT SERVICE (ASYNC - Background Goroutine)
├─ STEP 3a: Poll Syncthing status until scan complete (max 120s)
├─ STEP 3b: Browse files and generate snapshot JSON
└─ STEP 3c: POST /projects/{id}/snapshot to Cloud API
           └─ Pass JWT in Authorization header

ELECTRON UI (Meanwhile)
├─ Receive projectId from IPC handler
├─ Show progress modal
└─ Poll Go-Agent status until snapshot ready (max 300s)

SYNC STATUS CHECKS
├─ Syncthing → Syncthing API (X-API-Key auth)
├─ Cloud → Cloud API (JWT auth)
└─ Go-Agent → Both local and remote
```

---

## Token & Authentication Flow

### JWT Token (Supabase)
```
Source: Electron Renderer (Supabase auth)
   ↓
Passed to IPC handler as parameter
   ↓
Passed to Go-Agent as HTTP body parameter
   ↓
Go-Agent extracts from URL/body
   ↓
Go-Agent adds to HTTP header for Cloud API:
   Authorization: Bearer <JWT>
   ↓
Cloud API validates with Supabase
```

### Syncthing API Key
```
Source: Syncthing config.xml
   ↓
Loaded by Electron main via SyncthingManager
   ↓
Passed to Go-Agent in configuration
   ↓
Go-Agent uses for all Syncthing calls:
   X-API-Key: <API Key>
```

---

## Key Technical Points

1. **Dual Authentication System:**
   - JWT (Supabase) for Cloud API calls
   - API Key for local Syncthing REST API

2. **Request Flow:**
   - Electron UI → Electron Main (IPC, in-process) → Go-Agent (HTTP)
   - Go-Agent → Cloud API (HTTP with JWT)
   - Go-Agent → Syncthing (HTTP with API Key)

3. **Async Pattern:**
   - Project creation returns immediately (Steps 1-2)
   - Snapshot generation happens in background (Step 3)
   - Electron polls for completion

4. **Error Handling:**
   - If Steps 1-2 fail: User sees error immediately
   - If Step 3 fails: Project still created, snapshot just unavailable
   - Cloud creation is mandatory, Syncthing is mandatory, snapshot is optional

5. **Timeouts:**
   - Syncthing scan: 120 seconds
   - Snapshot generation: 5 minutes (from Go-Agent)
   - Electron polling: 5 minutes

---

## Payload Examples

### From Electron to Go-Agent
```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Project",
  "localPath": "/home/user/projects/my-data",
  "deviceId": "SYNCTHING_DEVICE_ID_HASH",
  "ownerId": "current-user"
}
```

### From Go-Agent to Cloud API
```json
{
  "name": "My Project",
  "localPath": "/home/user/projects/my-data",
  "deviceId": "SYNCTHING_DEVICE_ID_HASH",
  "ownerId": "current-user",
  "status": "active"
}
```

### Snapshot Metadata (Uploaded to Cloud)
```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2025-11-20T10:30:45Z",
  "fileCount": 150,
  "totalSize": 52428800,
  "files": [
    {
      "name": "document.pdf",
      "path": "documents/document.pdf",
      "size": 2097152,
      "isDirectory": false,
      "modTime": "2025-11-20T10:00:00Z"
    }
  ],
  "syncStatus": {
    "state": "idle",
    "path": "/home/user/projects/my-data",
    "localFiles": 150
  }
}
```
