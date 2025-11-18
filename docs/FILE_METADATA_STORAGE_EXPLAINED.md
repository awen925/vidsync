# File Metadata Storage When Creating a Project

## TL;DR

When you create a project, **file metadata is NOT immediately saved**. Here's the flow:

### Step 1: Project Creation (POST /projects)
When you create a project:
- ✅ Saves to `projects` table (project metadata)
- ❌ Does NOT save files yet

### Step 2: File Snapshot Creation (Manual / On-Demand)
You must explicitly trigger a file scan via:
- `PUT /api/projects/:projectId/refresh-snapshot` - Force refresh file list
- This updates `project_sync_state` table (snapshot version)
- **BUT** the actual files are stored in the `remote_files` table

### Step 3: Syncthing Integration (When Device Connects)
The actual file sync happens through:
- Syncthing P2P network
- Files are indexed in `remote_files` table as they arrive

---

## Detailed Breakdown

### 1. **POST /api/projects** (Create Project)
**File**: `cloud/src/api/projects/routes.ts` lines 11-37

**What gets saved**:
```typescript
{
  owner_id: UUID,
  name: string,
  description?: string,
  local_path?: string,    // Path on owner's device
  auto_sync: boolean,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Saved to**: `projects` table ✅

**File metadata saved**: ❌ NONE YET

---

### 2. **PUT /api/projects/:projectId/refresh-snapshot** (Refresh Files)
**File**: `cloud/src/api/projects/routes.ts` lines 750-805

**What happens**:
```typescript
// Updates snapshot version
{
  snapshot_version: number,
  last_snapshot_at: timestamp
}
```

**Saved to**: `project_sync_state` table ✅

**File metadata saved**: ❌ Still TODO (marked with comment "TODO: Scan project folder and update snapshots")

---

### 3. **File Metadata Storage** (Where Files Go)
**Table**: `remote_files`

**Created by**: Migration `007-create-remote-files-table.sql`

**Schema**:
```sql
CREATE TABLE remote_files (
  id UUID PRIMARY KEY,
  project_id UUID,                -- Link to project
  path TEXT,                      -- e.g., "folder/subfolder/file.txt"
  name TEXT,                      -- e.g., "file.txt"
  size BIGINT,                    -- File size in bytes
  is_directory BOOLEAN,           -- TRUE for folders, FALSE for files
  mime_type TEXT,                 -- e.g., "video/mp4"
  owner_id UUID,                  -- File owner
  file_hash TEXT,                 -- SHA256 hash
  created_at TIMESTAMP,           -- When indexed
  modified_at TIMESTAMP,          -- Last mod time from source
  deleted_at TIMESTAMP,           -- Soft delete timestamp
  
  UNIQUE(project_id, path)
);
```

**Example rows**:
```
id: 123-abc
project_id: proj-001
path: "Videos/family/birthday.mp4"
name: "birthday.mp4"
size: 524288000
is_directory: false
owner_id: user-001
file_hash: "sha256:abc123..."
modified_at: 2025-11-17 10:30:00
```

---

### 4. **Sync State Tracking** (When Devices Sync)
**Table**: `project_sync_state`

**Schema**:
```sql
CREATE TABLE project_sync_state (
  project_id UUID PRIMARY KEY,
  snapshot_version BIGINT,        -- Current snapshot version
  total_files INTEGER,            -- Number of files indexed
  total_size BIGINT,              -- Total bytes
  root_hash TEXT,                 -- Hash of all files
  last_snapshot_at TIMESTAMP,     -- When last refreshed
  updated_at TIMESTAMP
);
```

**Table**: `file_synced_devices`

**Tracks**: Which device has synced which file

```sql
CREATE TABLE file_synced_devices (
  file_id UUID REFERENCES remote_files,
  device_id UUID REFERENCES devices,
  synced_at TIMESTAMP,
  last_modified_seen TIMESTAMP,
  last_synced_seq BIGINT,
  
  PRIMARY KEY(file_id, device_id)
);
```

---

## Current Implementation Status

### ✅ What Works
1. Create project → saves to `projects` table
2. Get project files → reads from `remote_files` table (if indexed)
3. Track which devices synced files → `file_synced_devices` table
4. Soft delete files → marks with `deleted_at` timestamp

### ❌ What's TODO
1. **Initial file scan on project creation** - Currently commented as TODO
2. **Automatic file indexing** - Not implemented, needs Syncthing integration
3. **File metadata population from device** - Requires Syncthing API calls

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│ User Creates Project                                │
│ POST /projects {name, local_path, ...}             │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ Saved to `projects` table                          │
│ id, owner_id, name, local_path, created_at         │
└────────────────┬────────────────────────────────────┘
                 │
          ┌──────┴──────┐
          │ What next?  │
          └──────┬──────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
  [Wait]    [Syncthing]  [Refresh API]
    │       Starts sync   Force refresh
    │            │            │
    │            ▼            ▼
    │   Files indexed     Scans folder
    │   in remote_files   (TODO)
    │            │
    │            ▼
    │   ┌──────────────────┐
    │   │ remote_files tbl │
    │   │ path, size, hash │
    │   │ is_directory,... │
    │   └──────────────────┘
    │
    └────────────────┬──────────────────────┐
                     ▼                      ▼
         ┌────────────────────┐  ┌──────────────────┐
         │ file_synced_devices│  │project_sync_state│
         │ Which device has   │  │Snapshot version  │
         │ synced which file  │  │Total size/count  │
         └────────────────────┘  └──────────────────┘
```

---

## Why It's This Way

1. **Lazy Loading**: File scanning is expensive, so it's done on-demand
2. **P2P Architecture**: Syncthing handles actual file transfer, cloud just tracks metadata
3. **Phase 1 Implementation**: File indexing is still being built (marked TODO)
4. **Scalability**: Separate tables allow filtering/pagination without scanning all files

---

## To Index Files After Creating Project

**Option 1: Wait for Syncthing**
- Syncthing will discover files and index them automatically

**Option 2: Call Refresh Endpoint**
```bash
curl -X PUT http://localhost:5000/api/projects/proj-123/refresh-snapshot \
  -H "Authorization: Bearer $TOKEN"
```

This will:
- Update `project_sync_state` snapshot_version
- TODO: Actually scan and index files (currently not implemented)

---

## Summary Table

| Component | Table | What's Stored | When | Status |
|-----------|-------|---------------|------|--------|
| Project Info | `projects` | Name, description, local_path | On create | ✅ Works |
| File Metadata | `remote_files` | Path, size, hash, type | When synced | ✅ Works |
| Sync State | `project_sync_state` | Version, total_size, root_hash | On refresh | ✅ Works |
| Device Sync | `file_synced_devices` | Which device got which file | When synced | ✅ Works |
| File Scan | (Syncthing) | Actual file indexing | Async | ⏳ TODO |

---

## Code References

- **Project creation**: `cloud/src/api/projects/routes.ts` line 11
- **Refresh endpoint**: `cloud/src/api/projects/routes.ts` line 750
- **remote_files table**: `cloud/migrations/007-create-remote-files-table.sql`
- **project_sync_state**: `cloud/migrations/008-create-project-events-table.sql`
