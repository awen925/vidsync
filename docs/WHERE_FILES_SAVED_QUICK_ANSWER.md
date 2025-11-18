# Where Are Files Saved? - Quick Answer

## TL;DR

### ❌ NOT Saved on Project Creation
```javascript
POST /api/projects {name, description, local_path}
// ❌ Does NOT save files yet
// ✅ Only saves project metadata to `projects` table
```

### ✅ Saved When Synced (Automatically)
```
Syncthing discovers files
    ↓
INSERT INTO remote_files (path, name, size, hash, ...)
    ↓
File metadata now visible in UI
```

### 📍 File Metadata Location
**Table**: `remote_files`

```sql
remote_files (
  id,                  -- Unique file ID
  project_id,          -- Which project
  path,                -- "Family/2024/Birthday.mp4"
  name,                -- "Birthday.mp4"
  size,                -- 2147483648 bytes
  is_directory,        -- false (true for folders)
  mime_type,           -- "video/mp4"
  file_hash,           -- SHA256 hash
  created_at,          -- When indexed
  modified_at,         -- Original modification time
  deleted_at           -- If soft-deleted
)
```

---

## Where Each Thing Is Stored

| What | Where | When | Status |
|------|-------|------|--------|
| Project name/description | `projects` | On create | ✅ Immediate |
| Project local_path | `projects` | On create | ✅ Immediate |
| **Individual files metadata** | **`remote_files`** | **When synced** | ⏳ Auto (Syncthing) |
| File count/size totals | `project_sync_state` | On refresh | ✅ Available |
| Which device has which file | `file_synced_devices` | When synced | ✅ Tracked |

---

## What's in Each Table

### `projects` (Created immediately)
```
Row: {
  id: "550e8400...",
  owner_id: "user-123",
  name: "My Videos",
  local_path: "/home/fograin/Videos",
  created_at: "2025-11-17 10:00:00"
}
```

### `remote_files` (Created when files sync)
```
Rows: [
  {
    id: "660e8400...",
    project_id: "550e8400...",
    path: "Family/2024/Birthday.mp4",
    name: "Birthday.mp4",
    size: 2147483648,
    is_directory: false,
    created_at: "2025-11-17 10:15:00"
  },
  {
    id: "660e8400...",
    project_id: "550e8400...",
    path: "Family",
    name: "Family",
    size: null,
    is_directory: true,
    created_at: "2025-11-17 10:15:01"
  },
  ... (one row per file/folder)
]
```

### `project_sync_state` (Created on project create)
```
Row: {
  project_id: "550e8400...",
  snapshot_version: 1,
  total_files: 250,
  total_size: 107374182400,
  last_snapshot_at: "2025-11-17 10:30:00"
}
```

---

## Query Cheat Sheet

### See all files in a project
```sql
SELECT path, name, size, is_directory
FROM remote_files
WHERE project_id = 'proj-123' AND deleted_at IS NULL
ORDER BY path;
```

### See how many files
```sql
SELECT total_files, total_size
FROM project_sync_state
WHERE project_id = 'proj-123';
```

### See which devices have synced a file
```sql
SELECT d.device_name, fsd.synced_at
FROM file_synced_devices fsd
JOIN devices d ON fsd.device_id = d.id
WHERE fsd.file_id = 'file-123';
```

### See all your projects and file counts
```sql
SELECT p.name, ps.total_files, ps.total_size
FROM projects p
LEFT JOIN project_sync_state ps ON p.id = ps.project_id
WHERE p.owner_id = 'user-123';
```

---

## Why Files Aren't Saved Immediately

1. **Performance**: Scanning folders is slow, especially large ones
2. **P2P Architecture**: Syncthing does the actual file transfer
3. **Scalability**: Database only tracks, doesn't manage files directly
4. **Lazy Loading**: Files discovered on-demand when syncing starts

---

## How It Works in Practice

```
1. You create project "My Videos"
   → Saved to `projects` table
   → Set local_path = "/home/fograin/Videos"
   ✅ DONE, files NOT yet saved

2. Syncthing starts (automatic when device connects)
   → Scans "/home/fograin/Videos"
   → Finds 250 files and folders
   ✅ Each file → new row in `remote_files`

3. Another user joins the project
   → Their device starts syncing
   → Files transferred via Syncthing
   ✅ Each file transfer tracked in `file_synced_devices`

4. You check project details
   → Query shows 250 files from `remote_files`
   → Total size from `project_sync_state`
   ✅ Complete metadata available
```

---

## If You Don't See Files...

**Problem**: `remote_files` is empty

**Possible Causes**:
1. ❌ Syncthing not running
2. ❌ Device not connected
3. ❌ `local_path` is wrong or inaccessible
4. ❌ Files are still being indexed (large folder)
5. ❌ Firewall blocking Syncthing

**Solution**:
- Check Syncthing status
- Verify `local_path` is correct
- Wait for indexing to complete
- Check device connectivity

---

## Files Mentioned

📄 **FILE_METADATA_STORAGE_EXPLAINED.md** - Detailed explanation  
📄 **FILE_METADATA_TABLES_REFERENCE.md** - All tables explained  
📄 **FILE_METADATA_SQL_SCHEMA.md** - SQL schema with examples  
📄 **THIS FILE** - Quick reference

---

## Key Tables Summary

```
projects
├─ Stores: Project metadata (name, description, local_path)
├─ Created: Immediately on POST /api/projects
└─ Rows: One per project

remote_files ⭐ FILE METADATA HERE
├─ Stores: Individual file metadata (path, name, size, hash)
├─ Created: When Syncthing discovers files
├─ Rows: One per file per project (250 files = 250 rows)
└─ Query: See all files with SELECT * WHERE project_id = ?

project_sync_state
├─ Stores: Aggregated stats (total_files, total_size, version)
├─ Created: On project create, updated on refresh
└─ Rows: One per project

file_synced_devices
├─ Stores: Which device synced which file
├─ Created: When Syncthing syncs a file to a device
└─ Rows: One per (file, device) pair
```
