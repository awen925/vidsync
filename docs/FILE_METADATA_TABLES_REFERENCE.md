# File Metadata Storage - Table Structures Reference

## Quick Answer

When you create a project, **file metadata is NOT immediately saved**. 

Files are stored in the **`remote_files`** table when they are discovered/synced.

---

## All Related Tables

### 1. **projects** (Project Metadata)
Created when: User creates a project via POST /api/projects

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  owner_id UUID,                    -- Project owner
  name TEXT,                        -- Project name
  description TEXT,                 -- Description
  local_path TEXT,                  -- Path on owner's device (e.g., /home/user/Videos)
  syncthing_folder_id TEXT,         -- Syncthing folder ID
  auto_sync BOOLEAN DEFAULT true,
  sync_mode TEXT DEFAULT 'automatic',
  status TEXT DEFAULT 'idle',       -- 'idle', 'syncing', 'paused', 'error'
  last_synced TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Example**:
```
id: "550e8400-e29b-41d4-a716-446655440000"
owner_id: "user-123"
name: "My Videos"
description: "Family videos and memories"
local_path: "/home/fograin/Videos"
status: "idle"
created_at: 2025-11-17 10:00:00
```

---

### 2. **remote_files** (File Metadata) ⭐ FILE METADATA HERE
Created when: File is indexed/synced from owner's device

```sql
CREATE TABLE remote_files (
  id UUID PRIMARY KEY,
  project_id UUID,                  -- Which project this file belongs to
  path TEXT NOT NULL,               -- Full path e.g., "folder/subfolder/file.txt"
  name TEXT NOT NULL,               -- Just the filename e.g., "file.txt"
  size BIGINT,                      -- File size in bytes
  is_directory BOOLEAN DEFAULT false,  -- TRUE for folders, FALSE for files
  mime_type TEXT,                   -- e.g., "video/mp4", "text/plain"
  owner_id UUID,                    -- Who owns this file
  file_hash TEXT,                   -- SHA256 hash for deduplication
  created_at TIMESTAMP,             -- When added to DB
  modified_at TIMESTAMP,            -- Last modification time (from source device)
  deleted_by UUID,                  -- If soft-deleted, who deleted it
  deleted_at TIMESTAMP,             -- If soft-deleted, when
  
  UNIQUE(project_id, path),
  CHECK (deleted_by IS NULL OR deleted_at IS NOT NULL)
);
```

**Example**:
```
id: "660e8400-e29b-41d4-a716-446655440001"
project_id: "550e8400-e29b-41d4-a716-446655440000"
path: "Family/2024/Birthday.mp4"
name: "Birthday.mp4"
size: 2147483648                    -- 2 GB
is_directory: false
mime_type: "video/mp4"
owner_id: "user-123"
file_hash: "sha256:abc123def456..."
created_at: 2025-11-17 10:15:00
modified_at: 2025-11-16 14:30:00   -- Original modification time
deleted_at: NULL                    -- Not deleted
```

**Example Folder Row**:
```
id: "660e8400-e29b-41d4-a716-446655440002"
project_id: "550e8400-e29b-41d4-a716-446655440000"
path: "Family/2024"
name: "2024"
size: NULL                          -- Folders don't have size
is_directory: true                  -- This is a folder
mime_type: NULL
owner_id: "user-123"
file_hash: NULL
```

---

### 3. **project_sync_state** (Snapshot Version)
Created when: Project is created, updated via PUT /api/projects/:id/refresh-snapshot

```sql
CREATE TABLE project_sync_state (
  project_id UUID PRIMARY KEY,
  snapshot_version BIGINT,          -- Incremented each refresh
  total_files INTEGER,              -- Count of files
  total_size BIGINT,                -- Total bytes across all files
  root_hash TEXT,                   -- Hash of entire tree
  last_snapshot_at TIMESTAMP,       -- When last refreshed
  updated_at TIMESTAMP
);
```

**Example**:
```
project_id: "550e8400-e29b-41d4-a716-446655440000"
snapshot_version: 3                 -- Version 3 (refreshed 3 times)
total_files: 250
total_size: 107374182400            -- 100 GB
root_hash: "sha256:tree_hash_..."
last_snapshot_at: 2025-11-17 10:30:00
```

---

### 4. **file_synced_devices** (Which Device Synced What)
Created when: A device syncs a file from the project

```sql
CREATE TABLE file_synced_devices (
  file_id UUID REFERENCES remote_files(id),
  device_id UUID REFERENCES devices(id),
  synced_at TIMESTAMP,              -- When synced to this device
  last_modified_seen TIMESTAMP,     -- Last mod time when synced
  last_synced_seq BIGINT,           -- Event sequence number
  
  PRIMARY KEY(file_id, device_id)
);
```

**Example**:
```
file_id: "660e8400-e29b-41d4-a716-446655440001"
device_id: "770e8400-e29b-41d4-a716-446655440003"
synced_at: 2025-11-17 10:15:30
last_modified_seen: 2025-11-16 14:30:00
last_synced_seq: 42
```

Meaning: Device "770e8400..." has synced file "660e8400..." (Birthday.mp4)

---

## Complete Data Flow with Tables

```
STEP 1: Create Project
├─ POST /api/projects
│  └─ INSERT INTO projects (owner_id, name, local_path, ...)
│     Row: id=proj-001, owner_id=user-123, name="My Videos", ...
│
├─ Returns: { project: { id: "proj-001", ... } }
└─ Result: ✅ projects table, ❌ NO FILES YET

STEP 2: Syncthing Discovers Files (Automatic / On-Demand)
├─ Syncthing scans /home/fograin/Videos
├─ Finds: Birthday.mp4, Family/, Family/2024/, ...
│
├─ For each file, INSERT INTO remote_files:
│  ├─ Birthday.mp4
│  │  └─ (id, project_id, path, name, size, is_directory, ...)
│  │
│  ├─ Family/ (folder)
│  │  └─ (id, project_id, path="Family", is_directory=true, ...)
│  │
│  └─ Family/2024/Birthday.mp4
│     └─ (id, project_id, path, name, size, ...)
│
├─ UPDATE project_sync_state:
│  ├─ snapshot_version = 1
│  ├─ total_files = 250
│  └─ total_size = 107374182400
│
└─ Result: ✅ remote_files table populated, ✅ sync_state updated

STEP 3: User on Device B Joins Project & Syncs
├─ Device B connects to Syncthing
├─ Syncthing starts transferring files
│
├─ For each synced file, INSERT INTO file_synced_devices:
│  └─ (file_id, device_id, synced_at, ...)
│
└─ Result: ✅ file_synced_devices tracks sync progress
```

---

## Query Examples

### Get All Files in a Project
```sql
SELECT path, name, size, is_directory, modified_at
FROM remote_files
WHERE project_id = 'proj-001'
  AND deleted_at IS NULL
ORDER BY path;
```

**Returns**:
```
path                      | name         | size        | is_directory | modified_at
--------------------------|--------------|-------------|--------------|-------------------
Family                    | Family       | NULL        | true         | NULL
Family/2024               | 2024         | NULL        | true         | NULL
Family/2024/Birthday.mp4  | Birthday.mp4 | 2147483648  | false        | 2025-11-16 14:30
```

### Get Files in a Specific Folder
```sql
SELECT path, name, size, is_directory
FROM remote_files
WHERE project_id = 'proj-001'
  AND path LIKE 'Family/2024/%'
  AND deleted_at IS NULL
ORDER BY is_directory DESC, name;
```

### Get Sync Status (which devices have this file)
```sql
SELECT 
  rf.name,
  d.device_name,
  fsd.synced_at
FROM remote_files rf
JOIN file_synced_devices fsd ON rf.id = fsd.file_id
JOIN devices d ON fsd.device_id = d.id
WHERE rf.project_id = 'proj-001'
  AND rf.name = 'Birthday.mp4';
```

**Returns**:
```
name         | device_name     | synced_at
---|---|---
Birthday.mp4 | Laptop-Linux    | 2025-11-17 10:15:30
Birthday.mp4 | Desktop-Windows | 2025-11-17 12:45:00
```

### Get Project Stats
```sql
SELECT 
  p.name,
  ps.total_files,
  ps.total_size,
  ps.snapshot_version,
  ps.last_snapshot_at
FROM projects p
JOIN project_sync_state ps ON p.id = ps.project_id
WHERE p.owner_id = 'user-123';
```

---

## Storage Locations Summary

| Question | Answer | Table |
|----------|--------|-------|
| Where is project metadata stored? | `projects` table | `projects` |
| Where are file metadata stored? | `remote_files` table | `remote_files` |
| When are files indexed? | When synced from device | (automatic via Syncthing) |
| What happens on project create? | Only project row added | `projects` |
| What happens on file sync? | File row + sync tracking | `remote_files` + `file_synced_devices` |
| How do you check file count? | Query `project_sync_state` | `project_sync_state` |
| How do you track sync progress? | Check `file_synced_devices` | `file_synced_devices` |

---

## Key Takeaways

✅ **File metadata IS persisted** in `remote_files` table  
❌ **NOT on project creation** - happens when files are synced  
⏳ **Automatic discovery** via Syncthing  
📊 **Aggregates tracked** in `project_sync_state` (total files, total size)  
🔗 **Device tracking** in `file_synced_devices` (which device synced what)  

If you don't see files in `remote_files`, it means:
1. Syncthing hasn't discovered them yet
2. The device isn't connected
3. The `local_path` is wrong
4. Files are still being transferred
