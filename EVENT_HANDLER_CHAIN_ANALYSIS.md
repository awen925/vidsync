# Event Handler Chain Analysis: Project Generation & Syncing

## Executive Summary

Your application has two critical async flows that can cause race conditions:
1. **Project Generation**: Cloud → Syncthing folder creation → snapshot generation
2. **Project Syncing**: Electron → Syncthing → File sync → Progress polling

**Main Issues Identified**:
- Async/await ordering issues causing incomplete state transitions
- JSON data type mismatches between layers
- Event handler callback sequencing problems
- Timing gaps where data becomes stale between operations

---

## 1. PROJECT GENERATION EVENT CHAIN

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    USER CREATES PROJECT (Electron)                  │
│              POST /api/projects with { name, local_path }           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│        CLOUD BACKEND: POST /api/projects/routes.ts [Line 37]        │
│                                                                      │
│  1. authMiddleware → verify user is authenticated                   │
│  2. DUPLICATE CHECK → supabase projects table                       │
│     └─> Query: eq('owner_id', ownerId) && eq('local_path')         │
│                                                                      │
│  ✗ ISSUE: No state returned if duplicate found                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼ (if unique)
┌─────────────────────────────────────────────────────────────────────┐
│        STEP 1: DATABASE INSERT → projects table                     │
│                                                                      │
│  supabase.from('projects').insert(payload)                          │
│  Returns: data { id, owner_id, name, local_path, created_at }      │
│                                                                      │
│  ✓ Synchronous - waits for DB response                              │
│  ✗ ISSUE: Project exists in DB but not yet in Syncthing            │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│        STEP 2: GET DEVICE INFO → supabase devices table            │
│                                                                      │
│  supabase.from('devices')                                           │
│    .select('syncthing_id')                                          │
│    .eq('user_id', ownerId)                                          │
│    .limit(1)                                                        │
│                                                                      │
│  Returns: devices[0].syncthing_id (or undefined if no device)       │
│                                                                      │
│  ✗ ISSUE: If no device, folder never created in Syncthing         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼ (if device found)
┌─────────────────────────────────────────────────────────────────────┐
│   STEP 3: CREATE SYNCTHING FOLDER                                  │
│   syncthingService.createFolder(projectId, name, local_path, devId) │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │ SyncthingService.createFolder() [syncthingService.ts]       │ │
│   │                                                              │ │
│   │ 1. Calls: /rest/config/folders/{projectId}                  │ │
│   │    Method: PUT                                              │ │
│   │    Payload: { id, label, path, type, devices }             │ │
│   │                                                              │ │
│   │ 2. Waits for 200 response (synchronous)                     │ │
│   │                                                              │ │
│   │ ✓ GOOD: Syncthing folder now exists                         │ │
│   │ ⚠ ISSUE: Folder hasn't scanned files yet                    │ │
│   └──────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ✗ TIMING GAP: Service returns before folder is indexed             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: WAIT FOR FOLDER SCAN → Syncthing event stream             │
│  syncthingService.waitForFolderScanned(projectId, 60000ms)          │
│  [syncthingService.ts, Line 316]                                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ waitForFolderScanned() Implementation:                        │  │
│  │                                                               │  │
│  │ 1. Connect to: GET /rest/events?since=0                      │  │
│  │    Headers: 'X-API-Key': apiKey                              │  │
│  │                                                               │  │
│  │ 2. Stream events, parse JSON objects from buffer              │  │
│  │                                                               │  │
│  │ 3. Look for: event.type === 'LocalIndexUpdated'              │  │
│  │             && event.data?.folder === projectId              │  │
│  │                                                               │  │
│  │ 4. On match: resolve() and destroy stream                    │  │
│  │                                                               │  │
│  │ ✓ GOOD: Waits for actual file indexing                       │  │
│  │ ✗ CRITICAL: Timeout set to 60s, can fail silently            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Possible Outcomes:                                                  │
│  • LocalIndexUpdated received → resolve() ✓                         │
│  • 60s timeout → warn + continue ⚠                                  │
│  • Stream closes early → reject() ✗                                 │
│  • Wrong event type received → keep waiting                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼ (regardless of outcome)
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 5: FETCH FILE LIST → Syncthing browse API                   │
│  syncthingService.getFolderFiles(projectId, 10 levels)              │
│  [syncthingService.ts, Line 465]                                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ getFolderFiles() Implementation:                              │  │
│  │                                                               │  │
│  │ 1. GET /rest/db/browse?folder={id}&levels=10&prefix=         │  │
│  │                                                               │  │
│  │ 2. Response parsing:                                          │  │
│  │    ┌─ IS ARRAY? → Use directly                               │  │
│  │    ├─ .children property? → Use browseData.children          │  │
│  │    ├─ root.type === 'dir'? → Use root.children               │  │
│  │    └─ Else → Log warning, return empty                       │  │
│  │                                                               │  │
│  │ 3. Recursively flatten tree up to depth 10                   │  │
│  │    └─ Extract: { path, name, type, size, modTime }           │  │
│  │                                                               │  │
│  │ 4. Determine syncStatus from folder-level stats              │  │
│  │    needFiles? → 'syncing' : 'synced'                         │  │
│  │    pullErrors? → 'error'                                     │  │
│  │                                                               │  │
│  │ Returns: Array of file objects                               │  │
│  │                                                               │  │
│  │ ✗ CRITICAL: Response structure varies by Syncthing version   │  │
│  │   - Sometimes returns array directly                          │  │
│  │   - Sometimes wraps in { children: [...] }                   │  │
│  │   - Sometimes returns root folder object                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Retry Logic (3 attempts, 500ms/1s/2s delay):                       │
│  • Attempt 1 (500ms delay) → fail? continue                         │
│  • Attempt 2 (1s delay) → fail? continue                            │
│  • Attempt 3 (2s delay) → fail? throw error                         │
│                                                                      │
│  ✗ ISSUE: If all retries fail, response sent with error             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼ (if files fetched successfully)
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 6: CONVERT TO SNAPSHOT & SAVE TO STORAGE                     │
│  FileMetadataService.saveSnapshot(projectId, name, snapshotFiles)   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Format Conversion:                                            │  │
│  │                                                               │  │
│  │ FROM Syncthing format:                                        │  │
│  │  { path, name, type, size, modTime, syncStatus }             │  │
│  │                                                               │  │
│  │ TO Snapshot format:                                           │  │
│  │  { path, name, type: 'file'|'folder', size, hash, modTime }  │  │
│  │                                                               │  │
│  │ 2. Compress to .json.gz                                       │  │
│  │                                                               │  │
│  │ 3. Upload to Supabase Storage:                                │  │
│  │    Bucket: 'snapshots'                                        │  │
│  │    Path: {projectId}-snapshot.json.gz                         │  │
│  │                                                               │  │
│  │ ✓ GOOD: Snapshot persisted                                    │  │
│  │ ✗ ISSUE: No verification snapshot was written                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Returns: { path: 's3://...' }  OR  void                            │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 7: SEND RESPONSE TO ELECTRON CLIENT                          │
│                                                                      │
│  res.status(201).json({ project: data })                            │
│                                                                      │
│  Response Payload:                                                   │
│  {                                                                   │
│    "project": {                                                      │
│      "id": "uuid",                                                   │
│      "owner_id": "uuid",                                             │
│      "name": "string",                                               │
│      "description": "string | null",                                 │
│      "local_path": "string | null",                                  │
│      "auto_sync": boolean,                                           │
│      "snapshot_url": null,  ← IMPORTANT: URL not set!               │
│      "snapshot_generated_at": null,  ← IMPORTANT: Never updated     │
│      "created_at": "ISO string"                                      │
│    }                                                                  │
│  }                                                                   │
│                                                                      │
│  ✗ CRITICAL: snapshot_url & snapshot_generated_at NOT updated      │
│    → File browser will not find snapshot_url to download            │
│    → Need separate API call to /projects/{id}/generate-snapshot     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│            ELECTRON RECEIVES RESPONSE                               │
│     YourProjectsPage.tsx [Line 203: handleCreateProject]           │
│                                                                      │
│  if (response.data.project && newProjectLocalPath) {                │
│    await window.api.syncthingStartForProject(projectId, localPath) │
│  }                                                                   │
│                                                                      │
│  ✗ ISSUE: Syncthing already started on cloud server!               │
│    Now starting again locally - potential conflicts                 │
│                                                                      │
│  await fetchProjects() → Calls GET /api/projects                    │
│    → Returns projects list (snapshot_url still null!)               │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Data Types at Each Stage

| Stage | Variable | Type | Issue |
|-------|----------|------|-------|
| 1. DB Insert | `data` | `Project object` | ✗ `snapshot_url` is `null` |
| 2. Device Query | `devices[0]` | `{ syncthing_id: string }` | ✗ Might not exist |
| 3. Folder Created | (none) | 201 response | ✗ No return value checked |
| 4. Event Wait | `event` | `JSON parsed from stream` | ✗ Can timeout silently |
| 5. File List | `syncFiles` | `Array<{ path, name, type, size, modTime, syncStatus }>` | ✗ Structure varies! |
| 6. Snapshot | `snapshotFiles` | `Array<{ path, name, type, size, hash, modifiedAt }>` | ✓ Consistent format |
| 7. Response | `project` | `Project object` | ✗ `snapshot_url` STILL null |

### Timing Diagram

```
Time  Cloud Backend                   Syncthing Service           Response to Client
────────────────────────────────────────────────────────────────────────────────────
0ms   │
      ├─→ DB INSERT (10ms)
10ms  │   Project created in DB
      │
      ├─→ GET DEVICES (5ms)
15ms  │   Device found
      │
      ├─→ CREATE FOLDER PUT (20ms)
35ms  │   Folder config sent ─────→ [Syncthing creates folder]
      │                             [Folder creation: ~50ms]
85ms  │                            └─ Folder ready
      │
      ├─→ WAIT FOR SCAN EVENT (up to 60s)
      │   Stream opened
      │   Listening... ──────────→ [Syncthing scans files]
      │                           [File scan starts]
2000ms│                           [Files being indexed...]
      │                           [...scanning...]
3500ms│                           └─ LocalIndexUpdated event! ✓
      │   Event received
      ├─→ Disconnect stream (5ms)
3505ms│
      │   ├─→ RETRY LOOP: GET /rest/db/browse
      │   │   Attempt 1 (500ms delay + request) ──→ [Fetching file tree...]
      │   │   (1000ms total elapsed)
4505ms│   │   Response received
      │   │
      │   ├─→ CONVERT & UPLOAD (100ms)
      │   │   saveSnapshot() ──────→ [Uploading to Supabase...]
4605ms│   │                         └─ Upload complete ✓
      │   │
      │   └─→ SEND RESPONSE ─────────────────────────→ Client receives
4610ms│                                              ✓ res.status(201)
      │
      └─ Total: ~4.6 seconds (can be up to 60+ seconds if timeout)
```

---

## 2. PROJECT SYNCING EVENT CHAIN

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                 USER STARTS SYNCING (Electron UI)                   │
│                 ProjectSyncControls.tsx                             │
│                                                                      │
│  onClick → syncthingManager.startForProject(projectId, localPath)   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│   ELECTRON IPC: syncthing:startForProject                           │
│   [main.ts, Line 211]                                              │
│                                                                      │
│  ipcMain.handle('syncthing:startForProject', async (ev, params) => {│
│    return syncthingManager.startForProject(projectId, localPath)    │
│  })                                                                  │
│                                                                      │
│  ✓ GOOD: Async handler waits for completion                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│   SyncthingManager.startForProject() [syncthingManager.ts, L 224]   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ CHECK EXISTING INSTANCE:                                     │  │
│  │                                                               │  │
│  │ if (this.instances.has(projectId)) {                         │  │
│  │   return { success: true, ... }                              │  │
│  │ }                                                             │  │
│  │                                                               │  │
│  │ ✓ GOOD: Prevents duplicate Syncthing processes              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ SHARED INSTANCE SETUP:                                       │  │
│  │                                                               │  │
│  │ 1. Check if this.sharedInstance exists                       │  │
│  │    (All projects share ONE Syncthing process for efficiency)  │  │
│  │                                                               │  │
│  │ 2. If NOT exist:                                             │  │
│  │    a. Create homedir: ~/.vidsync/syncthing/shared            │  │
│  │    b. Spawn Syncthing process:                               │  │
│  │       spawn('syncthing', ['-home', sharedHome])              │  │
│  │       stdio: ['ignore', 'pipe', 'pipe']                      │  │
│  │                                                               │  │
│  │    c. Wait 1500ms for config.xml to be created               │  │
│  │    d. Read API key from ~/.vidsync/syncthing/shared/config   │  │
│  │                                                               │  │
│  │    ✗ TIMING ISSUE:                                           │  │
│  │      - Fixed 1500ms wait might be too short/long              │  │
│  │      - Config.xml not guaranteed ready at 1500ms              │  │
│  │      - No verification of file existence                      │  │
│  │                                                               │  │
│  │ 3. Store in this.sharedInstance:                             │  │
│  │    { process, homeDir, apiKey }                              │  │
│  │                                                               │  │
│  │ 4. On spawn error, try system Syncthing fallback              │  │
│  │    findSystemSyncthingConfig() → ~/.config/syncthing/        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ✗ ISSUE: If both spawn AND system fallback fail                   │
│    → Returns error, but error not handled well                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼ (if shared instance ready)
┌─────────────────────────────────────────────────────────────────────┐
│  ADD PROJECT REFERENCE TO MAP:                                      │
│                                                                      │
│  projectInstance: InstanceInfo = {                                  │
│    process: this.sharedInstance.process,                            │
│    homeDir: this.sharedInstance.homeDir,                            │
│    localPath: localPath,                                            │
│    apiKey: this.sharedInstance.apiKey,                              │
│    folderConfigured: false  ← INITIAL STATE                         │
│  }                                                                   │
│                                                                      │
│  this.instances.set(projectId, projectInstance)                     │
│                                                                      │
│  ✓ GOOD: Maps project to shared Syncthing                           │
│  ✗ ISSUE: folderConfigured = false initially                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼ (return to caller immediately)
┌─────────────────────────────────────────────────────────────────────┐
│  RETURN TO CALLER:                                                  │
│                                                                      │
│  return {                                                            │
│    success: true,                                                    │
│    pid: sharedInstance.process.pid,                                 │
│    homeDir: sharedInstance.homeDir                                  │
│  }                                                                   │
│                                                                      │
│  ✗ CRITICAL TIMING ISSUE:                                          │
│    - Returns BEFORE folder configuration complete                   │
│    - folderConfigured = false at this point                         │
│    - Async folder setup continues in background (setImmediate)     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
        MAIN THREAD │             │ BACKGROUND ASYNC THREAD
        (Returns)   │             │ (Continues in setImmediate)
                    │             │
                    ▼             ▼
          Caller gets ✓        ┌─────────────────────────────┐
          response,            │ setImmediate(async () => {  │
          thinks it's          │                             │
          ready                │ 1. waitForSyncthingReady()   │
                               │    Polls /rest/system/status│
                               │    up to 30s                 │
                               │    Checks: res.statusCode==200
                               │                             │
                               │ 2. If ready:                │
                               │    addFolder() PUT request   │
                               │    /rest/config/folders/id  │
                               │                             │
                               │ 3. Update instance:         │
                               │    inst.folderConfigured=true
                               │                             │
                               │ ✗ ISSUE:                    │
                               │ - No error handling          │
                               │ - Caller doesn't know if it │
                               │   completed successfully     │
                               │ - Race condition: caller     │
                               │   tries to use folder before │
                               │   it's configured            │
                               └─────────────────────────────┘
```

### Detailed Timeline for Syncing

```
Time    Action                                          State
───────────────────────────────────────────────────────────────────
0ms     User clicks "Start Syncing"
        
        → ipcMain.handle('syncthing:startForProject')
        
1ms     ├─ Check if instance exists
        │  └─ Not found (first time)
        
2ms     ├─ Resolve binary path
        │  └─ Found: ./go-agent/bin/syncthing/syncthing
        
3ms     ├─ Create home dir
        │  └─ ~/.vidsync/syncthing/shared ✓
        
4ms     ├─ Check sharedInstance
        │  └─ Not exists (first project)
        
5ms     ├─ SPAWN SYNCTHING PROCESS
        │  └─ spawn('syncthing', ['-home', sharedHome])
        │     Syncthing PID: 12345
        │     [Syncthing initializing...]
        
6ms     ├─ Stdout listener attached
        │  └─ Listening for logs
        
7ms     ├─ Stderr listener attached
        │  └─ Listening for errors
        
8ms     ├─ Exit handler attached
        │  └─ Will clear instances on exit
        
        ⏸ WAIT 1500ms FOR CONFIG.XML
        
1508ms  │  [Syncthing creating config.xml...]
        │  [Syncthing API initializing...]
        
1509ms  ├─ Config.xml written ✓
        │  
        └─ getApiKey(sharedHome)
           └─ Read from config.xml ✓
           └─ apiKey: "abc123xyz..."
        
1510ms  ├─ Create InstanceInfo object
        │  └─ { process, homeDir, apiKey }
        
1511ms  ├─ Store in this.sharedInstance
        │  └─ this.sharedInstance = inst ✓
        
1512ms  ├─ Create projectInstance
        │  └─ { process, homeDir, localPath, apiKey, folderConfigured: false }
        
1513ms  ├─ this.instances.set(projectId, projectInstance) ✓
        
1514ms  ├─ Check if localPath provided
        │  └─ Yes: /home/user/Videos
        
        ⏸ RETURN IMMEDIATELY TO CALLER
        
1515ms  │  [CALLER RECEIVES RESPONSE]
        │  └─ { success: true, pid: 12345, homeDir: '...' }
        │  └─ CALLER THINKS: "Setup complete!" ✓
        │
        │  ✗ BUT: Folder NOT yet added to Syncthing!
        
        ┌─ BACKGROUND: setImmediate(async () => {
        │
1516ms  │  ├─ Call waitForSyncthingReady(apiKey, 30000)
        │  │  └─ Loop: Poll /rest/system/status every 1s
        │  │
2000ms  │  │  Attempt 1: GET /rest/system/status
        │  │            └─ ERR: Connection refused (not ready yet)
        │  │               └─ Continue...
        │  │
2001ms  │  │  Wait 1000ms
        │  │
3001ms  │  │  Attempt 2: GET /rest/system/status
        │  │            └─ ERR: Still not responding...
        │  │
3002ms  │  │  Wait 1000ms
        │  │
4002ms  │  │  Attempt 3: GET /rest/system/status
        │  │            └─ 200 OK ✓ Syncthing API ready!
        │  │
        │  ├─ Syncthing is now ready
        │  │
4003ms  │  ├─ Call addFolder(apiKey, projectId, localPath)
        │  │  └─ PUT /rest/config/folders/{projectId}
        │  │     Payload: { id, label, path, type, devices }
        │  │
4025ms  │  │  └─ 200 OK ✓ Folder added!
        │  │
        │  ├─ Get instance and update
        │  │  └─ inst.folderConfigured = true ✓
        │  │
        │  └─ END setImmediate
        │
4026ms  └─ BACKGROUND WORK COMPLETE
        
        ✗ TOTAL ELAPSED: ~2.5 seconds before folder is ready
        ✗ But caller received response at 1515ms thinking it's done!
```

### Async Data Flow Issues

```
┌─────────────────────────────────────────────────────────────────────┐
│ PROBLEM 1: JSON RESPONSE TYPE MISMATCH                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ Cloud Server Response: project object with fields:                  │
│ {                                                                    │
│   id: string (UUID)                                                 │
│   owner_id: string (UUID)                                           │
│   name: string                                                       │
│   description: string | null                                         │
│   local_path: string | null                                          │
│   auto_sync: boolean                                                 │
│   snapshot_url: string | null   ← ALWAYS NULL after creation        │
│   snapshot_generated_at: ISO string | null  ← ALWAYS NULL           │
│   created_at: ISO string                                             │
│   // Missing fields from Syncthing state:                           │
│   // - syncthing_status                                              │
│   // - syncthing_device_id                                           │
│   // - sync_progress                                                 │
│ }                                                                    │
│                                                                      │
│ ✗ Issue:                                                             │
│   - snapshot_url is null, so file browser can't display files       │
│   - Need to call separate /projects/{id}/generate-snapshot after   │
│   - Or poll /projects/{id} until snapshot_url is populated         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ PROBLEM 2: FOLDER CONFIGURATION RACE CONDITION                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ Timeline:                                                             │
│ 1515ms → Caller receives: { success: true }                         │
│          Assumes folder is ready to sync                            │
│                                                                      │
│ CALLER THEN DOES:                                                   │
│   await window.api.syncthingStartForProject(projectId, localPath)   │
│   await fetchProjects()  ← Refreshes UI                             │
│   showAlert('Project created!')  ← Shows immediately                │
│                                                                      │
│ BUT IN BACKGROUND:                                                  │
│ 1516-4026ms → Still waiting for Syncthing to be ready              │
│              Still adding folder configuration                      │
│              Still NOT actually syncing files                       │
│                                                                      │
│ ✗ Result:                                                            │
│   - User sees "Project created" alert                               │
│   - But folder not yet configured in Syncthing                      │
│   - File sync hasn't started                                        │
│   - User tries to view files → snapshot_url is null → Error        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ PROBLEM 3: ERROR HANDLING GAPS                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ In addFolder() [asynchingManager.ts, line ~170]:                    │
│                                                                      │
│  setImmediate(async () => {                                         │
│    try {                                                             │
│      const ready = await this.waitForSyncthingReady(...)            │
│      if (ready) {                                                    │
│        const added = await this.addFolder(...)                      │
│        if (isDevelopment())                                          │
│          console.log(`Added folder: ${added}`)                      │
│        inst.folderConfigured = !!added                              │
│      } else {                                                        │
│        if (isDevelopment())                                          │
│          console.warn('[Syncthing] API did not become ready')       │
│      }                                                               │
│    } catch (e) {                                                     │
│      if (isDevelopment())                                            │
│        console.error('[Syncthing] Error:', e)                       │
│    }                                                                  │
│  })                                                                  │
│                                                                      │
│ ✗ Issues:                                                            │
│   - Errors only logged to console (isDevelopment)                   │
│   - No error callback to UI                                         │
│   - No way for caller to know if folder was actually added          │
│   - Fails silently in production                                    │
│   - User has no visibility into failure                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ PROBLEM 4: RESPONSE STRUCTURE PARSING                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ SyncthingService.getFolderFiles() tries multiple response formats:  │
│                                                                      │
│ Expected formats:                                                    │
│ 1. Direct array: [ { name, type, children } ]                       │
│ 2. Wrapped: { children: [ { name, type, children } ] }              │
│ 3. Root object: { type: 'dir', children: [ ... ] }                  │
│ 4. Unknown: ???                                                      │
│                                                                      │
│ ✗ Issues:                                                            │
│   - If none match → warns and returns empty array []                │
│   - Empty array cascades through: saveSnapshot gets 0 files        │
│   - Snapshot created but empty                                       │
│   - File browser shows nothing on first load                         │
│   - Silent failure - no error to user                               │
│                                                                      │
│ Data flow:                                                           │
│   browseData from API                                               │
│      ↓ [Unknown structure]                                          │
│   itemsToFlatten = [] (default)                                      │
│      ↓                                                               │
│   flatten([])                                                        │
│      ↓                                                               │
│   files = []                                                         │
│      ↓                                                               │
│   saveSnapshot(projectId, name, [])                                 │
│      ↓                                                               │
│   Snapshot stored with 0 files                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. CRITICAL ASYNC ISSUES SUMMARY

### Issue #1: Project Creation Response Doesn't Wait for Snapshot URL Population

**Root Cause**: `snapshot_url` field is populated asynchronously AFTER the API response is sent.

**Current Flow**:
```typescript
// Project created
res.status(201).json({ project: data })  // snapshot_url is null

// AFTER response sent to client:
// (somewhere else) 
// snapshot_url would eventually be populated by updateProjectSnapshot()
// But response already sent!
```

**Impact**: 
- File browser tries to load with `snapshot_url === null`
- Must make separate API call to generate snapshot
- Race condition between client refresh and snapshot generation

---

### Issue #2: Syncthing Folder Configuration Happens After Response

**Root Cause**: `addFolder()` called in `setImmediate()` - returns control before folder is configured.

**Current Flow**:
```typescript
// Main thread
return { success: true }  // Returns to caller

// Background thread (started with setImmediate)
setImmediate(async () => {
  const ready = await waitForSyncthingReady()
  await addFolder()  // THIS HASN'T HAPPENED YET!
})
```

**Impact**:
- Caller thinks folder is ready
- But folder configuration in progress
- Attempts to sync fail silently
- No error propagation to UI

---

### Issue #3: JSON Response Structure Variance

**Root Cause**: Syncthing API `/rest/db/browse` returns different structures based on version/state.

**Current Flow**:
```typescript
if (Array.isArray(browseData)) { /* format 1 */ }
else if (browseData.children) { /* format 2 */ }
else if (browseData.type === 'dir') { /* format 3 */ }
else { /* unknown */ return [] }  // ← SILENT FAILURE
```

**Impact**:
- Empty snapshot files array
- Snapshot created with 0 items
- File browser shows empty after generation
- No error logged to user

---

### Issue #4: Error Handling in Background Tasks

**Root Cause**: Errors in `setImmediate()` callback only logged if `isDevelopment()`.

**Current Flow**:
```typescript
try {
  const ready = await waitForSyncthingReady()
  if (ready) {
    const added = await addFolder()  // Could fail
    inst.folderConfigured = !!added   // Still sets to false
  }
} catch (e) {
  if (isDevelopment())  // ← PRODUCTION: NO ERROR HANDLING!
    console.error(e)
}
```

**Impact**:
- Production errors invisible to user
- Folder configuration failure undetected
- Syncing never starts, no indication why
- Support can't debug without logs

---

## 4. RECOMMENDED FIXES

### Fix #1: Make Snapshot URL Population Synchronous

```typescript
// In POST /api/projects

// After snapshot generation succeeds:
const updateResult = await supabase
  .from('projects')
  .update({
    snapshot_url: snapshotPath,
    snapshot_generated_at: new Date().toISOString()
  })
  .eq('id', data.id)
  .single()

// Then send response with updated data
res.status(201).json({ project: updateResult.data })
```

### Fix #2: Add Folder Configuration Waiting

```typescript
// Make addFolder async and wait for completion
async startForProject(projectId, localPath) {
  // ... shared instance setup ...
  
  // Add folder BEFORE returning
  if (localPath && this.sharedInstance.apiKey) {
    const ready = await this.waitForSyncthingReady(...)
    if (ready) {
      await this.addFolder(...)  // ← Remove setImmediate, await here
      projectInstance.folderConfigured = true
    }
  }
  
  // Now safe to return
  return { success: true, ... }
}
```

### Fix #3: Detect and Handle Response Structure Variations

```typescript
// Add logging to detect actual response structure
console.log('Browse response structure:', {
  isArray: Array.isArray(browseData),
  hasChildren: !!browseData?.children,
  type: browseData?.type,
  keys: Object.keys(browseData || {}).slice(0, 5)
})

// Try to extract items, with better error handling
let itemsToFlatten = []
if (Array.isArray(browseData)) {
  itemsToFlatten = browseData
} else if (browseData?.children?.length > 0) {
  itemsToFlatten = browseData.children
} else if (browseData?.type === 'dir' && browseData?.children?.length > 0) {
  itemsToFlatten = browseData.children
} else {
  // ← THIS IS THE ERROR CASE - throw instead of return []
  throw new Error(`Unexpected browse response structure: ${JSON.stringify(browseData).substring(0, 200)}`)
}
```

### Fix #4: Add Error Callback Propagation

```typescript
// Return a promise instead of using setImmediate
private async configureFolder(projectId, localPath, apiKey) {
  try {
    const ready = await this.waitForSyncthingReady(apiKey)
    if (!ready) throw new Error('Syncthing API did not become ready')
    
    const result = await this.addFolder(apiKey, projectId, localPath)
    if (!result) throw new Error('Failed to add folder to Syncthing')
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Then in startForProject:
const folderConfig = await this.configureFolder(projectId, localPath, apiKey)
if (!folderConfig.success) {
  // Could return error or throw
  throw new Error(`Folder configuration failed: ${folderConfig.error}`)
}
```

---

## 5. EVENT HANDLER CHAIN DEPENDENCIES

### Project Generation Dependencies

```
┌─ AUTH MIDDLEWARE
│
├─ DUPLICATE CHECK (Supabase Query)
│  └─ Project name uniqueness
│
├─ DATABASE INSERT (Supabase)
│  └─ Creates row, returns Project ID
│
├─ DEVICE LOOKUP (Supabase Query)
│  ├─ Gets owner's Syncthing device ID
│  └─ Required for folder creation
│
├─ SYNCTHING FOLDER CREATE (HTTPS PUT)
│  ├─ Creates folder config
│  └─ Requires device ID
│
├─ WAIT FOR FOLDER SCAN (Event stream)
│  ├─ Listens for LocalIndexUpdated
│  └─ Times out after 60s
│
├─ GET FOLDER FILES (HTTPS GET browse API)
│  ├─ Fetches file tree
│  ├─ Retries 3x if fails
│  └─ Parses response (multiple formats)
│
├─ SAVE SNAPSHOT (Supabase Storage)
│  ├─ Converts file format
│  ├─ Compresses to .gz
│  └─ Uploads to bucket
│
└─ SEND RESPONSE (JSON)
   └─ Contains project data (snapshot_url = null)

CRITICAL PATH: All steps must succeed. Timeout at step 4 causes fallback.
```

### Project Syncing Dependencies

```
┌─ IPC HANDLER (Electron main process)
│
├─ INSTANCE CHECK (In-memory map)
│  └─ Returns existing if already running
│
├─ BINARY RESOLUTION
│  ├─ Checks multiple paths
│  └─ Required to spawn Syncthing
│
├─ HOME DIRECTORY CREATION
│  ├─ ~/.vidsync/syncthing/shared
│  └─ Fails if write permission denied
│
├─ SPAWN SYNCTHING PROCESS
│  ├─ Creates child process
│  ├─ Redirects stdout/stderr
│  └─ Attaches listeners
│
├─ WAIT FOR CONFIG.XML (Fixed 1500ms)
│  ├─ Hard-coded delay
│  └─ May fail if system slow
│
├─ READ API KEY (File system read)
│  ├─ Reads config.xml
│  ├─ Parses XML regex
│  └─ Extracts API key
│
├─ RETURN TO CALLER (sync)
│  └─ { success: true, ... }
│
└─ BACKGROUND ASYNC (setImmediate)
   ├─ WAIT FOR SYNCTHING READY (Poll loop)
   │  └─ Polls /rest/system/status every 1s, max 30s
   │
   └─ ADD FOLDER (HTTPS PUT)
      ├─ Creates folder config
      └─ Sets folderConfigured = true

CRITICAL PATH: Steps 1-7 synchronous. Steps 8-9 asynchronous and not awaited.
Race condition: Caller proceeds before steps 8-9 complete.
```

---

## 6. DATA FLOW WITH TYPE INFORMATION

### Project Creation Data Types

```typescript
// STAGE 1: User Input (Electron)
{
  name: string              // Required: "My Project"
  description?: string      // Optional: "Project description"
  local_path?: string       // Optional: "/home/user/Videos"
  auto_sync?: boolean       // Optional: true
}

// STAGE 2: Database (Supabase projects table)
{
  id: string                            // UUID generated
  owner_id: string                      // From auth
  name: string                          // Copied from input
  description: string | null            // Nullable
  local_path: string | null             // Nullable
  auto_sync: boolean                    // Defaults to true
  snapshot_url: string | null           // ← NULL (populated later)
  snapshot_generated_at: string | null  // ← NULL (not set yet)
  created_at: ISO string                // NOW()
  updated_at: ISO string                // NOW()
}

// STAGE 3: Syncthing Folder Config (PUT /rest/config/folders/{id})
{
  id: string                            // Copy project.id
  label: string                         // "Project: " + name
  path: string                          // local_path or /tmp/vidsync/{id}
  type: 'sendreceive' | 'sendonly'      // 'sendreceive'
  devices: Array<{ deviceID: string }>  // [{ deviceID: owner_device_id }]
  rescanIntervalS: number               // 3600
  fsWatcherEnabled: boolean             // true
}

// STAGE 4: Syncthing Event (LocalIndexUpdated from stream)
{
  id: number                            // Event ID
  time: ISO string                      // When event occurred
  type: 'LocalIndexUpdated'             // Event type
  data: {
    folder: string                      // Project ID
    items: number                       // Number of files indexed
  }
}

// STAGE 5: Syncthing Browse Response (/rest/db/browse)
// Format varies - could be one of:

// Format A: Direct array
[
  {
    name: string                        // Filename
    type: 'file' | 'dir'               // File type
    size: number                        // In bytes
    modTime: ISO string                 // Modification time
    children?: Array<...>              // If dir, nested children
  },
  ...
]

// Format B: Wrapped object
{
  children: [
    { name, type, size, modTime, children },
    ...
  ]
}

// Format C: Root folder object
{
  type: 'dir'                           // Always 'dir'
  name: string                          // Folder name
  children: [
    { name, type, size, modTime, children },
    ...
  ]
}

// STAGE 6: Flattened File List (After recursive processing)
[
  {
    path: string                        // "subfolder/file.txt"
    name: string                        // "file.txt"
    type: 'file' | 'dir'               // Determined type
    size: number                        // In bytes
    modTime: ISO string                 // ISO format
    syncStatus: 'synced'|'syncing'|...  // Determined from folder status
  },
  ...
]

// STAGE 7: Snapshot Format (After conversion)
[
  {
    path: string                        // "subfolder/file.txt"
    name: string                        // "file.txt"
    type: 'file' | 'folder'            // Changed from dir → folder
    size: number                        // In bytes
    hash: string                        // Empty string (not computed)
    modifiedAt: ISO string              // ISO format
  },
  ...
]
// Then compressed to JSON.stringify + gzip → .json.gz

// STAGE 8: API Response (Back to Electron)
{
  project: {
    id: string                          // UUID
    owner_id: string                    // User UUID
    name: string                        // Project name
    description: string | null          // May be null
    local_path: string | null           // May be null
    auto_sync: boolean                  // Default true
    snapshot_url: string | null         // ← STILL NULL!
    snapshot_generated_at: string | null// ← STILL NULL!
    created_at: ISO string              // Creation time
    updated_at: ISO string              // Update time
  }
}
```

---

## 7. COMPLETE SEQUENCE DIAGRAM

```
ACTOR                 CLOUD API              SYNCTHING           SUPABASE
  │                      │                        │                   │
  │  POST /projects      │                        │                   │
  ├─────────────────────>│                        │                   │
  │                      │  [Auth check]          │                   │
  │                      │  [Duplicate check]     │                   │
  │                      │                        │                   │
  │                      │  [DB: INSERT project]  │                   │
  │                      ├───────────────────────────────────────────>│
  │                      │                        │                   │
  │                      │  [Wait for response]   │                   │
  │                      │  [DB returns ID]      │                   │
  │                      │<───────────────────────────────────────────┤
  │                      │                        │                   │
  │                      │  [GET device info]     │                   │
  │                      ├───────────────────────────────────────────>│
  │                      │<───────────────────────────────────────────┤
  │                      │                        │                   │
  │                      │  PUT /rest/config/folders/{id}             │
  │                      ├───────────────────────>│                   │
  │                      │  [Create folder]       │                   │
  │                      │                        │  [Folder created] │
  │                      │                        │  [Indexing...]    │
  │                      │  [200 OK]             │                   │
  │                      │<───────────────────────┤                   │
  │                      │                        │                   │
  │                      │  GET /rest/events?since=0                  │
  │                      ├───────────────────────>│                   │
  │                      │  [Listen stream]       │                   │
  │                      │  [Waiting for events]  │                   │
  │                      │                        │                   │
  │                      │                        │  [LocalIndexUpdated]
  │                      │  [Event received]     │                   │
  │                      │<───────────────────────┤                   │
  │                      │                        │                   │
  │                      │  GET /rest/db/browse   │                   │
  │                      ├───────────────────────>│                   │
  │                      │  [Fetch file tree]     │                   │
  │                      │  [Retry if fails]      │                   │
  │                      │  [Parse response]     │                   │
  │                      │  [Flatten tree]        │                   │
  │                      │  [200 OK + files]      │                   │
  │                      │<───────────────────────┤                   │
  │                      │                        │                   │
  │                      │  [Convert to snapshot] │                   │
  │                      │  [Compress .gz]        │                   │
  │                      │  PUT /snapshots/...    │                   │
  │                      ├───────────────────────────────────────────>│
  │                      │  [Upload file]         │                   │
  │                      │  [200 OK]              │                   │
  │                      │<───────────────────────────────────────────┤
  │                      │                        │                   │
  │ (201) response       │                        │                   │
  │<─────────────────────┤                        │                   │
  │ (project data)       │                        │                   │
  │ snapshot_url = null! │                        │                   │
  │                      │                        │                   │
  │ [Electron processes] │                        │                   │
  │ ipcMain:startSync    │                        │                   │
  │                      │                        │                   │
  │ [Calls IPC handler]  │                        │                   │
  │                      │  [Spawn Syncthing]    │                   │
  │                      │  [Wait 1500ms]         │                   │
  │                      │  [Poll API ready]      │                   │
  │                      │  ├──────────────────>│ [API starting]     │
  │                      │  │ [Keep polling]     │                   │
  │                      │  ├──────────────────>│ [API online]       │
  │                      │  │ [200 OK]           │                   │
  │                      │  │ [Add folder]       │                   │
  │                      │  ├──────────────────>│ [Folder added]     │
  │                      │  │ [folderConfigured] │                   │
  │                      │  │ [= true]           │                   │
  │ [Response ready]     │  │                    │                   │
  │<─ (async)            │  │                    │                   │
  │ (success: true)      │  │                    │                   │
  │                      │  │                    │                   │
  │ [User sees success]  │  │                    │                   │
  │ [Folder syncing]     │  │                    │                   │
  │                      │  │                    │                   │

TIME: Total ~4-5 seconds. Caller gets response in ~1.5 seconds.
      Background work continues 2-3 more seconds.
      RACE CONDITION: Caller proceeds before background work completes.
```

---

## 8. ROOT CAUSE ANALYSIS

| Issue | Root Cause | Component | Impact |
|-------|-----------|-----------|--------|
| Snapshot URL null | Response sent before DB update | Cloud API | File browser can't display files |
| Folder config incomplete | `setImmediate` doesn't block | SyncthingManager | Syncing fails silently |
| Empty file list | Unknown response structure | SyncthingService | Snapshot has 0 files |
| Silent errors | isDevelopment() check | SyncthingManager | Production issues invisible |
| Race condition timing | Response returned before async setup | Overall design | Caller assumes readiness |
| JSON format variance | Syncthing API multiple formats | SyncthingService | Parsing fails, returns empty |

---

## NEXT STEPS

To fix these issues, we need to:

1. **Make snapshot_url generation synchronous** - Update DB before responding
2. **Await folder configuration** - Remove setImmediate, await addFolder()
3. **Add response structure detection** - Log actual format, throw on unknown
4. **Propagate errors properly** - Return errors to caller, not just console
5. **Add state validation** - Check folderConfigured before marking complete
6. **Test with various Syncthing states** - Empty folder, large folder, slow system

This document provides the complete event handler map. Ready to implement fixes?
