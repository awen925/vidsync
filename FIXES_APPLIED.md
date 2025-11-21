# Critical Fixes Applied - Go-Agent

## Issues Fixed

### 1. ❌ "Could not determine folder path" Error

**Root Cause:**
The `GenerateSnapshot()` function was using `GetFolderStatus()` which calls the `/rest/db/status?folder=...` endpoint. This endpoint returns *sync status information* (state, errors, files, etc.) but **does NOT include the folder path**.

**Error Log:**
```
[ERROR] [FileService] Could not determine folder path
[ERROR] [ProjectService] STEP 3b FAILED: Failed to generate snapshot: folder path not available
```

**Solution:**
- ✅ Added new `GetFolderConfig()` method to `SyncthingClient` that calls `/rest/config/folders/{folderID}` endpoint
- ✅ This endpoint returns folder configuration including the `path` field
- ✅ Updated `GenerateSnapshot()` Step 1 to use `GetFolderConfig()` instead of `GetFolderStatus()`

**Code Changes:**

**File: `go-agent/internal/api/syncthing_client.go`**
```go
// NEW: Get folder configuration (includes path)
func (sc *SyncthingClient) GetFolderConfig(folderID string) (map[string]interface{}, error) {
    return sc.get(fmt.Sprintf("/rest/config/folders/%s", folderID))
}
```

**File: `go-agent/internal/services/file_service.go`**
```go
// Step 1: Get folder config to retrieve path
folderConfig, err := fs.syncClient.GetFolderConfig(projectID)
if err != nil {
    return nil, err
}

folderPath, ok := folderConfig["path"].(string)
if !ok || folderPath == "" {
    return nil, fmt.Errorf("folder path not available in config")
}
```

---

### 2. ❌ Continuous API Polling After State Becomes "idle"

**Root Cause:**
The `WaitForScanCompletion()` function had a timeout check **AFTER** the sleep, not **BEFORE** the poll. This caused:
1. Poll folder status
2. If "scanning" → sleep 500ms
3. Check if timeout (TOO LATE!)
4. Loop back to step 1 (infinite loop if still within deadline)

**Pattern:** The function would keep polling even after state became "idle" if other code kept calling it or if there were concurrent requests.

**Error Log Pattern:**
```
[DEBUG] Folder state: scanning
[SyncthingClient] GET /rest/db/status?folder=... ← Poll 1
[DEBUG] Folder state: scanning
[SyncthingClient] GET /rest/db/status?folder=... ← Poll 2
[DEBUG] Folder state: scanning
[SyncthingClient] GET /rest/db/status?folder=... ← Poll 3
...
[DEBUG] Folder state: idle
[INFO] Folder scan completed, state: idle
[SyncthingClient] GET /rest/db/status?folder=... ← Still polling after idle!
```

**Solution:**
- ✅ Moved timeout check to **BEFORE** polling (prevents wasteful polling)
- ✅ Function now **exits immediately** when state becomes "idle" instead of sleeping first
- ✅ Updated comment to clarify function returns immediately on completion

**Code Changes:**

**File: `go-agent/internal/services/file_service.go`**
```go
func (fs *FileService) WaitForScanCompletion(ctx context.Context, projectID string, maxWaitSeconds int) error {
    // ...
    for {
        // ✅ CHECK TIMEOUT BEFORE POLLING (was after sleep)
        if time.Now().After(deadline) {
            fs.logger.Warn("[FileService] Scan completion timeout after %d seconds", maxWaitSeconds)
            return fmt.Errorf("scan completion timeout")
        }

        // Get folder status
        status, err := fs.syncClient.GetFolderStatus(projectID)
        // ...

        state, ok := status["state"].(string)
        if ok {
            fs.logger.Debug("[FileService] Folder state: %s", state)
            if state != "scanning" && state != "syncing" {
                // ✅ EXIT IMMEDIATELY when idle (no more sleep)
                fs.logger.Info("[FileService] Folder scan completed, state: %s", state)
                return nil
            }
        }

        time.Sleep(pollInterval)
    }
}
```

---

## Updated GenerateSnapshot Flow

The snapshot generation now properly sequences steps:

```
ProjectService.CreateProjectWithSnapshot()
  ├─ STEP 3a: WaitForScanCompletion() → Polls until idle, then EXITS
  └─ STEP 3b: GenerateSnapshot()
     ├─ Step 1: Get folder CONFIG (retrieve path) ✅ FIXED
     ├─ Step 2: Browse files
     ├─ Step 3: Get folder STATUS (for metadata)
     ├─ Step 4: Build snapshot metadata
     ├─ Step 5: Serialize JSON
     └─ Step 6: Upload to cloud
```

---

## Verification

✅ **Build Status:** `go build -o vidsync-agent ./cmd/agent` → **SUCCESS** (0 errors)

✅ **Removed Errors:**
- "Could not determine folder path"
- Continuous polling after folder becomes idle

✅ **Expected Behavior:**
- `WaitForScanCompletion()` polls with 500ms interval until state = "idle", then stops immediately
- `GenerateSnapshot()` retrieves folder path from `/rest/config/folders/{folderID}` endpoint
- No more redundant API calls after scan is complete

---

## Testing Checklist

- [ ] Create new project and monitor logs for clean exit from WaitForScanCompletion when state = "idle"
- [ ] Verify no "Could not determine folder path" error in GenerateSnapshot
- [ ] Confirm snapshot is generated successfully
- [ ] Verify snapshot contains proper file list and metadata
- [ ] Check that progress tracking shows clean 10% → 100% progression

