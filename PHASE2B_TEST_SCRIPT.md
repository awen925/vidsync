# Phase 2B Testing Guide - API Endpoints

## Overview
This guide walks through testing the Phase 2B implementation:
- FileWatcher service (detects file changes)
- POST /api/projects/:projectId/files/update (receive deltas)
- GET /api/projects/:projectId/events (pull deltas)
- Automatic API calling from electron app

## Prerequisites
✅ Day 1 completed: Database migration 008, APIs implemented
✅ Day 2 Part 1 completed: FileWatcher integrated into electron, IPC handlers created
⏳ Part 2 (this): API testing + end-to-end verification

## Test Execution Plan

### Step 1: Verify Database Migration Applied
```bash
# Check if project_events table exists
psql -U postgres -d vidsync -c "\dt project_events"

# Expected output:
# Schema |       Name        | Type  |
#--------+-------------------+-------+
# public | project_events    | table |
```

### Step 2: Start Cloud Server
```bash
cd /home/fograin/work1/vidsync/cloud
npm run dev
# Expected: Server starts on http://localhost:5000
# Watch for: No TypeScript errors
```

### Step 3: Test POST /api/projects/:projectId/files/update

**Setup:**
1. Create a test project in UI or via API
2. Get the projectId (UUID)
3. Note your authToken

**Manual Test with cURL:**
```bash
# Variables
PROJECT_ID="YOUR_PROJECT_UUID_HERE"
AUTH_TOKEN="YOUR_AUTH_TOKEN_HERE"
API_URL="http://localhost:5000/api/projects"

# Test 1: Post a single file create event
curl -X POST \
  $API_URL/$PROJECT_ID/files/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "changes": [
      {
        "path": "test-file.txt",
        "op": "create",
        "hash": "abc123def456",
        "mtime": '$(date +%s)'000,
        "size": 1024
      }
    ]
  }'

# Expected response:
# {
#   "success": true,
#   "processed": 1,
#   "results": [
#     { "path": "test-file.txt", "op": "create", "status": "success" }
#   ]
# }
```

**What it does:**
- Posts file change to API
- Updates `remote_files` table (upsert)
- Appends entry to `project_events` log (seq=1)
- Returns success

**Verify in Database:**
```bash
psql -U postgres -d vidsync -c "
SELECT * FROM remote_files 
WHERE project_id = 'YOUR_PROJECT_UUID' 
ORDER BY created_at DESC LIMIT 1;"

psql -U postgres -d vidsync -c "
SELECT id, seq, change 
FROM project_events 
WHERE project_id = 'YOUR_PROJECT_UUID' 
ORDER BY seq DESC LIMIT 1;"
```

### Step 4: Test Multiple Changes

**Test 2: Batch multiple file changes**
```bash
curl -X POST \
  $API_URL/$PROJECT_ID/files/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "changes": [
      {
        "path": "videos/movie.mp4",
        "op": "create",
        "hash": "hash1",
        "mtime": '$(date +%s)'000,
        "size": 1048576
      },
      {
        "path": "videos/movie2.mp4",
        "op": "create",
        "hash": "hash2",
        "mtime": '$(date +%s)'000,
        "size": 2097152
      },
      {
        "path": "test-file.txt",
        "op": "update",
        "hash": "abc123def789",
        "mtime": '$(date +%s)'000,
        "size": 2048
      }
    ]
  }'

# Expected response: All 3 processed successfully
# Verify: remote_files has 3 new rows (or 1 updated), project_events has 3 new rows (seq 2,3,4)
```

### Step 5: Test GET /api/projects/:projectId/events

**Test 3: Fetch all events since start**
```bash
curl -X GET \
  "$API_URL/$PROJECT_ID/events?since_seq=0&limit=100" \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Expected response:
# {
#   "success": true,
#   "events": [
#     { "id": ..., "project_id": "...", "seq": 1, "change": {...}, "created_at": "..." },
#     { "id": ..., "project_id": "...", "seq": 2, "change": {...}, "created_at": "..." },
#     { "id": ..., "project_id": "...", "seq": 3, "change": {...}, "created_at": "..." },
#     { "id": ..., "project_id": "...", "seq": 4, "change": {...}, "created_at": "..." }
#   ],
#   "last_seq": 4,
#   "has_more": false
# }
```

**Test 4: Fetch events with offset (pagination)**
```bash
curl -X GET \
  "$API_URL/$PROJECT_ID/events?since_seq=2&limit=2" \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Expected response:
# - Returns seq 3 and 4 (since_seq=2 means "after seq 2")
# - has_more: false (because we only had 4 events total)
# - last_seq: 4
```

### Step 6: Test File Delete

**Test 5: Delete a file**
```bash
curl -X POST \
  $API_URL/$PROJECT_ID/files/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "changes": [
      {
        "path": "test-file.txt",
        "op": "delete"
      }
    ]
  }'

# Expected: File marked as deleted in remote_files, event appended
# Verify: 
# - remote_files: deleted_at and deleted_by populated
# - project_events: new seq with op: "delete"
```

### Step 7: End-to-End Test (Electron App)

**When you're ready to test the full integration:**

1. **Create an owned project in the UI**
   - Go to "Create Project"
   - Set a local folder path (e.g., `/tmp/test-project`)
   - Save project
   - Note the projectId from URL or console

2. **Start file watcher (via IPC)**
   - Renderer calls: `window.api.fileWatcherStartWatching(projectId, localPath, authToken)`
   - This happens automatically when you open the project
   - FileWatcher starts monitoring the folder

3. **Create test files**
   ```bash
   mkdir -p /tmp/test-project
   echo "test content" > /tmp/test-project/file1.txt
   cp /path/to/large-video.mp4 /tmp/test-project/video.mp4
   ```

4. **Verify changes were posted**
   - Check Cloud server logs for POST requests
   - Check database: `SELECT COUNT(*) FROM project_events WHERE project_id = ...`
   - Should see new event rows

5. **Stop file watcher**
   - Close project or call: `window.api.fileWatcherStopWatching(projectId)`

### Step 8: Performance Verification

**Bandwidth Savings Test:**

1. Create 100 test files (each ~1MB):
   ```bash
   mkdir -p /tmp/perf-test
   for i in {1..100}; do
     dd if=/dev/urandom of=/tmp/perf-test/file-$i.bin bs=1M count=1
   done
   ```

2. Post changes to API:
   ```bash
   # Each file = one delta entry
   # Total bytes posted: ~100 * 100B per delta = 10KB
   # Total folder size: ~100MB
   # Bandwidth saved: 99.99%
   ```

3. Measure:
   ```bash
   # Watch network traffic while creating/modifying files
   # tcpdump, wireshark, or browser DevTools Network tab
   # Expected: <100KB traffic vs 100MB full scan
   ```

## Checklist

- [ ] Migration 008 applied (project_events table exists)
- [ ] Cloud server starts without errors
- [ ] POST /files/update accepts batch changes
- [ ] Changes stored in remote_files (upsert)
- [ ] Events appended to project_events (seq monotonic)
- [ ] GET /events returns correct sequence
- [ ] Pagination works (since_seq, limit, has_more)
- [ ] Delete operation marks file as deleted
- [ ] FileWatcher detects changes (verified in logs)
- [ ] API receives POST requests automatically
- [ ] Bandwidth savings: 99%+ (deltas vs full rescan)

## Success Criteria

✅ **Phase 2B Complete** when:
1. All API endpoints working correctly
2. Database receiving and storing events
3. FileWatcher integrated and auto-calling API
4. End-to-end flow tested (create file → detect → post → log)
5. Performance verified (99% bandwidth savings)

## Next: Phase 2C (WebSocket)

Once Phase 2B testing is complete, ready to implement:
- socket.io server
- Project subscriptions
- Real-time event broadcasting
- <1 second delivery (vs HTTP polling)

---

Generated: Day 2, Phase 2B Testing Guide
