# Quick Visual Reference: Event Handler Chains

## PROJECT GENERATION - Simplified Flow

```
USER
  ↓
POST /projects (Electron)
  ↓
┌─────────────────────────────────────────────┐
│ CLOUD BACKEND - 7 SEQUENTIAL STAGES         │
├─────────────────────────────────────────────┤
│ 1. ✓ DB INSERT → Project created            │
│    Time: ~50ms                              │
│    Returns: Project ID                      │
│                                             │
│ 2. ✓ GET DEVICE → Find Syncthing device    │
│    Time: ~20ms                              │
│    Returns: syncthing_id                    │
│                                             │
│ 3. ✓ CREATE FOLDER → Syncthing PUT         │
│    Time: ~30ms                              │
│    BUT: Folder not indexed yet              │
│                                             │
│ 4. ⏳ WAIT FOR SCAN → Event stream listener │
│    Time: 1-3 seconds (up to 60s timeout)    │
│    WAITING: LocalIndexUpdated event         │
│                                             │
│ 5. ✓ FETCH FILES → Syncthing browse API    │
│    Time: ~200ms (with retries)              │
│    ⚠ Response format varies!                │
│                                             │
│ 6. ✓ CONVERT & SAVE → Gzip + Supabase     │
│    Time: ~100ms                             │
│    ⚠ snapshot_url NOT UPDATED IN DB         │
│                                             │
│ 7. ✗ SEND RESPONSE                          │
│    Time: ~4.6s total                        │
│    PROBLEM: snapshot_url = null             │
│    PROBLEM: Only project table updated      │
│             Not projects table!             │
└─────────────────────────────────────────────┘
  ↓
ELECTRON RECEIVES
{ project: { snapshot_url: null } }
  ↓
FILE BROWSER TRIES TO LOAD
  ↓
✗ FAILS: snapshot_url is null
```

---

## PROJECT SYNCING - Simplified Flow

```
USER CLICKS "START SYNC"
  ↓
IPC: syncthing:startForProject
  ↓
┌─────────────────────────────────────────────┐
│ SYNCTHING MANAGER - SPLIT FLOW              │
├─────────────────────────────────────────────┤
│ MAIN THREAD (Synchronous):                  │
│                                             │
│ ✓ Check instance map                        │
│ ✓ Resolve binary path                       │
│ ✓ Create home dir                           │
│ ✓ Spawn Syncthing process (if needed)       │
│ ⏳ Wait 1500ms for config.xml                │
│    ⚠ FIXED DELAY (might not be ready)      │
│ ✓ Read API key from config                  │
│ ✓ Create instance map entry                 │
│                                             │
│ 🔴 RETURN: { success: true }               │
│    Time: ~1.5 seconds                       │
│    folderConfigured = FALSE                 │
│                                             │
│    CALLER THINKS: "Done!"                   │
│    BUT: Folder not configured yet!          │
│                                             │
│ BACKGROUND THREAD (Async setImmediate):    │
│                                             │
│ ⏳ WAIT FOR API READY                       │
│    Poll /rest/system/status                 │
│    Every 1s, max 30s                        │
│    Time: ~2-3 seconds                       │
│                                             │
│ ✓ Add folder config PUT                    │
│    Time: ~20ms                              │
│                                             │
│ ✓ Update folderConfigured = true            │
│    Time: ~2.5 seconds more                  │
│                                             │
│ ⚠ ERRORS ONLY LOGGED                        │
│    Not propagated to UI                     │
│    Only visible in console                  │
│    production = SILENT FAIL                 │
└─────────────────────────────────────────────┘
  ↓
MAIN RETURNS WHILE BACKGROUND STILL RUNNING
  ↓
RACE CONDITION:
Caller: "Syncing started!" ✗
Reality: "Still configuring..." (background)
  ↓
TYPICAL USER EXPERIENCE:
"Start Sync" clicked → "Success!" message
But folder sync never actually starts
No indication of failure
```

---

## CRITICAL ASYNC/AWAIT ORDERING ISSUES

### ISSUE 1: snapshot_url Never Updated in Response
```
Flow:
  1. POST /projects endpoint
  2. DB INSERT → returns project data
  3. Save snapshot to Supabase
  4. Response sent ← project.snapshot_url STILL NULL
  
  Later (not in this response):
  5. updateProjectSnapshot() might update DB
  BUT: Client already got response with null!

Fix: Update DB BEFORE sending response
```

### ISSUE 2: Folder Configuration Happens After Return
```
Flow:
  1. Main thread: startForProject() returns
  2. Caller gets: { success: true }
  3. Caller thinks: "Ready to sync"
  4. Caller proceeds to: fetchProjects(), show success
  
  Meanwhile (2-3 seconds later):
  5. Background: Still waiting for Syncthing API
  6. Background: Still adding folder config
  7. Background: Still not syncing

Fix: Await folder config BEFORE returning
```

### ISSUE 3: Unknown Response Structure = Silent Failure
```
Flow:
  1. GET /rest/db/browse?folder=...
  2. Response received from Syncthing
  3. Check if Array? → if (Array.isArray(browseData))
  4. Check if .children? → if (browseData?.children)
  5. Check if root dir? → if (browseData?.type === 'dir')
  6. None match? → return [] ← SILENT FAIL!
  
  Result: Empty snapshot with 0 files
  User sees: Empty file browser
  Error message: None

Fix: Throw error instead of returning empty array
```

### ISSUE 4: Error Handling Hidden Behind isDevelopment()
```
Flow:
  1. setImmediate(async () => {
  2.   try {
  3.     const result = await addFolder()  // ← could fail
  4.   } catch (e) {
  5.     if (isDevelopment())  // ← Production: NO ERROR!
  6.       console.error(e)
  7.   }
  8. })

  In Production:
  - Folder add fails
  - Error caught but not logged
  - folderConfigured stays false
  - Sync never starts
  - User has NO indication why

Fix: Return errors to caller regardless of environment
```

---

## DATA FLOW WITH JSON TYPES

```
Stage 1: User Input
─────────────────
{
  name: "My Videos",
  description: "Home videos",
  local_path: "/home/user/Videos"
}

Stage 2: After DB INSERT
────────────────────────
{
  id: "uuid-123",
  name: "My Videos",
  local_path: "/home/user/Videos",
  snapshot_url: null ← PROBLEM: null here
  snapshot_generated_at: null ← PROBLEM: null here
}

Stage 3: After getFolderFiles()
─────────────────────────────
[
  {
    path: "file1.mp4",
    name: "file1.mp4",
    type: "file",        ← "file" not "folder"
    size: 1024000,
    modTime: "2025-11-19T10:00:00Z",
    syncStatus: "synced"  ← Extra field!
  }
]

Stage 4: After Conversion
─────────────────────────
[
  {
    path: "file1.mp4",
    name: "file1.mp4",
    type: "file",
    size: 1024000,
    hash: "",            ← Empty string
    modifiedAt: "..." ← Renamed from modTime
  }
]

Stage 5: Response Back to Client
────────────────────────────────
{
  project: {
    id: "uuid-123",
    snapshot_url: null ← UNCHANGED! Still null
  }
}
```

---

## EVENT ORDERING - WHERE IT BREAKS

### Project Generation - Correct Order Should Be:

```
CURRENT (BROKEN):
┌─ Create project in DB
├─ Create folder in Syncthing
├─ Wait for folder scan
├─ Fetch files
├─ Save snapshot
│
│ ← Response sent HERE ← snapshot_url STILL null
│
└─ (optionally later) Update snapshot_url in DB

SHOULD BE:
┌─ Create project in DB
├─ Create folder in Syncthing
├─ Wait for folder scan
├─ Fetch files
├─ Save snapshot
├─ ← Update snapshot_url in DB BEFORE responding
│
│ ← Response sent HERE ← snapshot_url populated
│
└─ Client can immediately use snapshot_url
```

### Project Syncing - Correct Order Should Be:

```
CURRENT (BROKEN):
┌─ Spawn Syncthing (if needed)
├─ Wait 1500ms for config
├─ Read API key
├─ Create instance map
│
│ ← Return immediately ← folderConfigured = false
│
├─ (later, in background) Wait for API ready
├─ (later, in background) Add folder config
└─ (later, in background) Set folderConfigured = true

SHOULD BE:
┌─ Spawn Syncthing (if needed)
├─ Wait 1500ms for config
├─ Read API key
├─ Create instance map
├─ Wait for API ready (blocking)
├─ Add folder config (blocking)
├─ Set folderConfigured = true
│
│ ← Return now ← folderConfigured = true
│
└─ Caller knows folder is ready
```

---

## THREE MAIN PROBLEMS

### Problem 1: Async Operations After Response
- snapshot_url populated AFTER client receives null
- Folder config AFTER client gets response
- Client can't know when things are actually ready

**Solution**: Make all setup operations wait BEFORE responding

### Problem 2: JSON Response Format Variations
- Syncthing API returns 3+ different formats
- No way to distinguish between them
- Unknown format silently returns empty array

**Solution**: Detect format, log it, throw error on unknown

### Problem 3: Error Handling Gaps
- Background errors only logged in development
- No propagation to UI layer
- Production failures invisible to users

**Solution**: Return errors properly, alert user when things fail

---

## TESTING CHECKPOINTS

To verify fixes:

```
After Project Creation:
  ✓ snapshot_url is NOT null in response
  ✓ snapshot_generated_at is set
  ✓ File browser can access snapshot immediately
  ✓ No "Snapshot not found" errors

After Start Sync:
  ✓ folderConfigured = true on return (not later)
  ✓ Files appear in Syncthing GUI
  ✓ /rest/db/browse returns files
  ✓ syncStatus = 'syncing' while syncing
  ✓ Errors are propagated (not silent)

On Error Conditions:
  ✓ Invalid local_path → error returned to UI
  ✓ Syncthing not ready → error message
  ✓ No files in folder → snapshot has 0 files (not error)
  ✓ Unknown response format → throws error (logged)
```

See `/EVENT_HANDLER_CHAIN_ANALYSIS.md` for detailed diagrams and code examples.
