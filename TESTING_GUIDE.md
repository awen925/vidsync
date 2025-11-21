# Testing Guide: Snapshot Generation & Polling Fixes

## Quick Test (5 minutes)

### Test 1: Snapshot Generation Without Supabase
**Goal**: Verify snapshot generates and polling stops (no Supabase credentials)

1. **Start the system**:
   ```bash
   # Terminal 1: Cloud API
   cd cloud && npm run dev
   
   # Terminal 2: Go Agent
   cd go-agent && ./vidsync-agent
   
   # Terminal 3: Electron
   cd electron && npm run dev
   ```

2. **Create a project**:
   - Click "Create Project"
   - Enter name: "test-snap" 
   - Select path: `/tmp/test-snap` (or any directory)
   - Click Create

3. **Monitor Go Agent logs**:
   - Should see: `[INFO] [agent] [FileService] Snapshot generated successfully`
   - Should see: `[INFO] [agent] [FileService] Compressed: XXXXX → YYYYY bytes`
   - Should NOT see: Continuous polling after snapshot completes

4. **Verify in logs**:
   ```
   [2025-11-21 05:46:26] [DEBUG] [agent] [FileService] Compressing snapshot for storage...
   [2025-11-21 05:46:26] [INFO] [agent] [FileService] Compressed: 5345459 → 430613 bytes (8.1%)
   [2025-11-21 05:46:26] [DEBUG] [agent] [FileService] Uploading compressed snapshot to Supabase Storage...
   [2025-11-21 05:46:26] [ERROR] [agent] [FileService] Non-retryable error, failing immediately: failed to upload to Supabase Storage: Supabase credentials not configured
   [2025-11-21 05:46:26] [WARN] [agent] [FileService] Failed to upload snapshot to cloud: failed to upload to Supabase Storage: Supabase credentials not configured
   [2025-11-21 05:46:26] [INFO] [agent] [FileService] Snapshot generated (upload failed but local snapshot valid)
   ```

5. **Check polling stops**:
   - Look for `/rest/db/status?folder=` requests
   - Should see only ~3-5 requests total during generation
   - After "Snapshot generated", requests should completely stop
   - UI should become responsive immediately

**Expected Outcome**:
- ✅ Project created
- ✅ Snapshot generated (files compressed)
- ✅ Supabase upload fails gracefully
- ✅ Polling stops within 5 seconds
- ✅ No continuous polling in background

---

### Test 2: Snapshot Generation With Supabase
**Goal**: Verify snapshot uploads to Supabase successfully

**Prerequisites**:
- Supabase account at https://supabase.com
- Created project and `project-snapshots` bucket (public)
- Have SUPABASE_URL and SUPABASE_ANON_KEY

1. **Configure credentials**:
   ```bash
   # Edit go-agent/.env
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
   ```

2. **Restart Go Agent**:
   ```bash
   pkill vidsync-agent
   sleep 2
   cd go-agent && ./vidsync-agent
   ```

3. **Check startup logs**:
   ```
   [DEBUG] Supabase config - URL: https://YOUR_PROJECT.supabase.co, AnonKey: eyJh...nkey
   [INFO] FileService configured with Supabase storage: https://YOUR_PROJECT.supabase.co
   ```

4. **Create another project**:
   - Create project in Electron UI
   - Monitor Go Agent logs

5. **Verify upload success**:
   ```
   [2025-11-21 05:46:26] [INFO] [agent] [FileService] Compressed: 5345459 → 430613 bytes (8.1%)
   [2025-11-21 05:46:26] [DEBUG] [agent] [FileService] Uploading compressed snapshot to Supabase Storage...
   [2025-11-21 05:46:26] [DEBUG] [agent] [FileService] Uploading to https://...supabase.co/storage/v1/object/project-snapshots/...
   [2025-11-21 05:46:26] [INFO] [agent] [FileService] Snapshot stored at: https://...supabase.co/storage/v1/object/public/...
   [2025-11-21 05:46:26] [DEBUG] [agent] [FileService] Updating project snapshot_url in database...
   [2025-11-21 05:46:26] [INFO] [agent] [FileService] Project snapshot_url updated successfully
   ```

6. **Verify in Supabase**:
   - Go to https://app.supabase.com
   - Storage → project-snapshots bucket
   - Should see file: `PROJECT_ID/snapshot_TIMESTAMP.json.gz`
   - File size should be ~250-500KB (compressed)

**Expected Outcome**:
- ✅ Credentials loaded successfully
- ✅ Snapshot uploaded to Supabase
- ✅ Public URL generated
- ✅ Project database updated with snapshot_url
- ✅ Polling stops within 5 seconds

---

## Detailed Testing (15 minutes)

### Test 3: Polling Behavior Analysis

**Goal**: Verify polling interval and cleanup

1. **Open Network Tab**:
   - Electron DevTools: Ctrl+Shift+I → Network tab
   - Filter for: `/projects/` and `/rest/db/status`

2. **Create project and observe**:
   - Note timestamps of requests
   - Calculate interval between requests
   - Should be ~5 seconds consistently

3. **Verify interval**:
   ```
   Request 1: 05:46:19.123
   Request 2: 05:46:24.456  (5.3s later) ✓
   Request 3: 05:46:29.789  (5.3s later) ✓
   Request 4: 05:46:35.012  (5.2s later) ✓
   Request 5: 05:46:40.000  (STOP)       ✓
   ```

4. **Check for memory leaks**:
   - Electron DevTools → Memory tab
   - Take heap snapshot before project creation
   - Create project
   - Take heap snapshot after polling stops
   - Compare sizes (should be roughly same)

**Expected Outcome**:
- ✅ Polling interval is consistently 5 seconds
- ✅ Polling stops within 1-2 requests after generation completes
- ✅ Total requests: 5-10 (not 300+)
- ✅ No memory leaks from abandoned timers

---

### Test 4: Error Recovery

**Goal**: Verify polling stops gracefully on errors

1. **Stop Go Agent mid-polling**:
   - Start project creation
   - Wait 5 seconds (1 poll)
   - Stop agent: `pkill vidsync-agent`
   - Watch frontend

2. **Expected behavior**:
   - After 3 consecutive failed polls, should stop
   - Should not retry indefinitely
   - UI should show error gracefully

3. **Restart agent**:
   - `cd go-agent && ./vidsync-agent`
   - Create another project
   - Polling should work normally again

**Expected Outcome**:
- ✅ Stops polling after 3 consecutive errors
- ✅ Doesn't retry indefinitely
- ✅ User sees clear error message
- ✅ Can retry by creating another project

---

### Test 5: Multiple Projects

**Goal**: Verify polling works independently for multiple projects

1. **Create first project**:
   - Start creation
   - After 2 polls, don't wait for completion

2. **Create second project**:
   - Start creation of another project
   - Monitor that both poll independently

3. **Verify in logs**:
   - Should see polling for both project IDs
   - Each should poll for ~30-40 seconds
   - Each should stop independently

**Expected Outcome**:
- ✅ Each project polls independently
- ✅ Polling intervals don't interfere with each other
- ✅ Both stop within ~5 seconds of completion
- ✅ No cross-project polling bugs

---

## Log Markers to Look For

### Snapshot Generation Starting
```
[INFO] [agent] [ProjectService] CreateProjectWithSnapshot started for: PROJECT_NAME
[INFO] [agent] [ProjectService] STEP 1: Creating project in cloud database...
[INFO] [agent] [ProjectService] STEP 2: Creating Syncthing folder...
[INFO] [agent] [ProjectService] STEP 3: Starting background snapshot generation...
```

### Snapshot Generation Completing
```
[DEBUG] [agent] [FileService] Step 6: Uploading snapshot to cloud storage...
[INFO] [agent] [FileService] Compressed: XXXX → YYYY bytes (Z%)
[INFO] [agent] [FileService] Snapshot generated (upload failed but local snapshot valid)
[INFO] [agent] [ProjectService] STEP 3b SUCCESS: File snapshot generated and uploaded
```

### Polling Stopping Signal
When frontend stops polling, you should see:
- Fewer `/rest/db/status` requests
- Last request shows folder state as "idle"
- No more rapid polling requests

---

## Troubleshooting

### Problem: Still seeing continuous polling
**Check**:
1. Go Agent logs show "Snapshot generated"?
2. Frontend console shows `finalStatus: true`?
3. Are you using old build? Rebuild: `go build -o vidsync-agent ./cmd/agent/main.go`

### Problem: Snapshot never completes
**Check**:
1. Syncthing folder scanning? Check for `Folder scan completed` in logs
2. Check Supabase credentials if configured
3. Check file permissions in project directory

### Problem: Polling doesn't stop after 5 seconds
**Check**:
1. Verify polling interval is 5000ms: grep `POLL_INTERVAL` YourProjectsPage.tsx
2. Check `finalStatus` flag is being returned: grep `finalStatus` project_service.go
3. Rebuild both frontend and backend

---

## Success Criteria

A successful fix means:
- ✅ Snapshots generate even without Supabase credentials
- ✅ Frontend polling stops within 5 seconds of completion
- ✅ Polling interval is consistently 5 seconds (not 1-10 variable)
- ✅ Total polling requests: ~5-10 (not 300+)
- ✅ Frontend timer is cleaned up properly (no memory leaks)
- ✅ Backend returns clear `finalStatus: true` signal
- ✅ Supabase upload works when credentials are provided
- ✅ No continuous background polling after snapshot is done
