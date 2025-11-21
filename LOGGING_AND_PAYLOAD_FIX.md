# Go Agent Logging & Local Path Fix

## Issue #1: Unable to locate failure point in Go service

### Solution: Comprehensive Logging Added

Added detailed logging throughout the Go Agent to trace execution flow at every step:

#### Handler Level (`internal/handlers/project.go`)
```
[CreateProject] Handler received request
[CreateProject] Request decoded: projectId=..., name=..., localPath=..., deviceId=..., ownerId=...
[CreateProject] Authorization header present, extracting token
[CreateProject] Token extracted from Bearer format
[CreateProject] Calling service.CreateProject
[CreateProject] service.CreateProject failed: ...  ← Failure point
[CreateProject] Success, returning response
```

#### Service Level (`internal/services/project_service.go`)

**CreateProject flow:**
```
[ProjectService] CreateProject started for: ...
[ProjectService] CreateProject request: projectId=..., name=..., localPath=..., deviceId=..., ownerId=...
[ProjectService] STEP 1: Creating Syncthing folder for project: ...
[ProjectService] STEP 1 FAILED: Failed to create Syncthing folder: ...  ← Syncthing failure
[ProjectService] STEP 1 SUCCESS: Syncthing folder created
[ProjectService] STEP 2: Notifying cloud about project creation
[ProjectService] STEP 2: Cloud API payload: ...  ← Payload inspection
[ProjectService] STEP 2 FAILED: Failed to notify cloud about project creation: ...  ← Cloud API failure
[ProjectService] STEP 2 SUCCESS: Cloud notified about project creation
[ProjectService] CreateProject completed successfully: ...
```

**CreateProjectWithSnapshot flow:**
```
[ProjectService] CreateProjectWithSnapshot started for: ...
[ProjectService] STEP 1: Creating project in cloud database...
[ProjectService] STEP 1: Cloud API payload: ...  ← Payload to Cloud API
[ProjectService] STEP 1 FAILED: Failed to create project in cloud: ...  ← Cloud failure
[ProjectService] STEP 1 SUCCESS: Project created in cloud
[ProjectService] STEP 2: Creating Syncthing folder...
[ProjectService] STEP 2: Adding folder to Syncthing: id=..., label=..., path=...
[ProjectService] STEP 2 FAILED: Failed to create Syncthing folder: ...  ← Syncthing failure
[ProjectService] STEP 2 SUCCESS: Syncthing folder created: ...
[ProjectService] STEP 3: Starting background snapshot generation...
[ProjectService] STEP 3a: Waiting for Syncthing folder scan to complete...
[ProjectService] STEP 3a FAILED: Failed to wait for scan: ...  ← Scan failure
[ProjectService] STEP 3a SUCCESS: Folder scan completed
[ProjectService] STEP 3b: Generating file snapshot...
[ProjectService] STEP 3b FAILED: Failed to generate snapshot: ...  ← Snapshot failure
[ProjectService] STEP 3b SUCCESS: File snapshot generated and uploaded
[ProjectService] CreateProjectWithSnapshot completed successfully: ...
```

#### Cloud API Level (`internal/api/cloud_client.go`)

```
[CloudClient] POST /projects
[CloudClient] Payload: map[name:... localPath:... deviceId:... ownerId:... status:active]  ← Verify localPath here!
[CloudClient] Authorization: Bearer ...
[CloudClient] Request: POST http://localhost:5000/api/projects
[CloudClient] Headers: map[Authorization:[Bearer ...] Content-Type:[application/json]]
[CloudClient] Response status: 200
[CloudClient] Response body: {"ok":true,"projectId":"..."}
```

### What You Can Now See

✅ **Exact failure location** - Know which step failed
✅ **Payload verification** - See what was sent to Cloud API
✅ **Token presence** - Verify Authorization header is present
✅ **Syncthing operation** - Track folder creation success/failure
✅ **Background operations** - Monitor snapshot generation

---

## Issue #2: Local Path Not Saved to Supabase

### Root Cause Analysis

The **local_path is being sent** to the Cloud API. The problem is likely on the **Cloud API side** not saving it.

### What's Being Sent

Looking at the Go Agent code:

#### CreateProject:
```go
payload := map[string]interface{}{
    "projectId": req.ProjectID,
    "name":      req.Name,
    "localPath": req.LocalPath,  // ✅ INCLUDED
    "deviceId":  req.DeviceID,
    "ownerId":   req.OwnerID,
    "status":    "active",
}
```

#### CreateProjectWithSnapshot:
```go
payload := map[string]interface{}{
    "name":      req.Name,
    "localPath": req.LocalPath,  // ✅ INCLUDED
    "deviceId":  req.DeviceID,
    "ownerId":   req.OwnerID,
    "status":    "active",
}
```

✅ **localPath is being sent correctly to Cloud API**

### Verification Steps

1. **Run project creation** and check logs:
   ```
   [ProjectService] STEP 2: Cloud API payload: map[...localPath:/path/to/folder...]
   ```

2. **Verify in console** if localPath appears in the payload
   - If YES → Problem is in Cloud API (not saving the field)
   - If NO → Problem is in Go Agent (field is empty)

### Expected Flow

```
Renderer (Electron)
  ↓ (passes localPath)
GoAgentClient (sets field)
  ↓ (includes in request body)
Go Agent Handler (receives in JSON)
  ↓ (passes to service)
ProjectService (sends in payload)
  ↓ (logs show localPath is included)
Cloud API /projects endpoint
  ↓ (receives localPath in request body)
Cloud Service
  ↓ (SHOULD save localPath to Supabase)
Supabase Database
```

### If localPath is Missing

**Check these in Cloud service (`cloud/src/routes/projects.ts` or similar):**
1. Route handler receives the field
2. Field is included in save/insert query
3. Database column exists (projects.local_path or similar)

---

## Build Status

✅ Go Agent rebuilt successfully with comprehensive logging
✅ All CSRF token handling from previous fix still in place
✅ Ready to test project creation and see detailed logs

## Next Steps to Debug

1. **Start Go Agent** and watch terminal
2. **Create a project** in Electron
3. **Check logs for:**
   - Where did it fail?
   - What payload was sent?
   - Was localPath included?
   - Did Cloud API respond with 200?

4. **If Cloud API returned 200** but localPath not saved:
   - Issue is in Cloud API service
   - Check: `/cloud/src/routes/projects.ts` or `/cloud/src/services/projectService.ts`
   - Verify: localPath field is being extracted and saved to Supabase
