# Phase 2d: Cloud API Integration & UI Updates

## Overview
Phase 2d completes the snapshot generation pipeline by implementing the Cloud API endpoint to receive snapshots from the Go service, updating the Electron UI to use the new Go service flow, and adding progress tracking capabilities.

## Phase 2d Objectives

### 1. **Cloud API Endpoint Implementation** ⏳
**Endpoint:** `POST /projects/{projectId}/snapshot`

**Purpose:**
- Receive snapshot JSON from Go service
- Compress with gzip
- Upload to Supabase Storage
- Store metadata in database
- Return snapshotUrl

**Request Body:**
```json
{
  "projectId": "proj_abc123",
  "createdAt": "2025-11-20T10:30:00Z",
  "files": [
    {
      "name": "document.pdf",
      "path": "documents/document.pdf",
      "size": 1024000,
      "isDirectory": false,
      "modTime": "2025-11-20T09:15:00Z"
    }
  ],
  "fileCount": 156,
  "totalSize": 5242880000,
  "syncStatus": {
    "state": "idle",
    "globalBytes": 5242880000
  }
}
```

**Response:**
```json
{
  "ok": true,
  "snapshotUrl": "https://bucket.supabase.co/projects/proj_123/snapshot_20251120.json.gz",
  "snapshotSize": 2048000,
  "uploadedAt": "2025-11-20T10:30:20Z"
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Failed to upload to storage"
}
```

### 2. **Cloud Storage Implementation**
**Bucket:** `project-snapshots`
**Path Pattern:** `projects/{projectId}/snapshot_{timestamp}.json.gz`

**Operations:**
1. Receive raw snapshot JSON
2. Compress with gzip
3. Generate storage path with timestamp
4. Upload to Supabase Storage
5. Generate public URL
6. Store metadata in projects table:
   - `snapshot_url` (TEXT)
   - `snapshot_updated_at` (TIMESTAMP)
   - `snapshot_file_count` (INTEGER)
   - `snapshot_total_size` (BIGINT)

### 3. **Electron UI Updates** ⏳

**Component:** `YourProjectsPage.tsx`

**Changes:**
- Remove direct `cloudAPI.post('/projects', ...)` calls
- Replace with `goAgentClient.createProjectWithSnapshot()`
- Keep existing status update dialog and messaging
- Add polling for snapshot completion status
- Display file tree once snapshot available

**New Status Flow:**
```
User creates project
  ↓
"Creating project in database..."
  ↓
"Setting up Syncthing folder..."
  ↓
"Scanning project files..."         (background: WaitForScanCompletion)
  ↓
"Collecting file metadata..."        (background: BrowseFiles)
  ↓
"Uploading snapshot to storage..."   (background: uploadSnapshotToCloud)
  ↓
"✓ Project created successfully!"
  ↓
Project appears in list with file tree
```

### 4. **Progress Tracking** ⏳

**Option A: Polling (Simple)**
- Electron polls `GET /projects/{projectId}/status` every 1s
- Returns: `{ status, snapshotProgress, snapshotUrl }`
- Shows progress bar / percentage
- No additional WebSocket infrastructure

**Option B: WebSocket (Advanced)**
- Real-time progress updates via WebSocket
- Server pushes: `{ type: "snapshot_progress", step, percentage }`
- Lower latency, more responsive UI
- Deferred to Phase 3+

### 5. **Error Recovery** ⏳

**Retry Strategy:**
- Initial request to snapshot endpoint
- On failure (timeout, 500, etc.):
  - Retry up to 3 times with exponential backoff
  - 1s, 2s, 4s delays
  - Log each attempt

**Fallback:**
- If upload fails after retries:
  - Snapshot saved locally in Go service
  - Project still works, files sync normally
  - User can re-trigger snapshot generation manually

## Implementation Tasks

### Task 2d-1: Cloud API Endpoint ⏳

**File:** `/cloud/src/routes/projects.ts` or `/cloud/src/api/snapshots.ts` (new)

**Route Handler:**
```typescript
router.post('/projects/:projectId/snapshot', authenticateToken, async (req, res) => {
  // 1. Validate projectId and ownership
  // 2. Parse snapshot JSON from body
  // 3. Compress with gzip
  // 4. Generate storage path: projects/{projectId}/snapshot_{timestamp}.json.gz
  // 5. Upload to Supabase Storage
  // 6. Generate public URL
  // 7. Update projects table with snapshot metadata
  // 8. Return: { ok: true, snapshotUrl, ... }
});
```

**Database Update:**
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_updated_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_file_count INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_total_size BIGINT;
```

**Storage Bucket Setup:**
```typescript
// Ensure bucket exists
const { data: bucket } = await supabase
  .storage
  .createBucket('project-snapshots', { public: true });
```

### Task 2d-2: Electron UI Migration ⏳

**File:** `/electron/src/renderer/pages/Projects/YourProjectsPage.tsx`

**Changes in `handleCreateProject()`:**

**Before:**
```typescript
const response = await cloudAPI.post('/projects', {
  name: newProjectName,
  description: newProjectDesc,
  local_path: newProjectLocalPath,
});
```

**After:**
```typescript
const response = await (window as any).api.createProjectWithSnapshot({
  projectId: generateUUID(),  // Generate clientside
  name: newProjectName,
  description: newProjectDesc,
  localPath: newProjectLocalPath,
  deviceId: currentDeviceId,
  ownerId: currentUserId,
  accessToken: authToken,
});
```

**Polling for Completion:**
```typescript
// After project created, poll for snapshot
if (response.data?.projectId) {
  const pollSnapshots = setInterval(async () => {
    const projectStatus = await cloudAPI.get(
      `/projects/${response.data.projectId}`
    );
    
    if (projectStatus.data?.snapshot_url) {
      setCreatingProject(false);
      clearInterval(pollSnapshots);
      fetchProjects();  // Refresh list with file tree
    }
  }, 1000);
  
  // Timeout after 5 minutes
  setTimeout(() => clearInterval(pollSnapshots), 5 * 60 * 1000);
}
```

### Task 2d-3: Progress Status Endpoint ⏳

**File:** `/go-agent/internal/handlers/project.go`

**New Handler:**
```go
func (h *ProjectHandler) GetProjectStatus(w http.ResponseWriter, r *http.Request) {
  projectID := r.PathValue("projectId")
  
  // Get Syncthing folder status
  status, err := h.service.GetProjectStatus(r.Context(), projectID)
  if err != nil {
    http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
    return
  }
  
  // Returns current snapshot generation step
  w.Header().Set("Content-Type", "application/json")
  json.NewEncoder(w).Encode(status)
}
```

**Response Format:**
```json
{
  "projectId": "proj_123",
  "status": "scanning",
  "snapshotStep": "waiting_for_scan",
  "snapshotProgress": 15,
  "snapshotUrl": null,
  "folderStatus": {
    "state": "scanning",
    "globalBytes": 1000000
  }
}
```

### Task 2d-4: Retry Logic in Go Service ⏳

**File:** `/go-agent/internal/services/file_service.go`

**Enhancement to `uploadSnapshotToCloud()`:**

```go
func (fs *FileService) uploadSnapshotToCloudWithRetry(
  ctx context.Context,
  projectID string,
  snapshotJSON []byte,
  accessToken string,
) (string, error) {
  maxRetries := 3
  backoffDelays := []time.Duration{1*time.Second, 2*time.Second, 4*time.Second}
  
  var lastErr error
  for attempt := 0; attempt < maxRetries; attempt++ {
    fs.logger.Info("[FileService] Snapshot upload attempt %d/%d", attempt+1, maxRetries)
    
    snapshotUrl, err := fs.uploadSnapshotToCloud(ctx, projectID, snapshotJSON, accessToken)
    if err == nil {
      fs.logger.Info("[FileService] Snapshot uploaded successfully on attempt %d", attempt+1)
      return snapshotUrl, nil
    }
    
    lastErr = err
    fs.logger.Warn("[FileService] Snapshot upload failed: %v", err)
    
    if attempt < maxRetries-1 {
      delay := backoffDelays[attempt]
      fs.logger.Info("[FileService] Retrying after %v", delay)
      time.Sleep(delay)
    }
  }
  
  fs.logger.Warn("[FileService] Snapshot upload failed after %d retries", maxRetries)
  return "", lastErr
}
```

### Task 2d-5: GoAgentClient Enhancement ⏳

**File:** `/electron/src/main/services/goAgentClient.ts`

**Add Status Polling Method:**
```typescript
async getProjectStatus(
  projectId: string,
  accessToken: string
): Promise<any> {
  try {
    const response = await this.client.get(
      `/projects/${projectId}/status`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return response.data;
  } catch (error) {
    this.logger.error(`[GoAgent] Get project status failed: ${error.message}`);
    throw error;
  }
}
```

## Architecture Updates

### Data Flow: Project Creation Complete

```
ELECTRON UI
  │ createProjectWithSnapshot()
  ▼
GO SERVICE (Port 5001)
  │
  ├─ STEP 1: Cloud: POST /projects
  │          └─ Get projectId
  │
  ├─ STEP 2: Syncthing: AddFolder
  │          └─ Begin scanning
  │
  └─ STEP 3: Background goroutine
             │
             ├─ Wait for scan → complete
             ├─ Browse files → get list
             ├─ Build JSON → serialize
             │
             └─ Upload snapshot
                 │
                 POST /projects/{projectId}/snapshot
                 │
                 ▼
             CLOUD API (Node.js)
                 │
                 ├─ Receive JSON
                 ├─ Validate
                 ├─ Compress (gzip)
                 │
                 └─ Upload to Supabase Storage
                     │
                     ├─ Bucket: project-snapshots
                     ├─ Path: projects/{projectId}/snapshot_{timestamp}.json.gz
                     ├─ Generate URL
                     │
                     ▼
                 Store metadata
                     │
                     ├─ snapshot_url
                     ├─ snapshot_updated_at
                     ├─ snapshot_file_count
                     ├─ snapshot_total_size
                     │
                     ▼
                 Return response
                     └─ { snapshotUrl, ... }
                
ELECTRON UI (Polling)
  │
  └─ Poll GET /projects/{projectId}/status every 1s
     └─ When snapshot_url != null → display file tree
```

### Cloud Tables Update

**projects table changes:**
```sql
-- Snapshot metadata columns
snapshot_url TEXT
snapshot_updated_at TIMESTAMP
snapshot_file_count INTEGER
snapshot_total_size BIGINT

-- Example snapshot
{
  id: "proj_123",
  name: "My Project",
  snapshot_url: "https://bucket.supabase.co/.../snapshot_20251120_103000.json.gz",
  snapshot_updated_at: "2025-11-20T10:30:20Z",
  snapshot_file_count: 1523,
  snapshot_total_size: 5242880000
}
```

## Testing Strategy

### Unit Tests

**Cloud API Endpoint:**
- [ ] Valid snapshot upload → 200 OK
- [ ] Invalid JSON → 400 Bad Request
- [ ] Missing auth → 401 Unauthorized
- [ ] Unauthorized user → 403 Forbidden
- [ ] Invalid projectId → 404 Not Found
- [ ] Storage failure → 500 with retry

**Electron UI:**
- [ ] createProjectWithSnapshot called with correct params
- [ ] Polling starts immediately after creation
- [ ] File tree rendered when snapshot_url available
- [ ] Error dialog on creation failure

### Integration Tests

- [ ] Full flow: Create → Syncthing scan → Upload → Storage
- [ ] Verify snapshot file in Supabase Storage bucket
- [ ] Verify database metadata updated
- [ ] Verify public URL accessible
- [ ] Verify file tree renders correctly from snapshot
- [ ] Concurrent project creations don't conflict

### Edge Cases

- [ ] Very large files (100GB+)
- [ ] Deep directory nesting (1000+ levels)
- [ ] Special characters in filenames
- [ ] File permission errors
- [ ] Network timeout during upload
- [ ] Retry logic with transient failures
- [ ] Simultaneous snapshot uploads

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Cloud endpoint response | < 1s | After upload complete |
| Gzip compression | < 500ms | For 10k files |
| Supabase upload | < 5s | Network dependent |
| Polling interval | 1000ms | Balance: responsive vs. CPU |
| Storage retrieval | < 2s | Get public URL |

## Security Considerations

1. **Authentication:**
   - All endpoints require Bearer token
   - Validate token on Cloud API endpoint
   - Validate project ownership

2. **Authorization:**
   - Only project owner can upload snapshot
   - Only project members can view snapshot
   - Implement row-level security in Supabase

3. **Storage:**
   - Snapshots in public bucket (URLs are public)
   - Optional: Add expiring URLs for sensitive projects
   - Consider: Private bucket with signed URLs

## Rollback Plan

If issues encountered:

1. **Keep Phase 2c working:**
   - Old `createProject()` endpoint still available
   - Snapshot endpoint optional
   - UI can fall back to direct cloud creation

2. **Disable snapshot generation:**
   - Remove `CreateProjectWithSnapshot` from routes
   - Keep `CreateProject` functional
   - Projects work without snapshots

3. **Storage issues:**
   - Snapshot generation continues working locally
   - Cloud upload failures don't block project creation
   - Can re-trigger upload manually

## Timeline Estimate

| Task | Estimate | Priority |
|------|----------|----------|
| Cloud API endpoint | 1-2 hours | HIGH |
| Database schema update | 30 min | HIGH |
| Electron UI update | 1-2 hours | HIGH |
| Progress polling | 1 hour | MEDIUM |
| Retry logic | 30 min | MEDIUM |
| Error handling | 1 hour | MEDIUM |
| Testing | 2-3 hours | HIGH |
| **Total** | **7-10 hours** | |

## Success Criteria

- ✅ Cloud API endpoint receives and stores snapshots
- ✅ Snapshots uploaded to Supabase Storage
- ✅ Electron UI uses Go service for project creation
- ✅ Progress updates displayed in UI
- ✅ File tree rendered from snapshot
- ✅ Error recovery works (retry, fallback)
- ✅ All tests passing
- ✅ No performance regressions

## Post-Phase 2d Work

### Phase 2e (Optional Enhancements)
- WebSocket real-time progress
- Incremental snapshot updates
- Snapshot comparison/versioning
- Manual snapshot refresh button

### Phase 3 (Finalization)
- End-to-end integration testing
- Production deployment
- Load testing (1000+ concurrent projects)
- Monitoring and observability

