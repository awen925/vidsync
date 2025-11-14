# Phase 2B + 2C: Quick Start Guide

**Your Choice:** Enterprise-grade real-time system  
**Timeline:** 4-5 days  
**Effort:** ~22 hours  
**Result:** Changes sync in <1 second

---

## What You're Building

```
Owner edits file
    ↓ (2 seconds)
File watcher detects
    ↓ (1 second)
Owner device posts delta
    ↓ (1 second)
Cloud appends to database
    ↓ (0.1 seconds)
WebSocket broadcasts event
    ↓ (0.1 seconds)
Invitee receives instantly
    ↓
UI shows sync badge ✓
```

**Total latency: <1 second**

---

## Files You'll Create/Modify

### Database (Migration)
```
cloud/migrations/008-create-project-events-table.sql (NEW)
```

### Backend Services
```
cloud/src/services/backgroundSyncService.ts (NEW)
```

### File Watching (Electron)
```
electron/src/main/services/fileWatcher.ts (NEW)
```

### WebSocket Server (Cloud)
```
cloud/src/server.ts (MODIFY - add socket.io)
```

### Client Hooks (React)
```
electron/src/renderer/hooks/useProjectEvents.ts (NEW)
electron/src/renderer/hooks/useRemoteFileList.ts (UPDATE)
```

### UI Components (React)
```
electron/src/renderer/components/SyncStatusBadge.tsx (UPDATE)
electron/src/renderer/pages/Projects/YourProjectsPage.tsx (UPDATE)
```

### Database Services
```
electron/src/main/services/localManifest.ts (NEW)
```

### API Routes (Update)
```
cloud/src/api/projects/routes.ts (UPDATE - add endpoints)
```

---

## Day-by-Day Breakdown

### Day 1: Database + File Watcher (4 hours)

**9:00 AM - Start**

1. Create database migration (30 min)
   - `cloud/migrations/008-create-project-events-table.sql`
   - Add project_events table
   - Add version field to remote_files
   - Run migration

2. Create file watcher service (1.5 hours)
   - `electron/src/main/services/fileWatcher.ts`
   - Watch Syncthing folder recursively
   - Detect file changes (create/update/delete)
   - Compute hashes only for changed files
   - Debounce rapid changes

3. Create background sync service (1.5 hours)
   - `cloud/src/services/backgroundSyncService.ts`
   - Process queued changes
   - Upsert to remote_files
   - Append to project_events
   - Emit events

4. Update POST /files/update endpoint (30 min)
   - `cloud/src/api/projects/routes.ts`
   - Accept deltas from owner device
   - Validate access control
   - Queue changes for processing

5. Test: Verify file watcher works (1 hour)
   - Create test files
   - Verify hash computation
   - Verify change detection
   - Check database updates

**5:00 PM - End of Day 1**

---

### Day 2: Delta Pull API + Testing (4 hours)

**9:00 AM - Start**

1. Add GET /events?since_seq endpoint (1 hour)
   - `cloud/src/api/projects/routes.ts`
   - Fetch events since sequence
   - Validate access control
   - Return events + next_seq for pagination

2. Integrate file watcher into Electron main process (1 hour)
   - Hook file watcher into startup
   - Start watching all owned projects
   - Stop when app exits
   - Handle errors gracefully

3. Test Phase 2B end-to-end (2 hours)
   - Owner device edits file
   - Verify POST /files/update called
   - Verify event logged in database
   - Invitee calls GET /events?since_seq
   - Verify invitee receives event
   - Test with 100+ files
   - Test delete operations

**5:00 PM - End of Day 2 (Phase 2B Complete! ✅)**

---

### Day 3: WebSocket Server (3 hours)

**9:00 AM - Start**

1. Set up socket.io server (1.5 hours)
   - `cloud/src/server.ts`
   - Install socket.io package
   - Initialize WebSocket server
   - Add authentication
   - Handle connect/disconnect

2. Implement project subscriptions (1 hour)
   - Subscribe to project:PROJECTID rooms
   - Send current state on subscribe
   - Send backlog for recovery
   - Handle unsubscribe

3. Add event broadcasting (30 min)
   - Emit event when project_events inserted
   - Broadcast to all subscribers
   - Include seq number

4. Test WebSocket basics (1 hour)
   - Start server
   - Connect client
   - Subscribe to project
   - Receive state snapshot
   - Verify room assignment

**4:00 PM - End of Day 3**

---

### Day 4: Client Integration (2 hours)

**9:00 AM - Start**

1. Create WebSocket hook (45 min)
   - `electron/src/renderer/hooks/useProjectEvents.ts`
   - Connect on component mount
   - Subscribe to project
   - Listen for events
   - Handle disconnect/reconnect

2. Create local manifest service (45 min)
   - `electron/src/main/services/localManifest.ts`
   - SQLite database for local tracking
   - Store file metadata
   - Update status
   - Merge events

3. Integrate into YourProjectsPage (30 min)
   - Listen to useProjectEvents hook
   - Merge events with file list
   - Update sync status badges
   - Re-render on changes

**12:00 PM - End of Day 4 (Phase 2C Complete! ✅)**

---

### Day 5: Polish & Testing (2 hours, Optional)

**9:00 AM - Start**

1. Error handling (30 min)
   - Handle WebSocket disconnects
   - Auto-reconnect logic
   - Error messages for users
   - Fallback to polling if needed

2. Performance testing (30 min)
   - Load test with 1000 events
   - Check memory usage
   - Check database query speed
   - Monitor WebSocket lag

3. End-to-end testing (1 hour)
   - Real Syncthing folder
   - Real invitees on different device
   - Edit files and watch sync
   - Verify badges update
   - Test network interruption

**12:00 PM - Done!**

---

## Recommended Reading Order

1. **PHASE2B_2C_COMPLETE_IMPLEMENTATION.md** (THIS FILE)
   - Detailed code for all components
   - Step-by-step reference
   - Copy-paste ready

2. **PHASE2_ARCHITECTURE_COMPARISON.txt**
   - Visual diagrams
   - Timeline examples
   - Understand the flow

3. **CHATGPT_RESEARCH_SUMMARY.md**
   - Why delta-first is better
   - ChatGPT's production architecture
   - Scale considerations

---

## Key Concepts to Understand

### 1. Delta Sync (Phase 2B)
- **What:** Only send changed files, not entire folder
- **Why:** 99% less bandwidth
- **How:** File watcher + POST /files/update + project_events table
- **Latency:** 30 seconds (if polling every 30s)

### 2. Event Log
- **What:** Append-only table of changes (project_events)
- **Why:** Clients can fetch since last seen (via seq number)
- **How:** Each change gets unique seq number
- **Benefit:** Offline recovery, no data loss

### 3. File Watcher
- **What:** Listen to filesystem for changes (fs.watch)
- **Why:** Detect changes instantly (not every 30s)
- **How:** Debounce to avoid duplicate detects
- **Latency:** <100ms

### 4. WebSocket Push (Phase 2C)
- **What:** Server broadcasts events to connected clients
- **Why:** Clients don't need to poll
- **How:** socket.io rooms (one per project)
- **Latency:** <100ms

### 5. Local Manifest
- **What:** SQLite database tracking local file status
- **Why:** Know which files are synced, syncing, pending
- **How:** Merge cloud events + local filesystem
- **Benefit:** Accurate sync badges

---

## Testing Strategy

### Phase 2B Testing (Day 2)

**Test 1: File watcher detects changes**
```bash
# 1. Start owner device
# 2. Add file to Syncthing folder
# 3. Verify POST /files/update called within 5 seconds
# 4. Check database: project_events has new row
✓ PASS: Event logged in <5 seconds
```

**Test 2: Delta pull works**
```bash
# 1. Make 5 changes
# 2. Call GET /events?since_seq=0
# 3. Verify all 5 events returned
# 4. Call GET /events?since_seq=3 (last known)
# 5. Verify only 2 new events returned
✓ PASS: Delta pull returns correct subset
```

**Test 3: Bandwidth improvement**
```bash
# Old way: Upload 10k file list every 30s = 5MB
# New way: Upload 1 delta every time file changes = 200 bytes
# With typical editing: 1 file per minute = 200 bytes/min
# Savings: 99% reduction
✓ PASS: Bandwidth ~99% less
```

### Phase 2C Testing (Day 4)

**Test 4: WebSocket event broadcast**
```bash
# 1. Client A subscribes to project
# 2. Owner makes change (POST /files/update)
# 3. Verify Client A receives event <1 second
# 4. Connect Client B
# 5. Owner makes another change
# 6. Verify both A and B receive <1 second
✓ PASS: Events broadcast instantly to all
```

**Test 5: Sync badges update**
```bash
# 1. Invitee opens file list
# 2. Files show status badges (synced/pending)
# 3. Owner adds new file
# 4. Verify badge appears within 1 second on invitee
# 5. Badge shows correct status (syncing → synced)
✓ PASS: UI updates instantly
```

**Test 6: Offline recovery**
```bash
# 1. Client connected, lastSeq = 100
# 2. Network disconnected
# 3. Owner makes 5 changes (seq 101-105)
# 4. Client reconnects
# 5. Verify backlog sent (5 missed events)
# 6. Verify UI merges all 5 changes
✓ PASS: No data loss on reconnect
```

---

## Common Issues & Solutions

### Issue 1: File watcher fires multiple times per change
**Solution:** Debounce with 500ms delay
```typescript
const timer = setTimeout(() => {
  reportChange(filename);
}, 500);
```

### Issue 2: WebSocket authentication fails
**Solution:** Pass userId in handshake
```typescript
const socket = io(url, {
  auth: { userId: localStorage.getItem('userId') }
});
```

### Issue 3: Memory grows unbounded
**Solution:** Trim event log after 30 days
```sql
DELETE FROM project_events 
WHERE created_at < NOW() - INTERVAL '30 days'
```

### Issue 4: UI doesn't update when event received
**Solution:** Use React state properly
```typescript
setEvents((prev) => [...prev, newEvent]); // ✓ Correct
```

### Issue 5: Network latency makes sync slow
**Solution:** Add progress indicator while syncing
```typescript
<SyncStatusBadge status="syncing" progress={45} />
```

---

## Deliverables

### Phase 2B Deliverable
```
✅ File watcher working
✅ POST /files/update endpoint
✅ GET /events?since_seq endpoint
✅ project_events table populated
✅ 90% bandwidth reduction verified
✅ Changes detected in <5 seconds
```

### Phase 2C Deliverable
```
✅ WebSocket server running
✅ Client subscription logic
✅ Event broadcasting working
✅ UI updates in <1 second
✅ Offline recovery working
✅ Sync badges showing correct status
```

### Final Deliverable (Complete)
```
✅ Production-ready sync system
✅ Enterprise-grade real-time UX
✅ Handles 10k+ files per project
✅ <1 second latency
✅ 99% bandwidth savings
✅ Full offline support
✅ TypeScript: 0 errors
✅ Comprehensive tests passing
```

---

## Success Metrics

After Phase 2B + 2C, you should see:

| Metric | Target | How to Measure |
|--------|--------|---|
| **Change Detection** | <100ms | Check logs |
| **Server Processing** | <10ms | Check database |
| **WebSocket Latency** | <100ms | Check browser DevTools |
| **UI Update** | <500ms | Manual testing |
| **Total Latency** | <1 second | Owner → Invitee time |
| **Bandwidth** | -90% | Monitor network traffic |
| **Database Queries** | <50ms | Check slow query log |
| **Memory Usage** | Stable | Monitor over 1 hour |

---

## Next Step

**You're ready to start!**

Open: **PHASE2B_2C_COMPLETE_IMPLEMENTATION.md**

Start with: **Step 1: Database Migration**

Good luck! This is going to be awesome. 🚀

