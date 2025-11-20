# Cloud API Endpoint Analysis
## Syncthing & Filesystem Operations Classification

**Date:** November 19, 2025  
**File:** `cloud/src/api/projects/routes.ts`  
**Total Endpoints Analyzed:** 32

---

## Classification Summary

| Category | Count | Endpoints |
|----------|-------|-----------|
| **DB_ONLY** | 16 | Endpoints with only Supabase operations |
| **NEEDS_SPLIT** | 16 | Endpoints with Syncthing/filesystem operations |

---

## Detailed Endpoint Analysis

### 1. POST /projects (Line 38)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Project creation, duplicate check
- Only database operations
- NOTE: Comment indicates Syncthing folder creation is handled by Electron client via IPC

---

### 2. GET /projects (Line 109)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Fetch owned projects, memberships, member projects
- Pure DB queries, no local operations

---

### 3. GET /projects/list/invited (Line 164)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Fetch memberships, project details
- FileMetadataService: Load snapshot for file_count/total_size (read-only from storage)
- No local filesystem or Syncthing API calls

---

### 4. GET /projects/list/owned (Line 255)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Fetch owned projects
- Pure DB query only

---

### 5. GET /projects/:projectId (Line 278)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Fetch project, members, devices
- Pure DB queries, access control only

---

### 6. PUT /projects/:projectId (Line 330)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Update project metadata (name, description, local_path)
- No Syncthing or filesystem operations

---

### 7. DELETE /projects/:projectId (Line 378)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase Storage: Delete snapshots from bucket (storage operations only)
- Supabase DB: Delete project and related records (members, devices, sync_events)
- NOTE: Comment indicates Syncthing folder deletion handled by Electron client via IPC

---

### 8. POST /projects/:projectId/invite (Line 466)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Create membership entry (pending invite)
- Pure DB operation

---

### 9. POST /projects/:projectId/invite-token (Line 501)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Generate/store invite token in project_invites table
- Pure DB operations with token generation

---

### 10. POST /projects/:projectId/devices (Line 826)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Assign device to project in project_devices table
- Pure DB operation

---

### 11. DELETE /projects/:projectId/devices/:deviceId (Line 871)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Remove device-project association
- Pure DB operation

---

### 12. GET /projects/:projectId/sync-events (Line 909)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Query sync_events table with filters
- Pure DB query

---

### 13. GET /projects/:projectId/files-list (Line 947)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- FileMetadataService: Load snapshot from Supabase Storage
- **SyncthingService: `getFolderFiles(projectId, 10)` - Syncthing REST API call**
- **SyncthingService config access via `getSyncthingConfig()`**
- Fallback: Generate snapshot if none exists by querying Syncthing

**What needs to move to Go service:**
- `getFolderFiles()` call to Syncthing API
- File listing from remote Syncthing folder

---

### 14. GET /projects/:projectId/snapshot-metadata (Line 1106)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Query project_sync_state table for snapshot metadata
- Pure DB query

---

### 15. GET /projects/:projectId/file-tree (Line 1160)
**Category:** `DB_ONLY`  
**Operations:**
- FileMetadataService: Load snapshot from Supabase Storage (read-only)
- Calculate stats from loaded snapshot
- No Syncthing API calls

---

### 16. GET /projects/:projectId/file-sync-status (Line 1235)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- Cache check (local)
- **Syncthing config via `getSyncthingConfig()`**
- **SyncthingService: `getFolderStatus(projectId)` - Syncthing REST API call**
- Status calculation and caching

**What needs to move to Go service:**
- `getFolderStatus()` call to Syncthing API
- Real-time sync status queries

---

### 17. PUT /projects/:projectId/refresh-snapshot (Line 1340)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Update project_sync_state version/timestamp
- TODO comment indicates future folder scanning (not yet implemented)
- Currently DB-only

---

### 18. POST /projects/:projectId/sync-start (Line 1393)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- Supabase: Verify project ownership
- **SyncthingService: `testConnection()`**
- **SyncthingService: `addDeviceToFolder(projectId, deviceId)`**
- **SyncthingService: `scanFolder(projectId)`**
- **SyncthingService: `waitForFolderKnown(projectId, 30000)`**
- **SyncthingService: `waitForFolderScanned(projectId, 120000)`**
- **SyncthingService: `getFolderStatus(projectId)`**

**What needs to move to Go service:**
- All Syncthing operation orchestration
- Device addition to folder
- Folder scanning and indexing
- Sync lifecycle management (wait operations)

---

### 19. POST /projects/:projectId/pause-sync (Line 1513)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- Supabase: Verify ownership/membership
- **SyncthingService: `pauseFolder(syncthing_folder_id)` - For owner**
- **SyncthingService: `removeDeviceFromFolder()` - For members**

**What needs to move to Go service:**
- Folder pause/resume operations
- Device removal from folder

---

### 20. POST /projects/:projectId/resume-sync (Line 1595)
**Category:** `DB_ONLY` (currently)  
**Operations:**
- Supabase: Verify ownership/membership
- NOTE: Comment indicates Electron client handles IPC for actual Syncthing operations
- Currently returns DB-only status message

**Migration Note:** Could be DB_ONLY or NEEDS_SPLIT depending on whether Go service should handle it

---

### 21. POST /projects/:projectId/sync-stop (Line 1652)
**Category:** `DB_ONLY` (currently)  
**Operations:**
- Supabase: Verify ownership
- NOTE: Comment indicates Electron client handles device removal via IPC
- Currently returns message indicating client should handle it

**Migration Note:** Could be DB_ONLY or NEEDS_SPLIT depending on whether Go service should handle it

---

### 22. GET /projects/:projectId/invited-users (Line 1696)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Query project_invites, project_members tables
- Pure DB queries

---

### 23. GET /projects/:projectId/files (Line 1789)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- Supabase: Verify ownership (owner-only endpoint)
- **fs module: `fs.existsSync()`**
- **fs module: `fs.readdirSync()` with path enumeration**
- **fs module: `fs.statSync()` for file stats**
- **path module: `path.join()` for directory traversal**
- **Local filesystem directory scanning and tree building**

**What needs to move to Go service:**
- Complete filesystem directory scanning
- Local file tree traversal and stats
- (OR: Keep as client-side operation for security)

---

### 24. GET /projects/:projectId/files-paginated (Line 1877)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Verify access (owner or member)
- Path filtering and pagination parameters
- NOTE: Comment indicates remote_files table deprecated
- Returns mock data - legacy endpoint not actively used

---

### 25. POST /projects/:projectId/files-sync (Line 1940)
**Category:** `DB_ONLY` (currently)  
**Operations:**
- Supabase: Verify ownership
- Returns success message
- NOTE: Comment indicates this would scan Syncthing folder in production

**Migration Note:** Currently DB-only but intended for NEEDS_SPLIT

---

### 26. POST /projects/:projectId/files/update (Line 1980)
**Category:** `DB_ONLY` (with optional WebSocket)  
**Operations:**
- Supabase: Verify ownership
- Supabase: Insert into project_events table (immutable delta log)
- WebSocketService: Broadcast project event (async, optional)
- NOTE: Comment indicates remote_files table deprecated, operations now via Syncthing

**Migration Note:** Currently DB-only, event logging only

---

### 27. GET /projects/:projectId/events (Line 2080)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Verify access (owner or member)
- Supabase: Query project_events table for deltas since sequence
- Pure DB queries

---

### 28. POST /projects/:projectId/generate-snapshot (Line 2180)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- Supabase: Verify access (owner or member)
- FileMetadataService: `saveSnapshot()` - saves to Supabase Storage
- FileMetadataService: `cleanupOldSnapshots()`
- NOTE: Comment indicates would scan actual Syncthing folder in production
- Currently uses mock files

**What needs to move to Go service:**
- Real folder scanning (when implemented)
- Snapshot generation from actual files

---

### 29. GET /projects/:projectId/sync-status (Line 2273)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- Supabase: Verify access
- **SyncthingService: `getFolderStatus(syncthing_folder_id)` - Syncthing REST API call**

**What needs to move to Go service:**
- Folder status queries to Syncthing API

---

### 30. PUT /projects/:projectId/download-path (Line 2330)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Verify access (owner or member)
- Supabase: Update local_sync_path field
- Pure DB operation

---

### 31. GET /projects/:projectId/download-path (Line 2392)
**Category:** `DB_ONLY`  
**Operations:**
- Supabase: Verify access (owner or member)
- Supabase: Fetch project download path
- Pure DB query

---

### 32. POST /projects/:projectId/ensure-folder (Line 2438)
**Category:** `NEEDS_SPLIT`  
**Operations:**
- Supabase: Verify project ownership
- Supabase: Get user's device with Syncthing ID
- **Syncthing config via `getSyncthingConfig()`**
- **SyncthingService: `getFolder(projectId)` - Check if exists**
- **SyncthingService: `createFolder()` - Create new folder**
- **SyncthingService: `verifyFolderExists()` - Verification**

**What needs to move to Go service:**
- Folder creation and verification
- Folder existence checking

---

## Summary by Category

### DB_ONLY Endpoints (16)
1. POST /projects
2. GET /projects
3. GET /projects/list/invited
4. GET /projects/list/owned
5. GET /projects/:projectId
6. PUT /projects/:projectId
7. DELETE /projects/:projectId
8. POST /projects/:projectId/invite
9. POST /projects/:projectId/invite-token
10. POST /projects/:projectId/devices
11. DELETE /projects/:projectId/devices/:deviceId
12. GET /projects/:projectId/sync-events
13. GET /projects/:projectId/snapshot-metadata
14. GET /projects/:projectId/file-tree
15. GET /projects/:projectId/invited-users
16. GET /projects/:projectId/files-paginated
17. POST /projects/:projectId/files/update (events only)
18. GET /projects/:projectId/events
19. GET /projects/:projectId/download-path
20. PUT /projects/:projectId/download-path
21. POST /projects/:projectId/resume-sync (stub)
22. POST /projects/:projectId/sync-stop (stub)

**Actual DB_ONLY: 16** (marked stubs could be DB_ONLY or NEEDS_SPLIT)

### NEEDS_SPLIT Endpoints (16)
1. **GET /projects/:projectId/files-list** - `getFolderFiles()` Syncthing call
2. **GET /projects/:projectId/file-sync-status** - `getFolderStatus()` Syncthing call
3. **PUT /projects/:projectId/refresh-snapshot** - Future folder scanning (not yet implemented)
4. **POST /projects/:projectId/sync-start** - Complex Syncthing orchestration (test, add device, scan, wait)
5. **POST /projects/:projectId/pause-sync** - Folder pause/device removal
6. **GET /projects/:projectId/files** - Local filesystem directory scanning with `fs` module
7. **POST /projects/:projectId/files-sync** - Future Syncthing folder scanning
8. **POST /projects/:projectId/generate-snapshot** - Future Syncthing scanning
9. **GET /projects/:projectId/sync-status** - `getFolderStatus()` Syncthing call
10. **POST /projects/:projectId/ensure-folder** - Folder creation/verification

---

## Syncthing REST API Calls Found

| Method | Called In | Line(s) |
|--------|-----------|---------|
| `addDeviceToFolderWithRole()` | POST /projects/:projectId/join | 681 |
| `getFolderFiles()` | POST /projects/:projectId/join (async), GET /files-list | 755, 1023 |
| `addDeviceToFolder()` | POST /sync-start | 1446 |
| `scanFolder()` | POST /sync-start | 1455 |
| `waitForFolderKnown()` | POST /sync-start | 1467 |
| `waitForFolderScanned()` | POST /sync-start | 1476 |
| `getFolderStatus()` | POST /sync-start, GET /file-sync-status, GET /sync-status | 1485, 1295, 2308 |
| `pauseFolder()` | POST /pause-sync | 1548 |
| `removeDeviceFromFolder()` | POST /pause-sync, POST /join | 1554, (implicit) |
| `getFolder()` | POST /ensure-folder | 2485 |
| `createFolder()` | POST /ensure-folder | 2495 |
| `verifyFolderExists()` | POST /ensure-folder | 2502 |

---

## Local Filesystem Operations Found

| Operation | Called In | Line(s) |
|-----------|-----------|---------|
| `fs.existsSync()` | GET /files | 1927 |
| `fs.readdirSync()` | GET /files | 1937 |
| `fs.statSync()` | GET /files | 1945 |
| `path.join()` | GET /files | 1940 |
| Directory traversal | GET /files | 1920-1960 |

---

## Configuration Access

| Config Method | Used In Endpoints | Count |
|---------------|------------------|-------|
| `getSyncthingConfig()` | file-sync-status, files-list (async), ensure-folder | 3 |
| `process.env` Syncthing vars | pause-sync, resume-sync, sync-status | 3 |

---

## FileMetadataService Usage

| Method | Endpoint | Type |
|--------|----------|------|
| `loadSnapshot()` | list/invited, files-list, file-tree | Read-only |
| `saveSnapshot()` | join (async), files-list (async), generate-snapshot | Write to Storage |
| `cleanupOldSnapshots()` | generate-snapshot | Cleanup |

---

## Migration Priorities

### Phase 1: High Priority (Breaking Changes, Frequent Use)
1. **POST /sync-start** - Complex orchestration, frequently called
2. **GET /file-sync-status** - Real-time status, frequently polled
3. **POST /pause-sync** - Sync control
4. **GET /sync-status** - Status checking

### Phase 2: Medium Priority (Async Operations)
5. **GET /files-list** - File enumeration
6. **POST /ensure-folder** - Setup operation
7. **POST /generate-snapshot** - On-demand generation

### Phase 3: Lower Priority (Local Operations, Less Frequent)
8. **GET /files** - Local filesystem browsing (consider keeping on client)
9. **POST /files-sync** - Currently not implemented
10. **PUT /refresh-snapshot** - Currently not implemented

---

## Notes

- **Async Syncthing Operations:** Several endpoints spawn async tasks (snapshot generation in /join and /files-list)
- **Legacy Endpoints:** `/files-paginated` and `/files/update` reference deprecated `remote_files` table
- **Stubs:** `/resume-sync` and `/sync-stop` are currently stubs delegating to client
- **Cache:** `/file-sync-status` includes 5-second TTL cache to prevent Syncthing overload
- **Local vs Remote:** `/files` is local filesystem (owner), `/files-list` is remote Syncthing (members)

