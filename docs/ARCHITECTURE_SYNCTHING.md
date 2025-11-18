# Phase 1: Syncthing-First Architecture

## 🎯 Core Idea

**Stop storing file events. Start using Syncthing for P2P sync.**

Instead of trying to track every file change in the database:
- Use **Syncthing** for actual P2P file transfer + delta sync
- Store only **metadata snapshots** in DB for UX (file listing)
- Result: **Orders of magnitude lighter** database load

---

## 📊 Database Redesign

### What We're Removing ❌
- `file_transfers` table (Syncthing handles transfers)
- `transfer_events` table (Syncthing handles progress)
- `optimized_file_index` (no need to track every file)
- Complex pagination/delta logic (Syncthing handles delta)

### What We're Adding ✅
- `project_file_snapshots` - Directory structure + metadata
- `project_sync_state` - Snapshot version tracking
- `project_sync_checkpoints` - (Optional) Per-device sync state

**Total DB size:** ~10 MB per project (vs previous complex design)

---

## 🏗️ The Tables

### `project_file_snapshots`
**Purpose:** UX layer - show file list to invited members

```sql
file_path          TEXT           -- "documents/report.pdf"
is_directory       BOOLEAN        -- true for folders
file_hash          VARCHAR(64)    -- SHA-256 (for verification)
size               BIGINT         -- File size in bytes
modified_at        TIMESTAMP      -- Last modified time
```

**Key insights:**
- One row per file in the project
- Updated ~1-5 minutes (batch update) or on manual refresh
- No tracking every single change
- Invited members use this to browse files

### `project_sync_state`
**Purpose:** Track snapshot metadata

```sql
snapshot_version   INTEGER        -- Version counter
last_snapshot_at   TIMESTAMP      -- When updated
total_files        INTEGER        -- File count
total_size         BIGINT         -- Total bytes
root_hash          VARCHAR(64)    -- Tree hash (quick comparison)
```

**Key insights:**
- One row per project
- Detects changes quickly (root_hash comparison)
- Enables delta sync (if client has version 5, send only changes since then)

### `project_sync_checkpoints` (Optional)
**Purpose:** Track per-device sync state

```sql
device_id          UUID           -- Syncthing device ID
user_id            UUID           -- Which user on which device
last_sync_at       TIMESTAMP      -- When device last synced
synced_snapshot_version INTEGER  -- Device has this version
```

**Key insights:**
- Only needed if you want delta sync ("what changed since last time you synced?")
- Enables mobile/offline scenarios
- Can be optional for Phase 1

---

## 🔄 Flow: Invited User Browsing Files

### Step 1: User Joins Project
```
User clicks "Accept Invite"
  ↓
Backend updates: INSERT INTO project_members (project_id, user_id, status='accepted')
  ↓
Done ✓
```

### Step 2: Generate File Snapshot
```
Owner's device (Syncthing)
  ↓
Syncthing monitors project folder
  ↓
Backend periodically (or on request):
  - Walk project folder on owner's device
  - Generate snapshot: file_path, size, hash, modified_at
  - INSERT/UPDATE project_file_snapshots
  - UPDATE project_sync_state (increment version, update root_hash)
  ↓
Done ✓
```

### Step 3: Invited User Sees File List
```
Member opens "Your Projects" → clicks project
  ↓
GET /projects/:projectId/files?limit=500&offset=0
  ↓
Backend: SELECT * FROM project_file_snapshots 
         WHERE project_id = ? 
         LIMIT 500
  ↓
Returns: [file_path, size, is_directory, modified_at, ...]
  ↓
Frontend renders paginated table
  ↓
Done ✓
```

### Step 4: Member Wants File
```
Member clicks "Sync This File"
  ↓
Frontend calls Syncthing API:
  POST /rest/db/ignores?device={device_id}
  (Remove from ignore list, if needed)
  
  OR just trigger sync via Syncthing UI
  ↓
Syncthing P2P sync between member device and owner device
  ↓
Progress bar: Show Syncthing progress via API
  ↓
Done ✓
```

---

## ⚡ Performance & Scale

### Database Load
| Metric | Value | Notes |
|--------|-------|-------|
| Rows per project | ~10k | Only metadata, not events |
| Size per project | ~10 MB | file_path + metadata |
| Total for scale | 10k users × 5 projects = 50k projects → ~500 GB DB | Still reasonable |
| Write load | Low | Only 1-5 minute batch updates |
| Query speed | <100ms | Simple SELECTs with indexes |

### Syncthing Load
| Metric | Benefit |
|--------|---------|
| Actual files | P2P transfer → no cloud bandwidth cost |
| Delta sync | Syncthing only sends changed bytes |
| Resume | Built-in (Syncthing handles it) |
| Speed limit | Syncthing API can set per-folder limit |
| Pause | Syncthing API can pause folder |

### Cost Impact
- **DB:** 500 GB acceptable (vs previous millions of events)
- **Cloud bandwidth:** ~$0 (P2P via Syncthing + Nebula)
- **Cloud CPU:** Minimal (no file transfer processing)
- **Annual cost:** ~$50-100/year for DB (vs previous $300k+)

---

## 🎯 API Endpoints (Phase 1)

### GET `/projects/:projectId/files`
**Purpose:** Paginated file list for invited members

```http
GET /projects/abc-123/files?limit=500&offset=0&sort=name
```

**Response:**
```json
{
  "files": [
    {
      "file_path": "documents/report.pdf",
      "is_directory": false,
      "size": 1048576,
      "file_hash": "abc123...",
      "modified_at": "2024-11-17T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 10543,
    "limit": 500,
    "offset": 0,
    "hasMore": true
  }
}
```

**Implementation:**
```sql
SELECT file_path, is_directory, size, file_hash, modified_at
FROM project_file_snapshots
WHERE project_id = $1
ORDER BY file_path
LIMIT 500 OFFSET 0
```

### GET `/projects/:projectId/snapshot-metadata`
**Purpose:** Get current snapshot state (for delta sync detection)

```http
GET /projects/abc-123/snapshot-metadata
```

**Response:**
```json
{
  "snapshot_version": 42,
  "last_snapshot_at": "2024-11-17T11:05:30Z",
  "total_files": 10543,
  "total_size": 107374182400,
  "root_hash": "abc123..."
}
```

### PUT `/projects/:projectId/refresh-snapshot`
**Purpose:** Force update of file snapshot from owner's device

```http
PUT /projects/abc-123/refresh-snapshot
```

**Implementation:**
```
1. Only owner can do this
2. Trigger backend to re-scan project folder
3. Update project_file_snapshots
4. Return updated snapshot_version
```

### POST `/projects/:projectId/sync-start`
**Purpose:** Trigger Syncthing to start syncing folder to member's device

```http
POST /projects/abc-123/sync-start
```

**Implementation:**
```
1. Verify member can access project
2. Call Syncthing API to add project folder to member's device
3. Return Syncthing device ID + sync status
```

---

## 🔧 Implementation Phases

### Phase 1a: Database (Already Done)
- ✅ Migration: `20251117_phase1_syncthing_simplified.sql`
- Tables: `project_file_snapshots`, `project_sync_state`, `project_sync_checkpoints`
- Time: Execute migration (2-3 seconds)

### Phase 1b: Backend API (2 hours)
- Implement 4 endpoints above
- Add file snapshot generation logic
- Integrate with Syncthing API

### Phase 1c: Frontend (1-2 hours)
- Add paginated file list component
- Add "Sync This Project" button
- Show Syncthing progress via polling

### Phase 1d: Testing (1 hour)
- Verify pagination works at 10k files
- Verify Syncthing sync triggers
- Verify progress tracking

**Total Phase 1: 4-5 hours**

---

## 🚀 Why This Works

### 1. Syncthing Handles Everything
- ✅ P2P file transfer (no cloud bandwidth)
- ✅ Delta sync (only changed bytes)
- ✅ Pause/Resume (built-in)
- ✅ Speed limiting (built-in)
- ✅ Versioning (built-in)

### 2. Database Is Minimal
- ✅ Only metadata (10 MB per project)
- ✅ Simple queries (no complex joins)
- ✅ Low write load (1-5 minute updates)
- ✅ Scales to 10k projects easily

### 3. UX Still Works
- ✅ Invited members see file list immediately
- ✅ Can browse before downloading
- ✅ Can initiate sync with one click
- ✅ Progress bar shows real-time updates

### 4. Cost Is Minimal
- ✅ DB: 500 GB → $50-100/year
- ✅ Bandwidth: $0 (P2P)
- ✅ CPU: $0 (Syncthing handles it)
- ✅ Annual cost: ~$50-100

---

## ✅ Success Criteria

Phase 1 is complete when:

✅ Can list 10k files in <500ms
✅ Pagination works smoothly (500 files per page)
✅ Can see different files in each project
✅ Can trigger Syncthing sync from UI
✅ Syncthing progress shows in real-time
✅ Owner can manually refresh snapshot
✅ Database CPU stays <5%
✅ Database size reasonable (<500 GB)

---

## 🔮 Future Phases (Not Phase 1)

- **Phase 2:** Selective sync (choose which folders)
- **Phase 3:** Bandwidth limits per project
- **Phase 4:** Advanced scheduling (when to sync)
- **Phase 5:** Mobile offline queue

But Phase 1 is complete without these!

---

## 📊 Comparison: Before vs After

| Aspect | Before (Naive) | After (Syncthing) |
|--------|---|---|
| Database load | Millions of file events | Just metadata snapshots |
| File transfer | Cloud bandwidth ($$$) | P2P via Syncthing ($0) |
| Pause/Resume | Custom implementation | Syncthing built-in |
| Delta sync | Complex logic | Syncthing built-in |
| Versioning | Not supported | Syncthing built-in |
| Annual cost | $273,600+ | ~$50-100 |
| Development time | 13-18 hours | 4-5 hours |
| Scale | 1k files max | 1M+ files |

---

## 🎯 Bottom Line

**Use Syncthing for what it's good at (P2P sync).**
**Use database for what it's good at (metadata + UX).**

Result: Simple, scalable, cost-effective.
