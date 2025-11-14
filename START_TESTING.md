# Ready to Test: Next Actions

## ✅ Current Status

**Cloud Server:** Running on port 5000 ✅  
**WebSocket:** Initialized ✅  
**All Code:** Deployed and verified ✅

---

## 🚀 To Begin Testing

### Step 1: Open Electron App (New Terminal Window)

```bash
cd /home/fograin/work1/vidsync/electron
npm start
```

Wait for the app to load.

---

### Step 2: Create a Test Project

In the Electron app UI:
1. Click "Create Project"
2. Name it: `Test-Sync-Project`
3. Set `local_path` to: `/tmp/test-sync-folder` (or any folder)
4. Click "Create"

---

### Step 3: Prepare for Testing

In a new terminal:
```bash
# Create test folder
mkdir -p /tmp/test-sync-folder

# Create initial test file
echo "Initial content" > /tmp/test-sync-folder/test1.txt
```

---

### Step 4: Open DevTools in Electron

In the Electron app:
- Press: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
- Go to: **Console** tab
- You should see logs like:
  ```
  [FileWatcher] Watching folder: /tmp/test-sync-folder
  [useProjectEvents] Connected to WebSocket
  ```

---

### Step 5: Test File Detection

In the test terminal, create a new file:
```bash
echo "new content" > /tmp/test-sync-folder/test2.txt
```

In Electron Console, you should see:
```
[FileWatcher] Detected: CREATE test2.txt
[BackgroundSync] Batching change: test2.txt
[useProjectEvents] Received event: CREATE test2.txt
```

---

### Step 6: Test File Update

In the test terminal, modify a file:
```bash
echo "updated content" >> /tmp/test-sync-folder/test1.txt
```

In Electron Console, you should see:
```
[FileWatcher] Detected: UPDATE test1.txt
[BackgroundSync] Batching change: test1.txt
[useProjectEvents] Received event: UPDATE test1.txt
```

---

### Step 7: Test File Deletion

In the test terminal, delete a file:
```bash
rm /tmp/test-sync-folder/test1.txt
```

In Electron Console, you should see:
```
[FileWatcher] Detected: DELETE test1.txt
[BackgroundSync] Batching change: test1.txt
[useProjectEvents] Received event: DELETE test1.txt
```

---

### Step 8: Monitor Cloud Server

In the cloud terminal (where `npm run dev` is running), you should see:
```
POST /api/projects/[project-id]/files/update 200 OK
[WebSocket] Broadcasting to project:[project-id]
Inserted 1 event(s) into project_events table
```

---

### Step 9: Check the File Browser

In the Electron app:
1. Click on the test project
2. Open File Browser
3. Files should appear automatically (created/updated/deleted)
4. No manual refresh needed

---

### Step 10: Test Multi-User (Optional)

Open another Electron window or browser tab:
1. Make changes from first window
2. Second window's file list updates automatically
3. Changes appear <100ms later (WebSocket speed)

---

## 📊 What to Look For

### Success Indicators

✅ **FileWatcher logs appear immediately:**
```
[FileWatcher] Detected: CREATE test2.txt
```

✅ **File changes are posted to API:**
- Cloud server terminal shows: `POST /api/projects/.../files/update 200 OK`

✅ **WebSocket broadcasts changes:**
- Cloud server terminal shows: `[WebSocket] Broadcasting to project:...`

✅ **Client receives events:**
- Electron console shows: `[useProjectEvents] Received event: ...`

✅ **File browser updates automatically:**
- New files appear without page refresh
- Deleted files disappear
- Modified files show updated timestamps

✅ **Multiple users see updates:**
- Open two windows, both get updates instantly

---

## ⏱️ Performance to Verify

### Latency Test
1. Note the time
2. Create file: `echo "test" > /tmp/test-sync-folder/latency-test.txt`
3. Check when it appears in Electron console
4. Should be <100ms from creation to reception

### Bandwidth Test
1. Open browser DevTools (F12) → Network tab
2. Create file
3. Look for POST request to `/files/update`
4. Request body should be ~1-5KB (NOT 100MB+)

### Offline Test
1. Stop cloud server: `pkill -f "ts-node src/server.ts"`
2. Create/modify files
3. Restart cloud server: `cd cloud && npm run dev`
4. Changes should sync without full folder rescan

---

## 🔍 Troubleshooting

### "No logs in console"
- Check project has `local_path` set
- Make sure file is created in the correct folder
- Restart Electron app
- Open DevTools again

### "WebSocket connection failed"
- This is **OK** - system falls back to HTTP polling
- Changes will sync with 5-30 second delay instead of <100ms
- Check cloud server is running: `lsof -i :5000`

### "File doesn't appear in browser"
- Wait 1-2 seconds (debouncing + API delay)
- Check cloud server logs for POST request
- Check database has record: `psql -d vidsync -c "SELECT * FROM project_events ORDER BY seq DESC LIMIT 5;"`

### "Cloud server not responding"
```bash
# Restart it
pkill -f "ts-node src/server.ts"
cd /home/fograin/work1/vidsync/cloud && npm run dev
```

---

## 📝 Test Checklist

- [ ] Cloud server running on port 5000
- [ ] Electron app opens
- [ ] Test project created with local_path
- [ ] Console shows FileWatcher logs
- [ ] Console shows WebSocket connection status
- [ ] File creation detected
- [ ] File update detected
- [ ] File deletion detected
- [ ] Cloud server receives POST requests
- [ ] File browser updates automatically
- [ ] Changes visible in file list
- [ ] Multiple windows get updates
- [ ] Latency is <100ms (or 5-30s for polling)
- [ ] Bandwidth is 1-5KB per change
- [ ] Offline recovery works

---

## 📚 Full Testing Documentation

For comprehensive testing procedures with 10 detailed scenarios:

```bash
cat /home/fograin/work1/vidsync/E2E_TESTING_EXECUTION.md
```

For quick reference:

```bash
cat /home/fograin/work1/vidsync/TESTING_QUICK_START.md
```

For current status:

```bash
cat /home/fograin/work1/vidsync/TEST_STATUS_REPORT.md
```

---

## 🎯 Summary

1. ✅ **Setup:** Start Electron app (you are here)
2. ⏳ **Create:** Create test project with local_path
3. 🧪 **Test:** Make file changes and watch them sync
4. 📊 **Measure:** Verify latency <100ms and bandwidth savings
5. ✅ **Verify:** All 10 test scenarios pass

**Estimated time:** 30-60 minutes for full testing

---

## 💡 What You'll See

### Electron Console (with logs enabled):
```
[FileWatcher] Watching folder: /tmp/test-sync-folder
[useProjectEvents] Connected to WebSocket
[useProjectEvents] Subscribed to project:abc123

User creates: test.txt

[FileWatcher] Detected: CREATE test.txt
[BackgroundSync] Batching change: test.txt
[useProjectEvents] Received event: {
  seq: 1,
  change: { path: "test.txt", op: "CREATE", hash: "xyz...", size: 100 },
  created_at: "2025-11-14T10:30:45.123Z"
}
```

### Cloud Server Console:
```
POST /api/projects/abc123/files/update 200 OK
[WebSocket] Broadcasting to project:abc123
Inserted 1 event(s) into project_events table
```

### Electron File Browser:
```
test.txt  (created just now)
test2.txt (created just now)
```

---

## ✨ Next: Start Testing!

Now you're ready. Follow the steps above and enjoy real-time sync! 🚀

---

Generated: 2025-11-14  
Status: Ready for End-to-End Testing ✅
