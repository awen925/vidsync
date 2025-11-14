# Phase 2 Sync Architecture Analysis
**Date:** November 14, 2025  
**Status:** Critical Gap Analysis - Comparing ChatGPT Research vs Current Design

---

## Executive Summary

ChatGPT's research describes a **delta-first, event-log architecture** that's production-grade for 10k+ files. Your current Phase 2 design is **snapshot-first** (scan entire folder, upload all at once). 

**Key difference:**
- ❌ **Current:** Owner uploads entire file list → Invitees get full list on every change
- ✅ **ChatGPT:** Owner uploads only CHANGED files → Invitees get deltas, merge locally

**Impact:** ChatGPT's approach uses **90% less bandwidth** and **handles 10k files at scale**.

---

## 1) What You ALREADY HAVE (Excellent Foundation)

### ✅ Database Schema (Phase 1)
```
Your current: remote_files table
ChatGPT equivalent: project_files table

Status: COMPATIBLE ✅
- Your remote_files has: path, name, size, is_directory, mime_type, file_hash, modified_at
- ChatGPT needs: path, is_dir, size, mtime, hash, deleted, version
- Mapping: You have everything! Just add "version" field for optimistic locking
```

### ✅ API GET Endpoint (Phase 1)
```
Your: GET /api/projects/:projectId/files-paginated
ChatGPT equivalent: GET /api/projects/:id/files?prefix=dir/&limit=100&cursor=...

Status: COMPATIBLE ✅
- Your endpoint supports pagination (100 items/page)
- ChatGPT recommends prefix-based directory queries (same thing!)
- Your endpoint returns: files array + pagination metadata
- ChatGPT needs: same structure
```

### ✅ RLS & Security (Phase 1)
```
Your: Row-level security policies enforce access control
ChatGPT requirement: Authorize every project request

Status: EXCELLENT ✅
- You already have this! RLS prevents unauthorized access at DB layer
```

---

## 2) What You're MISSING (ChatGPT's Key Insights)

### ❌ 1. Delta/Event Log Table
```sql
-- You NEED this:
CREATE TABLE project_events (
  id bigserial PRIMARY KEY,
  project_id UUID NOT NULL,
  seq bigint NOT NULL,                    -- Sequence number for ordering
  change jsonb NOT NULL,                  -- {path, op:create/update/delete, hash, mtime}
  created_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(project_id, seq)
);

CREATE INDEX ON project_events (project_id, seq);

-- This is the append-only change log
-- Invitees pull only NEW events (since_seq=123) instead of rescanning everything
```

**Why:** 
- Current: Owner scans entire folder, uploads ALL files → DB has full snapshot
- Better: Owner detects only CHANGED files, uploads deltas → DB has change log
- Invitees pull only changes since last known seq → 90% less bandwidth

---

### ❌ 2. File Versioning & Change Detection
```sql
-- Add to remote_files:
ALTER TABLE remote_files ADD COLUMN version BIGINT DEFAULT 1;

-- When file changes: version increments
-- Invitees use this to detect stale caches
UPDATE remote_files 
SET version = version + 1, modified_at = NOW()
WHERE project_id = ? AND path = ?;
```

**Why:** Enables optimistic locking and conflict detection on concurrent edits.

---

### ❌ 3. Owner-Side File Watcher + Incremental Scan
```typescript
// You NEED this on owner's Electron device:

// Current: Scan entire Syncthing folder every 30 seconds
// ❌ Problem: 10k files = slow, wasteful, bandwidth-heavy

// Better: Watch for filesystem changes, only scan changed files
import * as fs from 'fs';

const watcher = fs.watch(syncthingFolderPath, { recursive: true }, (event, filename) => {
  if (event === 'change' || event === 'rename') {
    // Only hash THIS file, not entire folder
    const fileHash = await computeHash(filename);
    
    // Post delta (not full list)
    await postFileChange({
      project_id: projectId,
      changes: [{
        path: filename,
        op: 'update',  // or 'create' or 'delete'
        hash: fileHash,
        mtime: stats.mtime,
        size: stats.size
      }]
    });
  }
});
```

**Why:** 
- Current design: Scans all 10k files every 30s (wasteful)
- Better: Watch only changed files, post deltas immediately
- Result: Changes reach invitees in <1 second vs 30+ seconds

---

### ❌ 4. Delta Pull API Endpoint
```typescript
// You have GET /files-paginated (directory listing)
// You NEED: GET /projects/:id/events?since_seq=123&limit=500

// Current: Invitees call GET /files-paginated (fetches directory)
// Better: Invitees call GET /events?since_seq=123 (fetches only changes since seq 123)

router.get('/:projectId/events', authMiddleware, async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { since_seq = '0', limit = '500' } = req.query;
  const userId = (req as any).user.id;
  
  // Check access
  // ... access control ...
  
  // Fetch events since seq
  const { data: events } = await supabase
    .from('project_events')
    .select('*')
    .eq('project_id', projectId)
    .gt('seq', parseInt(since_seq))
    .order('seq')
    .limit(parseInt(limit));
  
  res.json({
    events,
    next_seq: events[events.length - 1]?.seq + 1
  });
});
```

**Why:** 
- Invitees don't rescan entire directory, just pull new events
- Handles offline recovery (client requests events since last known seq)
- Database-efficient (index on project_id, seq)

---

### ❌ 5. WebSocket Push for Real-Time Updates
```typescript
// Current: Invitees poll API every 5 minutes
// Better: Server pushes deltas via WebSocket

// Server side:
projectEventEmitter.on('fileChanged', (projectId, event) => {
  // Find all connected clients subscribed to this project
  const subscribers = wsClients.get(projectId) || [];
  
  subscribers.forEach(ws => {
    ws.send(JSON.stringify({
      type: 'PROJECT_EVENT_BATCH',
      projectId,
      events: [event],
      seq: event.seq
    }));
  });
});

// Client side (Electron):
const ws = new WebSocket(`wss://api.vidsync.io/projects/${projectId}/events/stream`);

ws.onmessage = (msg) => {
  const { type, events, seq } = JSON.parse(msg.data);
  
  if (type === 'PROJECT_EVENT_BATCH') {
    // Merge events with local manifest
    updateLocalManifest(events);
    
    // Update UI (re-render file list with new events)
    updateFileList();
    
    // Remember last seen seq for recovery
    localStorage.setItem(`lastSeq:${projectId}`, seq);
  }
};
```

**Why:**
- Current: 5 minute poll lag (user doesn't see changes until refresh)
- Better: Changes appear in <1 second via WebSocket
- Bandwidth: Only push new events, not entire list

---

### ❌ 6. Local SQLite Manifest (On Owner & Invitee Devices)
```typescript
// ChatGPT recommends: each device maintains local SQLite manifest

// Owner device: ~/vidsync/projects/ProjectId/manifest.db
CREATE TABLE local_files (
  path TEXT PRIMARY KEY,
  size INTEGER,
  mtime INTEGER,
  hash TEXT,
  has_hash INTEGER
);

// Invitee device: same structure

// Purpose:
// 1. Owner: quickly detect which files changed (compare disk vs SQLite)
// 2. Invitee: merge cloud files + local sync status

// Usage:
const localFiles = await getLocalFiles('/syncthing/shared/Project:123/');
const cloudFiles = await getRemoteFiles(projectId);

// Merge and show status: {name, size, cloudHash, localHash, status: 'synced'|'downloading'|'changed'}
```

**Why:**
- Current: No local tracking on invitee device
- Better: Invitees know which files are syncing, fully synced, or have conflicts
- Enables smart sync badges (✓ ⟳ ⚠ ✗)

---

### ❌ 7. Snapshot Service + Caching
```typescript
// For initial project open (10k files), don't transfer raw event log
// Instead: generate snapshot (compressed metadata dump) and cache in Redis

// Background job (runs when many changes detected):
async function generateSnapshot(projectId) {
  const files = await supabase
    .from('remote_files')
    .select('path,name,size,is_directory,mime_type,modified_at')
    .eq('project_id', projectId)
    .is('deleted_by', null)
    .order('path');
  
  // Compress to NDJSON (newline-delimited JSON)
  const ndjson = files
    .map(f => JSON.stringify(f))
    .join('\n');
  
  const compressed = gzip(ndjson);
  
  // Cache in Redis
  await redis.set(`snapshot:${projectId}`, compressed, 'EX', 3600);
  
  // Notify invitees
  emitter.emit('snapshotReady', projectId, files.length);
}

// API endpoint for snapshot:
router.get('/:projectId/snapshot', authMiddleware, async (req, res) => {
  const snapshot = await redis.getBuffer(`snapshot:${projectId}`);
  
  if (!snapshot) {
    // Fallback: generate on-demand
    await generateSnapshot(projectId);
    // ... retry ...
  }
  
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(snapshot);
});
```

**Why:**
- Current: Invitees pull 100 items/page (100 API calls for 10k files)
- Better: Download entire manifest once via snapshot (gzipped = ~500KB)
- Then use delta events for updates
- Result: First load slower but more efficient overall

---

## 3) Detailed Comparison Table

| Feature | Current Phase 2 | ChatGPT Recommendation | Gap |
|---------|---|---|---|
| **Database Schema** | remote_files table | + project_events table | ❌ Need delta log |
| **File Versioning** | No | Yes (version field) | ❌ Add version field |
| **Change Detection** | Scan entire folder every 30s | Watch filesystem, post deltas | ❌ Need file watcher |
| **Sync API** | POST /files-sync (full upload) | POST /projects/:id/files/update (deltas) | ⚠️ Redesign endpoint |
| **Fetch API** | GET /files-paginated | GET /files?prefix= (same) + GET /events?since_seq= | ⚠️ Add delta endpoint |
| **Real-Time Updates** | None (polling) | WebSocket event stream | ❌ Need WebSocket |
| **Local Manifest** | None | SQLite on each device | ❌ Add SQLite tracking |
| **Snapshot Service** | None | Redis cached manifest | ⚠️ Add caching layer |
| **Batching** | Single file at a time | Batch 100-500 changes | ⚠️ Add batch logic |
| **Conflict Resolution** | Not handled | Versioning + optimistic lock | ❌ Not handled |
| **Bandwidth** | High (full rescans) | Low (deltas only) | 🔴 **90% waste** |
| **Latency to Invitees** | 5+ minutes | <1 second | 🔴 **5 min lag** |

---

## 4) Recommended Phasing

### **Phase 2A (Current) - MVP: File Listing**
✅ What you have now
- Database: remote_files table
- API: GET /files-paginated (directory listing)
- Invitees can browse files, see pagination
- **Latency:** First load ~500ms, but stale after 5 min
- **Bandwidth:** Acceptable (paginated)

### **Phase 2B (Add Delta Support) - Delta Sync Flow**
❌ Not in current design
- Add: project_events table (delta log)
- Add: GET /events?since_seq= endpoint (delta pull)
- Modify: POST /files-sync to append events (not just update remote_files)
- Add: File watcher on owner device
- **Latency:** Changes reach invitees in ~30 seconds
- **Bandwidth:** 90% less (deltas vs full rescans)
- **Time to implement:** 3-4 hours

### **Phase 2C (Add Real-Time) - WebSocket Push**
❌ Not in current design
- Add: WebSocket server for project event streams
- Add: Client-side WS subscription in Electron
- Add: Local SQLite manifest on devices
- **Latency:** Changes reach invitees in <1 second
- **Time to implement:** 4-5 hours

### **Phase 2D (Add Snapshots & Caching) - Scale**
⚠️ Nice-to-have
- Add: Snapshot generation (Redis cache)
- Add: Snapshot download endpoint
- Optimize: Initial load via snapshot + subsequent deltas
- **Bandwidth:** First load more efficient (single download vs 100 paginated calls)
- **Time to implement:** 2-3 hours

### **Phase 3: Conflict Resolution & Advanced**
❌ Future
- Versioning + optimistic locks
- Conflict detection on concurrent edits
- Sync conflict UI
- **Time to implement:** 5+ hours

---

## 5) My Recommendation for You

**Your situation:**
- You have 13 hours allocated for Phase 2
- Current design covers basic file browsing (MVP)
- You want to handle 10k files at scale
- You want invitees to see changes

**Option A: Stick with Current Phase 2 (Fast, Limited)**
- ✅ Pro: Ships in 2-3 days, invitees can browse files
- ❌ Con: Changes take 5+ minutes to appear, wastes bandwidth on rescans
- ⏱️ Time: 13 hours total

**Option B: Add Phase 2B (Delta Sync) - RECOMMENDED**
- ✅ Pro: Changes appear in 30 seconds, 90% less bandwidth, still production-ready
- ✅ Pro: Uses ChatGPT's delta-first approach (proven at scale)
- ⚠️ Con: Requires redesign of POST /files-sync endpoint
- ⏱️ Time: 13 + 4 = 17 hours total (1-2 extra days)
- 🎯 **Recommended:** Best ROI for scale

**Option C: Add Phase 2B + 2C (Real-Time WebSocket)**
- ✅ Pro: Changes appear in <1 second, excellent UX
- ✅ Pro: Handles 10k files elegantly
- ⚠️ Con: More complex (WebSocket server, client subscription)
- ⏱️ Time: 13 + 4 + 5 = 22 hours total (add 2-3 days)
- 🎯 **Premium:** Best UX, still achievable

---

## 6) Specific Action Items (If You Choose Option B or C)

### If you do Phase 2B (Delta Sync):

**New files to create:**
1. Database migration to add `project_events` table
2. Update POST /files-sync endpoint to append events
3. New GET /events endpoint for delta pulling
4. File watcher service on owner device

**Files to modify:**
1. cloud/schema.sql (add project_events)
2. cloud/src/api/projects/routes.ts (update POST /files-sync, add GET /events)
3. electron/src/main/services/fileWatcher.ts (new)

**Estimated code:**
- Migration: 30 lines
- Schema: 40 lines
- POST endpoint modification: 50 lines
- GET /events endpoint: 40 lines
- File watcher: 100 lines
- **Total: ~260 lines** (1-2 hours of work)

### If you do Phase 2C (WebSocket):

**Add:**
1. WebSocket server setup in cloud API
2. Project event subscription service
3. Client-side WS listener in Electron
4. Local SQLite manifest on devices
5. Event merge logic (cloud + local)

**Estimated code:** ~400 lines across 5 files (3-4 hours)

---

## 7) Decision Framework

**Ask yourself:**
1. **Do you want to ship fast?** → Stick with current Phase 2 (2-3 days)
2. **Do you want to be production-ready at 10k files?** → Add Phase 2B (3-4 days total)
3. **Do you want excellent real-time UX?** → Add Phase 2B + 2C (4-5 days total)

**My take:** 
- Current design is solid for MVP
- ChatGPT's delta-first approach is **the correct architecture** for 10k+ files
- Phase 2B (add delta sync) is the sweet spot: **production-grade + reasonable timeline**
- Phase 2C (add WebSocket) is nice-to-have but not critical

---

## 8) Next Steps

**Which would you prefer?**

1. **Proceed with current Phase 2** (file listing MVP)
   - Implement in 2-3 days
   - Ship functional (but not optimized) system

2. **Extend to Phase 2B** (add delta sync)
   - Implement in 3-4 days total
   - Production-ready architecture
   - Changes sync in 30 seconds

3. **Go full Phase 2B + 2C** (add WebSocket)
   - Implement in 4-5 days total
   - Best-in-class UX
   - Changes sync in <1 second

**I can:**
- Generate Phase 2B detailed implementation guide (2 hours)
- Generate Phase 2B code skeleton (1 hour)
- Implement Phase 2B with you step-by-step (3-4 hours)
- Do the same for Phase 2C (4-5 hours)

What's your preference?

