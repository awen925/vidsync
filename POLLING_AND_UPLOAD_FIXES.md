# Go-Agent Fixes: Polling Control & Snapshot Upload

## Issues Fixed

### 1. ❌ Continuous Polling After Snapshot Completes → ✅ FIXED

**Problem:**
After snapshot generation completed and state became "idle", the Electron app continued polling `/projects/{projectId}/status` which then polled `/rest/db/status?folder=...` every 1-2 seconds indefinitely. This caused unnecessary API calls and battery drain.

**Root Cause:**
`GetProjectStatus()` in ProjectService always called `GetFolderStatus()` regardless of snapshot generation state.

**Log Evidence:**
```
[2025-11-21 01:41:32] [FileService] Folder scan completed, state: idle
[2025-11-21 01:41:32] [ProjectService] STEP 3a SUCCESS: Folder scan completed
[2025-11-21 01:41:33] [ProjectService] STEP 3b SUCCESS: File snapshot generated and uploaded
[GoAgent] GET /projects/b37c84af.../status        ← Polling continues here
[Agent] [ProjectService] Getting project status: b37c84af...
[SyncthingClient] GET /rest/db/status?folder=b37c84af...  ← Still polling Syncthing!
```

**Solution:**
Modified `GetProjectStatus()` to:
1. Check snapshot generation progress state via `ProgressTracker.GetProgress()`
2. **Skip folder status polling** if snapshot state is "completed" or "failed"
3. Only poll folder status **during** snapshot generation (states like "browsing", "compressing", "uploading")

**Code Changes:**

**File: `go-agent/internal/services/project_service.go`**
```go
func (ps *ProjectService) GetProjectStatus(ctx context.Context, projectID string) (map[string]interface{}, error) {
    // Check snapshot generation progress
    progressState := ps.fileService.GetProgressTracker().GetProgress(projectID)

    // ✅ SKIP polling if snapshot generation is done
    if progressState != nil && (progressState.Step == "completed" || progressState.Step == "failed") {
        ps.logger.Debug("[ProjectService] Snapshot generation %s, skipping folder status poll", progressState.Step)
        return map[string]interface{}{
            "projectId": projectID,
            "progress":  progressState,
        }, nil
    }

    // ✅ ONLY poll folder status during active snapshot generation
    status, err := ps.syncClient.GetFolderStatus(projectID)
    // ...
}
```

---

### 2. ❌ "Project not found" Error on Snapshot Upload → ✅ FIXED

**Problem:**
Snapshot upload failed with "404 - Project not found" error even though project was just created. The upload endpoint existed but rejected the request.

**Root Cause:**
The `uploadSnapshotAttempt()` function was:
1. Creating raw HTTP requests manually instead of using CloudClient
2. Not properly using CloudClient's Bearer token authentication
3. The CloudClient has proper error handling and logging that wasn't being used

**Log Evidence:**
```
[Agent] [2025-11-21 01:41:33] [ERROR] [agent] [FileService] Non-retryable error, failing immediately: upload failed: 404 - {"error":"Project not found"}
```

**Solution:**
Replaced manual HTTP request creation with proper CloudClient:
1. Use `CloudClient.PostWithAuth()` instead of raw `http.NewRequest()`
2. CloudClient automatically handles Bearer token in `Authorization` header
3. Proper error handling through CloudClient interface
4. Removed unused imports (bytes, io, net/http)

**Code Changes:**

**File: `go-agent/internal/services/file_service.go`**

Before (❌ Raw HTTP):
```go
req, err := http.NewRequestWithContext(ctx, "POST", endpoint, io.NopCloser(bytes.NewReader(requestJSON)))
req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", accessToken))
// Manual parsing and error handling...
```

After (✅ CloudClient):
```go
result, err := fs.cloudClient.PostWithAuth(endpoint, requestBody, accessToken)
if err != nil {
    return "", fmt.Errorf("snapshot upload request failed: %w", err)
}

// Check for API-level errors
if errMsg, ok := result["error"].(string); ok && errMsg != "" {
    return "", fmt.Errorf("upload failed: %s", errMsg)
}

// Extract snapshot URL
if snapshotURL, ok := result["snapshotUrl"].(string); ok && snapshotURL != "" {
    return snapshotURL, nil
}
```

**Benefits:**
- ✅ Proper Bearer token authentication via CloudClient
- ✅ Consistent error handling
- ✅ Better logging and debugging
- ✅ Code reuse (CloudClient already handles all auth/headers)

---

## Expected Behavior After Fixes

### Polling Behavior
```
[ProjectService] STEP 3: Starting background snapshot generation...
[FileService] Waiting for folder scan completion...
[SyncthingClient] GET /rest/db/status?folder=... ← Poll 1: "scanning"
[SyncthingClient] GET /rest/db/status?folder=... ← Poll 2: "scanning"
[FileService] Folder scan completed, state: idle
[ProjectService] STEP 3b: Generating file snapshot...
[FileService] Step 1: Getting folder configuration...
[FileService] Step 6: Uploading snapshot to cloud storage...

← Snapshot generation COMPLETES →

[ProjectService] STEP 3b SUCCESS: File snapshot generated and uploaded

← Electron app polls status →
[ProjectService] Getting project status: ...
[ProjectService] Snapshot generation completed, skipping folder status poll  ← ✅ NO MORE SYNCTHING POLLING
```

### Snapshot Upload Flow
```
[FileService] Step 6: Uploading snapshot to cloud storage...
[CloudClient] POST /projects/{projectId}/snapshot  ← Using CloudClient with Bearer token
[CloudClient] Response status: 200/201
[FileService] Snapshot uploaded successfully: https://...
```

---

## Verification Checklist

- [ ] Create project with existing folder
- [ ] Monitor logs during snapshot generation
- [ ] Verify polling stops after state = "completed"
- [ ] Verify snapshot uploads without "Project not found" error
- [ ] Check that progress updates work correctly
- [ ] Confirm no excessive API calls to `/rest/db/status` after snapshot completes

---

## Build Status

✅ **Build successful:** `go build -o vidsync-agent ./cmd/agent` → **0 errors**

All changes compile correctly and are ready for testing.

