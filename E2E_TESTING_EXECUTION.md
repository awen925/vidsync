# End-to-End Testing Execution Guide

## ✅ Current Status

**Cloud Server:** Running on port 5000 ✅
- HTTP API: Ready
- WebSocket Service: Initialized
- Database: Connected
- Features: Phase 2B (Delta Sync) + Phase 2C (Real-Time)

---

## 📋 Testing Checklist

### Test 1: Basic File Change Detection
**Objective:** Verify FileWatcher detects file changes in the local folder

**Steps:**
1. Open Electron app (if not already open)
2. Create or open a project with a local_path
3. Navigate to that project folder in file browser
4. Check browser console (DevTools → Console tab)
5. Look for: `[FileWatcher]` logs indicating monitoring started
6. In a terminal, create a test file in the project folder:
   ```bash
   echo "test content" > /path/to/project/test-file.txt
   ```
7. Wait 1 second
8. Check Electron console for change detection logs

**Expected Output:**
```
[FileWatcher] Watching folder: /path/to/project
[FileWatcher] Detected: CREATE test-file.txt
[BackgroundSync] Batching change: test-file.txt
```

**Success Criteria:** ✅ Change detected and logged within 1 second

---

### Test 2: File Change Posted to Cloud API
**Objective:** Verify changes are posted to cloud server

**Steps:**
1. From Test 1, modify the test file:
   ```bash
   echo "updated content" > /path/to/project/test-file.txt
   ```
2. Wait 1-2 seconds for background sync
3. Check cloud server terminal output
4. Look for: `POST /api/projects/...` request logs

**Expected Output:**
```
POST /api/projects/[project-id]/files/update 200 OK
Inserted 1 event(s) into project_events table
```

**Success Criteria:** ✅ API receives and processes the change

---

### Test 3: WebSocket Broadcasting
**Objective:** Verify change is broadcast via WebSocket to all subscribers

**Steps:**
1. Open Electron app in two windows (or use two browser tabs for web client if available)
2. Both subscribe to same project
3. From Test 2, make another file change
4. Check cloud server logs for WebSocket broadcast:
   ```
   [WebSocket] Broadcasting to project:...
   ```
5. Check Electron console in both windows for event reception:
   ```
   [useProjectEvents] Received event: CREATE ...
   ```

**Expected Output:**
```
[WebSocket] Broadcasting to project:abc123 event data
[useProjectEvents] Received event: {change: {path: "test-file.txt", op: "CREATE"}}
```

**Success Criteria:** ✅ WebSocket broadcasts to all subscribers instantly

---

### Test 4: Real-Time Latency Measurement
**Objective:** Measure end-to-end latency from file change to WebSocket delivery

**Steps:**
1. Add timestamp logging in cloud server (POST handler)
2. Add timestamp logging in Electron hook (event received)
3. Calculate difference
4. Make file changes and measure latency

**Expected Output:**
```
File changed: 2025-11-14T10:00:00.001Z
API received: 2025-11-14T10:00:00.050Z (50ms)
WebSocket broadcast: 2025-11-14T10:00:00.055Z (55ms)
Client received: 2025-11-14T10:00:00.085Z (85ms)
Total latency: ~85ms ✅
```

**Success Criteria:** ✅ Latency < 100ms

---

### Test 5: Offline Recovery
**Objective:** Verify offline changes are recovered without full rescan

**Steps:**
1. Note current event sequence number from database
2. Stop cloud server:
   ```bash
   pkill -f "ts-node src/server.ts"
   ```
3. Make file changes in project folder (while offline)
4. Wait 5 seconds
5. Restart cloud server:
   ```bash
   cd cloud && npm run dev
   ```
6. Open Electron, navigate to project
7. Check console for recovery:
   ```
   [BackgroundSync] Syncing accumulated changes...
   GET /events?since_seq=...
   ```

**Expected Output:**
```
[BackgroundSync] Posted 3 accumulated changes
[BackgroundSync] Changes synced successfully
```

**Success Criteria:** ✅ All offline changes synced without full folder rescan

---

### Test 6: Bandwidth Measurement
**Objective:** Verify 99% bandwidth savings from deltas

**Steps:**
1. Create a test project with ~100 files
2. Use browser DevTools Network tab to monitor requests
3. Make 1 change to 1 file
4. Observe POST request size

**Expected Output:**
- Request body size: ~1-5KB (for single change)
- NOT: 100MB+ (full folder list)
- Bandwidth saved: 99%+

**Success Criteria:** ✅ Delta is <5KB (vs full scan being 100MB+)

---

### Test 7: Multi-User Sync
**Objective:** Verify multiple users see changes in real-time

**Steps:**
1. Open two Electron windows
2. Login as different users (or same user, two browsers)
3. Both subscribe to same project
4. User 1 makes file changes
5. User 2's view updates automatically

**Expected Output:**
```
User 1: Change detected
User 1: Posted to API
User 2: WebSocket event received
User 2: UI refreshed automatically
```

**Success Criteria:** ✅ User 2 sees changes within 100ms

---

### Test 8: File Deletion
**Objective:** Verify file deletion is properly tracked

**Steps:**
1. Create test file in project folder
2. Wait for sync (~1 second)
3. Delete the file:
   ```bash
   rm /path/to/project/test-file.txt
   ```
4. Wait 1 second
5. Check logs for deletion event:
   ```
   [FileWatcher] Detected: DELETE test-file.txt
   ```

**Expected Output:**
```
[FileWatcher] Detected: DELETE test-file.txt
[BackgroundSync] Change: {op: "DELETE", path: "test-file.txt"}
[WebSocket] Broadcasting deletion event
```

**Success Criteria:** ✅ Deletion tracked and broadcast

---

### Test 9: Connection Status Tracking
**Objective:** Verify connection state is tracked correctly

**Steps:**
1. Open Electron DevTools
2. Navigate to project
3. Check console for connection status:
   ```
   [useProjectEvents] Connected to WebSocket
   isConnected: true
   ```
4. Stop cloud server
5. Wait 5 seconds
6. Check console for failure:
   ```
   [useProjectEvents] Connection lost
   isConnected: false
   Reconnection attempt 1/5
   ```

**Expected Output:**
```
Connected: true
[Network error]
Reconnecting...
Reconnection attempt 1/5
[Exponential backoff: 1000ms]
```

**Success Criteria:** ✅ Connection state properly tracked and reported

---

### Test 10: Graceful Fallback
**Objective:** Verify HTTP polling fallback works if WebSocket unavailable

**Steps:**
1. Stop cloud server
2. Modify cloud/src/server.ts to comment out WebSocket initialization
3. Start server (HTTP only)
4. Open Electron
5. Check console for fallback:
   ```
   [useProjectEvents] WebSocket unavailable, using polling fallback
   Polling interval: 5000ms
   ```
6. Make file changes
7. Verify changes are synced via polling (5-30 second latency)

**Expected Output:**
```
[useProjectEvents] WebSocket connection failed
Falling back to HTTP polling
[BackgroundSync] Polling for changes
Synced 1 change (latency: 5.2s)
```

**Success Criteria:** ✅ Polling fallback works correctly

---

## 🔧 Manual Testing Steps

### Prerequisites
- Cloud server running on port 5000 ✅
- Electron app available
- Database connected
- Test project created with local_path

### Quick Test (5 minutes)
1. **Check server is running:**
   ```bash
   curl http://localhost:5000/health
   ```
   Should return 200 OK

2. **Open Electron DevTools:**
   - DevTools → Console tab
   - Look for `[WebSocket] Service initialized`

3. **Make file change:**
   ```bash
   echo "test" > /path/to/project/new-file.txt
   ```

4. **Observe:**
   - FileWatcher detects change (console log)
   - API receives change (cloud server log)
   - WebSocket broadcasts (cloud server log)
   - Client receives event (console log)

### Full Test (30 minutes)
Run all 10 tests above in order

---

## 📊 Results Tracking

| Test | Status | Latency | Notes |
|------|--------|---------|-------|
| 1. File Detection | ⏳ | - | |
| 2. API Posting | ⏳ | - | |
| 3. WebSocket Broadcast | ⏳ | - | |
| 4. Real-Time Latency | ⏳ | - | |
| 5. Offline Recovery | ⏳ | - | |
| 6. Bandwidth | ⏳ | - | |
| 7. Multi-User | ⏳ | - | |
| 8. Deletion | ⏳ | - | |
| 9. Connection Status | ⏳ | - | |
| 10. Fallback | ⏳ | - | |

---

## 🔍 Debugging Tips

### Check Cloud Server Logs
```bash
# See terminal with cloud server
# Look for [WebSocket] and request logs
```

### Check Electron Logs
```bash
# In Electron: DevTools → Console
# Look for [FileWatcher], [BackgroundSync], [useProjectEvents]
```

### Check Database
```bash
# View project_events table
psql -d vidsync -c "SELECT COUNT(*) FROM project_events;"

# View latest events
psql -d vidsync -c "SELECT seq, change, created_at FROM project_events ORDER BY seq DESC LIMIT 5;"
```

### Check Port 5000
```bash
# Verify server listening
lsof -i :5000

# Test endpoint
curl -v http://localhost:5000/health
```

---

## ✅ Success Criteria Summary

| Metric | Target | Result |
|--------|--------|--------|
| **File Detection** | Detect within 1s | ⏳ |
| **API Posting** | Post successfully | ⏳ |
| **WebSocket Broadcast** | Instant to subscribers | ⏳ |
| **Real-Time Latency** | <100ms | ⏳ |
| **Offline Recovery** | No full scan | ⏳ |
| **Bandwidth** | 99% savings | ⏳ |
| **Multi-User** | All see updates | ⏳ |
| **Deletion Tracking** | Tracked correctly | ⏳ |
| **Connection Tracking** | Proper state tracking | ⏳ |
| **Graceful Fallback** | Polling works | ⏳ |

**Overall:** Start testing above ⏳

---

## 📞 Troubleshooting

### "WebSocket connection failed"
- Check cloud server is running: `lsof -i :5000`
- Check server logs for errors
- May be expected - system falls back to polling

### "FileWatcher not detecting changes"
- Verify project has `local_path` set
- Check electron console for FileWatcher initialization
- Restart Electron app

### "API not receiving changes"
- Check cloud server logs
- Verify network connectivity
- Check database is connected

### "Port 5000 already in use"
```bash
lsof -i :5000 | tail -1 | awk '{print $2}' | xargs kill -9
```

---

## Next Steps

1. ✅ **Start Testing:** Follow the 10 tests above
2. 📊 **Track Results:** Update table above with actual results
3. ✅ **Validate Performance:** Confirm latency < 100ms and bandwidth 99% savings
4. 🚀 **Deploy:** If all tests pass, ready for production

---

Generated: 2025-11-14
Cloud Server Status: ✅ Running on port 5000
WebSocket: ✅ Initialized
Ready for Testing: ✅ YES
