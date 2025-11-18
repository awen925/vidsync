# File Metadata Storage - Visual Diagrams

## Main Question
**When create project, in which table file metadata saved?**

---

## Answer Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  CREATE PROJECT                                              │
│  ───────────────                                              │
│  Name: "My Videos"                                            │
│  Local Path: "/home/fograin/Videos"                          │
│                                                              │
│         ↓ API Call: POST /api/projects                       │
│         ↓                                                    │
│  ┌─────────────────────┐                                     │
│  │   projects table    │  ✅ INSERT HERE                    │
│  │─────────────────────│                                     │
│  │ id: proj-001        │                                     │
│  │ name: "My Videos"   │                                     │
│  │ local_path: "/..."  │                                     │
│  │ owner_id: user-123  │                                     │
│  └─────────────────────┘                                     │
│                                                              │
│         ❌ FILE METADATA NOT SAVED HERE YET!               │
│                                                              │
│  ───────────────────────────────────────────────────────────│
│                                                              │
│  SYNCTHING DISCOVERS FILES (automatic)                      │
│  ──────────────────────────────────────                     │
│  Scans: /home/fograin/Videos                                │
│  Finds: 250 files and folders                               │
│                                                              │
│         ↓ Syncthing adds to database                        │
│         ↓ (250 INSERT statements)                           │
│                                                              │
│  ┌──────────────────────────────────────┐                   │
│  │    remote_files table                │  ✅ FILES HERE! │
│  │──────────────────────────────────────│                   │
│  │ Row 1:                               │                   │
│  │  id: file-001                        │                   │
│  │  project_id: proj-001                │                   │
│  │  path: "Family/2024/Birthday.mp4"    │                   │
│  │  name: "Birthday.mp4"                │                   │
│  │  size: 2147483648 (2 GB)             │                   │
│  │  is_directory: false                 │                   │
│  │  file_hash: "sha256:abc123..."       │                   │
│  │  modified_at: 2025-11-16 14:30       │                   │
│  │                                      │                   │
│  │ Row 2: (Family folder)               │                   │
│  │  path: "Family"                      │                   │
│  │  is_directory: true                  │                   │
│  │                                      │                   │
│  │ Row 3: (2024 subfolder)              │                   │
│  │  path: "Family/2024"                 │                   │
│  │  is_directory: true                  │                   │
│  │                                      │                   │
│  │ ... (247 more rows)                  │                   │
│  │ Total: 250 rows                      │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Timeline Diagram

```
Timeline: What Gets Saved When
═════════════════════════════════════════════════════════════

Time     Event                    Table           Action
─────────────────────────────────────────────────────────────
T0       User creates project     projects ◄─ INSERT

         Name: "My Videos"
         Local Path: "/home/..."
         Project ID: proj-001
         ✅ DONE (immediately)


T0+5min  Syncthing discovers      remote_files ◄─ INSERT x250
         files (automatic)
         
         Files found:
         - Birthday.mp4            ✅ Row 1
         - Family/                 ✅ Row 2
         - Family/2024/            ✅ Row 3
         - Family/2024/Birthday.mp4 ✅ Row 4
         - ... (246 more)
         
         project_sync_state ◄─ UPDATE
         - snapshot_version = 1
         - total_files = 250
         - total_size = 107GB


T0+10min Device B joins           project_members ◄─ INSERT
         & starts syncing         
         
         Syncthing transfers      file_synced_devices ◄─ INSERT x250
         files to Device B
         
         Tracks:
         - Which file
         - Which device
         - When synced
         - ✅ 250 rows


T0+30min Device B has all files   file_synced_devices COMPLETE
                                  (all 250 files synced)
```

---

## Database Schema Relationship Diagram

```
                    ┌─────────────────────┐
                    │   auth.users        │
                    │ (Supabase built-in) │
                    │─────────────────────│
                    │ id (UUID)           │
                    │ email               │
                    │ ...                 │
                    └──────────┬──────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
         ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
         │  devices     │ │  projects    │ │   users      │
         │──────────────│ │──────────────│ │──────────────│
         │ id (PK)      │ │ id (PK)      │ │ (user_settings)
         │ user_id (FK) │ │ owner_id (FK)│ │ (deleted in)
         │ device_name  │ │ name         │ │ newer schema
         │ platform     │ │ local_path   │ │
         │ is_online    │ │ status       │ │
         └──────────────┘ │ created_at   │ │
                          └────────┬─────┘ │
                                   │       │
                    ┌──────────────┴───────┘
                    │
                    ▼
         ┌───────────────────────────┐
         │   project_members         │
         │ (for shared projects)     │
         │───────────────────────────│
         │ id (PK)                   │
         │ project_id (FK)           │
         │ user_id (FK)              │
         │ status: pending/accepted  │
         └───────────────────────────┘
                    │
                    │
         ┌──────────┴──────────────────────────┐
         │                                     │
         ▼                                     ▼
   ┌──────────────────────────┐    ┌───────────────────────┐
   │  project_sync_state      │    │   remote_files ⭐     │
   │  (Snapshot metadata)     │    │   (File Metadata)     │
   │──────────────────────────│    │───────────────────────│
   │ project_id (PK, FK)      │    │ id (PK)               │
   │ snapshot_version         │    │ project_id (FK)       │
   │ total_files              │    │ path                  │
   │ total_size               │    │ name                  │
   │ root_hash                │    │ size                  │
   │ last_snapshot_at         │    │ is_directory          │
   └──────────────────────────┘    │ mime_type             │
                                   │ owner_id (FK)         │
                                   │ file_hash             │
                                   │ created_at            │
                                   │ modified_at           │
                                   │ deleted_at (soft del) │
                                   └────────────┬──────────┘
                                                │
                                                │ FK: file_id
                                                │ FK: device_id
                                                ▼
                                  ┌────────────────────────────┐
                                  │  file_synced_devices       │
                                  │  (Device sync tracking)    │
                                  │────────────────────────────│
                                  │ file_id (FK, PK)           │
                                  │ device_id (FK, PK)         │
                                  │ synced_at                  │
                                  │ last_modified_seen         │
                                  │ last_synced_seq            │
                                  └────────────────────────────┘
```

---

## Data Population Flow

```
┌────────────────────────────────────────────────────────────┐
│  Step 1: User Creates Project                             │
└────────────────────────────────────────────────────────────┘
        │
        ▼
   Frontend: POST /api/projects
   Data: {name: "My Videos", local_path: "/home/..."}
        │
        ▼
   Backend: createProject handler
        │
        ├─ Validate input
        │
        ├─ Get user ID from auth token
        │
        └─ INSERT INTO projects
               ├─ owner_id = current_user
               ├─ name = "My Videos"
               ├─ local_path = "/home/fograin/Videos"
               ├─ created_at = NOW()
               └─ Returns: {project: {...}}
               
        ✅ Result: 1 row in projects table
        ❌ Result: 0 rows in remote_files yet


┌────────────────────────────────────────────────────────────┐
│  Step 2: Syncthing Discovers Files (Automatic)            │
└────────────────────────────────────────────────────────────┘
        │
        ▼
   Syncthing daemon (background process)
   Watches: /home/fograin/Videos
        │
        ├─ Scans directory structure
        │  ├─ Birthday.mp4
        │  ├─ Family/
        │  ├─ Family/2024/
        │  └─ ... (247 more files)
        │
        └─ For each file/folder:
               │
               ├─ Calculate file_hash (SHA256)
               │
               ├─ Get size, modified time
               │
               └─ INSERT INTO remote_files
                      ├─ project_id = proj-001
                      ├─ path = "Family/2024/Birthday.mp4"
                      ├─ name = "Birthday.mp4"
                      ├─ size = 2147483648
                      ├─ is_directory = false
                      ├─ file_hash = "sha256:..."
                      ├─ created_at = NOW()
                      └─ modified_at = 2025-11-16
                      
        ✅ Result: 250 rows in remote_files table
        
   After all files indexed:
   UPDATE project_sync_state
        ├─ snapshot_version = 1
        ├─ total_files = 250
        ├─ total_size = 107374182400
        └─ last_snapshot_at = NOW()


┌────────────────────────────────────────────────────────────┐
│  Step 3: Device B Syncs Files                             │
└────────────────────────────────────────────────────────────┘
        │
        ▼
   Device B Syncthing client
   Downloads files from Device A
        │
        ├─ For each file transferred:
        │     │
        │     └─ INSERT INTO file_synced_devices
        │            ├─ file_id = file-001
        │            ├─ device_id = device-b
        │            ├─ synced_at = NOW()
        │            └─ last_modified_seen = original_mtime
        │
        └─ (Repeat for all 250 files)
        
        ✅ Result: 250 rows in file_synced_devices
```

---

## Sample Data Diagram

```
PROJECTS TABLE
═════════════════════════════════════════════════════════════
id              │ owner_id  │ name        │ local_path
────────────────┼───────────┼─────────────┼──────────────────
proj-001        │ user-123  │ My Videos   │ /home/fograin...


PROJECT_SYNC_STATE TABLE
═════════════════════════════════════════════════════════════
project_id  │ snapshot_version │ total_files │ total_size
────────────┼──────────────────┼─────────────┼─────────────
proj-001    │ 1                │ 250         │ 107374182400


REMOTE_FILES TABLE (Sample Rows)
═════════════════════════════════════════════════════════════
id      │ project_id │ path                          │ size
────────┼────────────┼───────────────────────────────┼───────────
file-1  │ proj-001   │ Birthday.mp4                  │ 2147483648
file-2  │ proj-001   │ Family                        │ NULL (folder)
file-3  │ proj-001   │ Family/2024                   │ NULL (folder)
file-4  │ proj-001   │ Family/2024/Photo1.jpg        │ 5242880
file-5  │ proj-001   │ Family/2024/Photo2.jpg        │ 6291456
...
file-250│ proj-001   │ (various paths)               │ (sizes)


FILE_SYNCED_DEVICES TABLE (Sample Rows)
═════════════════════════════════════════════════════════════
file_id │ device_id  │ synced_at
────────┼────────────┼──────────────────────
file-1  │ device-b   │ 2025-11-17 11:15:00
file-2  │ device-b   │ 2025-11-17 11:16:00
file-3  │ device-b   │ 2025-11-17 11:17:00
file-4  │ device-b   │ 2025-11-17 11:18:00
...
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (Electron/React)                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  YourProjectsPage.tsx                                 │
│  ├─ State: projects[], selectedProject                │
│  ├─ useEffect: fetchProjects()                        │
│  └─ On project select: fetchProjectFiles(id)          │
│                                                         │
└────────────────┬────────────────────────────────────────┘
                 │
        HTTP GET /api/projects/:id/files
        (or /api/projects/list/invited)
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  BACKEND (Express/Node.js)                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  routes.ts: GET /api/projects/:id/files               │
│  ├─ Query remote_files WHERE project_id = ?           │
│  ├─ Filter by path pattern (for folders)              │
│  ├─ Paginate results (500 per page)                   │
│  └─ Return: {files: [...]}                            │
│                                                         │
└────────────────┬────────────────────────────────────────┘
                 │
        Database Query
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  DATABASE (Supabase/PostgreSQL)                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  remote_files                                           │
│  SELECT * FROM remote_files                           │
│  WHERE project_id = 'proj-001'                        │
│    AND deleted_at IS NULL                             │
│    AND path LIKE 'folder/%'                           │
│  LIMIT 500                                             │
│                                                         │
│  Returns: 500 rows max (file metadata)                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Summary

| Stage | Table | Rows | Status |
|-------|-------|------|--------|
| After creating project | `projects` | 1 | ✅ |
| After creating project | `remote_files` | 0 | ❌ |
| After Syncthing discovers | `remote_files` | 250 | ✅ |
| After Device B syncs | `file_synced_devices` | 250 | ✅ |
| Anytime (statistics) | `project_sync_state` | 1 | ✅ |

**Key Insight**: `remote_files` is populated AFTER project creation, when Syncthing discovers files.
