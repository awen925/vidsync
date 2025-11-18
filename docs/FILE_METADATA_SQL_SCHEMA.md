# File Metadata Tables - SQL Schema Reference

## Quick Reference: Where Are Files Stored?

**Answer**: `remote_files` table

```sql
-- File metadata table
CREATE TABLE remote_files (
  id UUID PRIMARY KEY,
  project_id UUID,
  path TEXT,           -- Full path: "Family/2024/Birthday.mp4"
  name TEXT,           -- Just name: "Birthday.mp4"
  size BIGINT,         -- 2147483648 (2 GB)
  is_directory BOOLEAN,
  mime_type TEXT,      -- "video/mp4"
  owner_id UUID,
  file_hash TEXT,      -- "sha256:abc123..."
  created_at TIMESTAMP,
  modified_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

---

## Complete SQL Schema

### 1. projects Table
**Storage**: Project metadata (created when user creates project)

```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  local_path TEXT,                  -- /home/user/Videos
  syncthing_folder_id TEXT,
  auto_sync BOOLEAN DEFAULT true,
  sync_mode TEXT DEFAULT 'automatic', -- 'automatic', 'manual'
  status TEXT DEFAULT 'idle',       -- 'idle', 'syncing', 'paused', 'error'
  last_synced TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_projects_status ON projects(status);
```

**When filled**: When user creates a project  
**When cleared**: Never (unless project deleted)  
**Data volume**: One row per project

---

### 2. remote_files Table ⭐ MAIN FILE METADATA TABLE
**Storage**: Individual file metadata (created when Syncthing discovers files)

```sql
CREATE TABLE IF NOT EXISTS remote_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,               -- e.g., "Family/2024/Birthday.mp4"
  name TEXT NOT NULL,               -- e.g., "Birthday.mp4"
  size BIGINT,                      -- File size in bytes (NULL for folders)
  is_directory BOOLEAN DEFAULT false,
  mime_type TEXT,                   -- e.g., "video/mp4", "application/json"
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  file_hash TEXT,                   -- SHA256 hash for deduplication
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  modified_at TIMESTAMP WITH TIME ZONE,  -- Last mod time from source
  deleted_by UUID REFERENCES auth.users(id),  -- Who deleted it
  deleted_at TIMESTAMP WITH TIME ZONE,   -- When it was deleted
  
  -- This enforces one row per project per path
  UNIQUE(project_id, path),
  
  -- Deleted_by and deleted_at must be set together
  CHECK (deleted_by IS NULL OR deleted_at IS NOT NULL)
);

-- Indexes for common queries
CREATE INDEX idx_remote_files_project_path ON remote_files(project_id, path);
CREATE INDEX idx_remote_files_project_id ON remote_files(project_id);
CREATE INDEX idx_remote_files_owner_id ON remote_files(owner_id);
CREATE INDEX idx_remote_files_deleted ON remote_files(project_id, deleted_at) 
  WHERE deleted_by IS NOT NULL;
```

**When filled**: When Syncthing discovers/syncs files from owner's device  
**Lifecycle**:
- File added → new row with `created_at` = now
- File modified → `modified_at` = now (from source), row updated
- File deleted → `deleted_at` = now, `deleted_by` = user_id (soft delete)

**Query to see non-deleted files**:
```sql
SELECT * FROM remote_files 
WHERE project_id = 'proj-123' AND deleted_at IS NULL;
```

---

### 3. project_sync_state Table
**Storage**: Aggregated snapshot metadata (one row per project)

```sql
-- (Defined in migrations, exact schema varies by migration version)
-- Purpose: Store snapshot version and aggregated stats

-- Common structure:
CREATE TABLE IF NOT EXISTS project_sync_state (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_version BIGINT,          -- Incremented each refresh
  total_files INTEGER,              -- Count of files
  total_size BIGINT,                -- Total bytes
  root_hash TEXT,                   -- Hash of entire tree
  last_snapshot_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**When filled**: When project created or refresh endpoint called  
**When updated**: On `PUT /api/projects/:id/refresh-snapshot`  
**Data volume**: One row per project

---

### 4. file_synced_devices Table
**Storage**: Tracks which device has synced which file

```sql
CREATE TABLE IF NOT EXISTS file_synced_devices (
  file_id UUID NOT NULL REFERENCES remote_files(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  synced_at TIMESTAMP WITH TIME ZONE,
  last_modified_seen TIMESTAMP WITH TIME ZONE,  -- When file was last modified (at sync time)
  last_synced_seq BIGINT DEFAULT 0,  -- Event sequence number
  
  PRIMARY KEY(file_id, device_id)
);

CREATE INDEX idx_file_synced_devices_file_id ON file_synced_devices(file_id);
CREATE INDEX idx_file_synced_devices_device_id ON file_synced_devices(device_id);
```

**When filled**: When Syncthing syncs a file to a device  
**Data volume**: One row per (file, device) pair that has synced  
**Example**:
- File A synced to Device 1: 1 row
- File A synced to Device 1 & 2: 2 rows
- File A & B synced to Device 1: 2 rows

---

## Visual Schema Relationships

```
┌─────────────────────────┐
│      projects           │
│─────────────────────────│
│ id (PK)                 │
│ owner_id (FK→auth.users)│
│ name                    │
│ description             │
│ local_path              │
│ created_at              │
└──────────┬──────────────┘
           │
           │ FK: project_id
           │
           ▼
┌─────────────────────────┐
│    remote_files         │◄─────┐
│─────────────────────────│      │ FK: file_id
│ id (PK)                 │      │
│ project_id (FK)         │      │
│ path                    │      │
│ name                    │      │
│ size                    │      │
│ is_directory            │      │
│ file_hash               │      │
│ created_at              │      │
│ modified_at             │      │
│ deleted_at (soft delete)│      │
└──────────┬──────────────┘      │
           │                     │
           │                     │
           │              ┌──────┴────────────────┐
           │              │ file_synced_devices   │
           │              │────────────────────── │
           │              │ file_id (FK,PK)     │─┘
           │              │ device_id (FK,PK)   │
           │              │ synced_at            │
           │              │ last_modified_seen   │
           │              │ last_synced_seq      │
           │              └──────────────────────┘
           │                     ▲
           │                     │ FK: device_id
           │                     │
           │              ┌──────┴──────────────┐
           │              │    devices          │
           │              │────────────────────│
           │              │ id (PK)            │
           │              │ user_id            │
           │              │ device_id          │
           │              │ device_name        │
           │              │ platform           │
           │              │ is_online          │
           │              └────────────────────┘
           │
           │ 1:1
           ▼
┌─────────────────────────────┐
│  project_sync_state         │
│─────────────────────────────│
│ project_id (PK, FK)         │
│ snapshot_version            │
│ total_files                 │
│ total_size                  │
│ root_hash                   │
│ last_snapshot_at            │
└─────────────────────────────┘
```

---

## Data Flow Timeline

```
Time  Event                          Table Changes
────────────────────────────────────────────────────────────────
T0    User creates "My Videos"       projects ← INSERT
      project via UI                 (id, owner, name, ...)

T1    (nothing automatic happens)    (no change)

T2    User sets local_path via IPC   (no change, already in projects)

T3    Syncthing connects & scans     remote_files ← INSERT (per file)
      folder at /home/user/Videos    
      
      Finds 250 files:               remote_files 250 rows added
      - Birthday.mp4                 (path, name, size, hash, ...)
      - Family/ (folder)
      - Family/2024/ (folder)
      - Family/2024/Birthday.mp4
      - ... 246 more files

      Updates snapshot stats:        project_sync_state ← UPDATE
                                    (snapshot_version=1, total_files=250, ...)

T4    Device B joins & starts sync  file_synced_devices ← INSERT (per file)
                                    (file_id, device_id, synced_at, ...)
                                    
                                    250 rows added (one per file)

T5    File is modified on          remote_files ← UPDATE
      Device A                      (modified_at = now)

T6    Syncthing sends update        file_synced_devices ← UPDATE
      to Device B                   (synced_at = now)

T7    User calls refresh endpoint   project_sync_state ← UPDATE
      PUT /projects/:id/            (snapshot_version=2, ...)
      refresh-snapshot
```

---

## Querying Examples

### Show all files in a project
```sql
SELECT id, path, name, size, is_directory, modified_at
FROM remote_files
WHERE project_id = 'proj-001'
  AND deleted_at IS NULL
ORDER BY path;
```

### Show sync status for a file
```sql
SELECT d.device_name, fsd.synced_at
FROM file_synced_devices fsd
JOIN devices d ON fsd.device_id = d.id
WHERE fsd.file_id = 'file-001';
```

### Show project statistics
```sql
SELECT 
  p.name,
  ps.total_files,
  ps.total_size,
  COUNT(DISTINCT fsd.device_id) as synced_devices
FROM projects p
LEFT JOIN project_sync_state ps ON p.id = ps.project_id
LEFT JOIN remote_files rf ON p.id = rf.project_id
LEFT JOIN file_synced_devices fsd ON rf.id = fsd.file_id
WHERE p.owner_id = 'user-123'
GROUP BY p.id, p.name, ps.total_files, ps.total_size;
```

---

## Column Details

### remote_files Columns Explained

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| id | UUID | Unique file ID | 660e8400-e29b-41d4-a716-446655440001 |
| project_id | UUID | Which project | 550e8400-e29b-41d4-a716-446655440000 |
| path | TEXT | Full path (for queries) | "Family/2024/Birthday.mp4" |
| name | TEXT | Display name | "Birthday.mp4" |
| size | BIGINT | Bytes (NULL for folders) | 2147483648 |
| is_directory | BOOLEAN | Folder? | false |
| mime_type | TEXT | Content type | "video/mp4" |
| owner_id | UUID | File owner | user-123 |
| file_hash | TEXT | SHA256 for dedup | "sha256:abc123..." |
| created_at | TIMESTAMP | When indexed | 2025-11-17 10:15:00 |
| modified_at | TIMESTAMP | Source mod time | 2025-11-16 14:30:00 |
| deleted_by | UUID | Who deleted it | user-123 (if deleted) |
| deleted_at | TIMESTAMP | When deleted | 2025-11-17 11:00:00 (if deleted) |

---

## Key Constraints

### Unique Constraint
```sql
UNIQUE(project_id, path)
```
- Only ONE row per project per path
- Prevents duplicate entries for same file

### Check Constraint
```sql
CHECK (deleted_by IS NULL OR deleted_at IS NOT NULL)
```
- Both deleted_by AND deleted_at must be set together
- Can't mark deleted without both fields
- Ensures data integrity

### NOT NULL Fields
- `project_id`: Must belong to a project
- `path`: Must have a path (how to find the file)
- `name`: Must have a name (for display)
- `owner_id`: Must know who owns it

---

## Summary

| Aspect | Answer |
|--------|--------|
| **Where are files stored?** | `remote_files` table |
| **When added?** | When Syncthing discovers them |
| **How many rows?** | One per file per project |
| **Do folders get rows?** | Yes (`is_directory=true`) |
| **Are deleted files kept?** | Yes (soft delete with `deleted_at`) |
| **How to find files in folder?** | `path LIKE 'Family/2024/%'` |
| **How to track devices?** | `file_synced_devices` table |
| **How to get count?** | `project_sync_state.total_files` |
