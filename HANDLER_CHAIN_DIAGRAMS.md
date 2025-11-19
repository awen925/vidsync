# Event Handler Diagrams - Visual Summary

## 1. PROJECT GENERATION COMPLETE HANDLER CHAIN

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 1: AUTHENTICATION & VALIDATION                                ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  POST /api/projects                                                  │
│  ├─ authMiddleware()                                                 │
│  │  └─ Verify JWT token valid                                       │
│  │  └─ Extract user.id                                              │
│  │                                                                  │
│  └─ Duplicate Check                                                  │
│     ├─ supabase.from('projects')                                     │
│     │  .select('id, name, local_path')                              │
│     │  .eq('owner_id', ownerId)                                     │
│     │  .eq('local_path', local_path)                                │
│     │                                                                │
│     └─ If found: return 409 Conflict ✗                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 2: DATABASE INSERT                                             ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  supabase.from('projects').insert(payload)                          │
│  ├─ payload:                                                         │
│  │  ├─ owner_id: ownerId (UUID)                                     │
│  │  ├─ name: string                                                  │
│  │  ├─ description: string | null                                    │
│  │  ├─ local_path: string | null                                     │
│  │  └─ auto_sync: boolean                                            │
│  │                                                                  │
│  └─ Returns: data (Project object)                                   │
│     ├─ id: uuid-project-123                                         │
│     ├─ owner_id: uuid-user-456                                      │
│     ├─ name: "My Project"                                           │
│     ├─ local_path: "/home/user/Videos"                              │
│     ├─ snapshot_url: null ← IMPORTANT                               │
│     ├─ snapshot_generated_at: null ← IMPORTANT                      │
│     └─ created_at: 2025-11-19T10:00:00Z                             │
│                                                                      │
│  ✓ Synchronous - waits for DB response                              │
│  ✗ Issue: snapshot_url not populated yet                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 3: DEVICE LOOKUP FOR SYNCTHING                                 ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  supabase.from('devices')                                            │
│  ├─ .select('syncthing_id')                                          │
│  ├─ .eq('user_id', ownerId)                                          │
│  ├─ .limit(1)                                                        │
│  │                                                                  │
│  └─ Returns: devices[0]?                                             │
│     └─ { syncthing_id: "XXXX-XXXX-XXXX-XXXX" }                       │
│                                                                      │
│  ✗ Issue: Device might not exist                                    │
│           → Folder never created                                     │
│           → No files in snapshot                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 4: CREATE SYNCTHING FOLDER                                     ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  syncthingService.createFolder(                                      │
│    projectId,                  // "uuid-123"                         │
│    name,                        // "My Project"                      │
│    local_path,                  // "/home/user/Videos"               │
│    syncthing_device_id          // "XXXX-..."                        │
│  )                                                                   │
│                                                                      │
│  ├─ HTTP PUT /rest/config/folders/{projectId}                        │
│  │                                                                  │
│  │  Headers:                                                         │
│  │  ├─ X-API-Key: {apiKey}                                           │
│  │  └─ Content-Type: application/json                                │
│  │                                                                  │
│  │  Body:                                                            │
│  │  {                                                                 │
│  │    "id": "uuid-123",                                              │
│  │    "label": "Project: My Project",                                │
│  │    "path": "/home/user/Videos",                                   │
│  │    "type": "sendreceive",                                         │
│  │    "devices": [{ "deviceID": "XXXX-..." }],                       │
│  │    "rescanIntervalS": 3600,                                       │
│  │    "fsWatcherEnabled": true                                       │
│  │  }                                                                 │
│  │                                                                  │
│  ├─ Response: 200 OK                                                 │
│  │                                                                  │
│  │  ✓ Folder config sent to Syncthing                               │
│  │  ✗ But folder hasn't indexed files yet!                          │
│  │                                                                  │
│  └─ Syncthing state:                                                 │
│     ├─ Folder created                                                │
│     ├─ Starting to scan directory                                    │
│     ├─ Not all files indexed yet                                     │
│     └─ Will emit LocalIndexUpdated event when done                   │
│                                                                      │
│  ✓ Synchronous - waits for HTTP response                            │
│  ✗ Issue: Timing gap before events/indexing complete               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 5: WAIT FOR FOLDER SCAN - EVENT STREAM                         ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  syncthingService.waitForFolderScanned(projectId, 60000)            │
│                                                                      │
│  ├─ Open persistent GET connection:                                  │
│  │  GET /rest/events?since=0                                         │
│  │  Headers: X-API-Key: {apiKey}                                     │
│  │  Connection: keep-alive                                           │
│  │                                                                  │
│  ├─ Syncthing streams events as they occur:                          │
│  │  [ {event}, {event}, {event}, ... ]                              │
│  │                                                                  │
│  ├─ Parser loops through buffer:                                     │
│  │  ├─ Skip '[', ']', ','                                            │
│  │  ├─ Extract JSON objects by brace count                           │
│  │  ├─ Parse each: JSON.parse(eventStr)                             │
│  │  └─ Check: event.type === 'LocalIndexUpdated'                    │
│  │           && event.data?.folder === projectId                    │
│  │                                                                  │
│  ├─ Possible Outcomes:                                               │
│  │  ├─ ✓ LocalIndexUpdated received                                 │
│  │  │   ├─ Resolve promise                                          │
│  │  │   ├─ Destroy stream connection                                 │
│  │  │   └─ Index is complete!                                       │
│  │  │                                                                │
│  │  ├─ ✗ Timeout after 60 seconds                                   │
│  │  │   ├─ Warn user                                                │
│  │  │   ├─ Close stream                                             │
│  │  │   ├─ Continue anyway (might still have files)                 │
│  │  │   └─ Proceed to next stage                                    │
│  │  │                                                                │
│  │  └─ ✗ Stream closes unexpectedly                                 │
│  │      ├─ Reject with error                                        │
│  │      └─ Fail creation                                            │
│  │                                                                  │
│  └─ Syncthing Events During Scan:                                    │
│     ├─ Starting state                                                │
│     ├─ RemoteIndexUpdated (if syncing from other device)             │
│     ├─ ItemFinished (for each file)                                  │
│     ├─ ItemStarted (if resuming)                                     │
│     └─ LocalIndexUpdated ← WE'RE LISTENING FOR THIS                 │
│        └─ Emitted when: All files indexed locally                    │
│                         Includes: items count                        │
│                         Ready to: Browse/fetch files                 │
│                                                                      │
│  ⏳ Typical duration: 1-3 seconds (empty folder)                     │
│                       up to 60 seconds (timeout)                     │
│                                                                      │
│  ✗ Issue: Can timeout silently if event never fires                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 6: FETCH FILE LIST - BROWSE API                                ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  syncthingService.getFolderFiles(projectId, 10)                      │
│                                                                      │
│  ├─ Retry loop with exponential backoff:                             │
│  │  ├─ Attempt 1: Wait 500ms, then GET request                      │
│  │  ├─ Attempt 2: Wait 1s, then GET request                         │
│  │  ├─ Attempt 3: Wait 2s, then GET request                         │
│  │  └─ All fail: Throw error (fail creation)                        │
│  │                                                                  │
│  ├─ GET /rest/db/browse?folder={projectId}&levels=10&prefix=       │
│  │                                                                  │
│  │  Response Structure (VARIES):                                     │
│  │                                                                  │
│  │  Format A: Direct Array                                           │
│  │  [                                                                │
│  │    { name: "file.txt", type: "file", size: 1024, children: [] }, │
│  │    { name: "folder", type: "dir", children: [...] }              │
│  │  ]                                                                │
│  │                                                                  │
│  │  Format B: Wrapped Object                                         │
│  │  {                                                                │
│  │    children: [                                                    │
│  │      { name: "file.txt", type: "file", size: 1024 },             │
│  │      ...                                                          │
│  │    ]                                                              │
│  │  }                                                                │
│  │                                                                  │
│  │  Format C: Root Folder Object                                     │
│  │  {                                                                │
│  │    type: "dir",                                                   │
│  │    name: "Videos",                                                │
│  │    children: [                                                    │
│  │      { name: "video.mp4", type: "file", size: 1000000 },         │
│  │      ...                                                          │
│  │    ]                                                              │
│  │  }                                                                │
│  │                                                                  │
│  ├─ Detection Logic:                                                 │
│  │  ├─ if (Array.isArray(browseData)) → use Format A                │
│  │  ├─ else if (browseData?.children) → use Format B                │
│  │  ├─ else if (browseData?.type === 'dir') → use Format C          │
│  │  └─ else → WARNING, return [] ← SILENT FAIL!                    │
│  │                                                                  │
│  ├─ Recursive Flattening:                                            │
│  │  flatten(items, prefix='', depth=0):                             │
│  │  ├─ For each item:                                                │
│  │  │  ├─ path = prefix + name                                      │
│  │  │  ├─ Add to files array                                        │
│  │  │  ├─ If item.children exists:                                  │
│  │  │  │  └─ Recurse: flatten(children, path, depth+1)             │
│  │  │  └─ Max depth: 10 (levels parameter)                          │
│  │  └─ Result: Flat array of all files                              │
│  │                                                                  │
│  ├─ Each file object:                                                │
│  │  {                                                                │
│  │    path: "subfolder/file.txt",                                   │
│  │    name: "file.txt",                                             │
│  │    type: "file" | "dir",                                         │
│  │    size: 1024000,                                                │
│  │    modTime: "2025-11-19T10:00:00Z",                              │
│  │    syncStatus: "synced" | "syncing" | "pending" | "error"        │
│  │  }                                                                │
│  │                                                                  │
│  └─ Returns: Array<FileObject>                                       │
│     or throws: Error if retries exhausted                            │
│                                                                      │
│  ✗ Issue: Response format variance                                  │
│           Unknown format → silent empty array                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 7: CONVERT TO SNAPSHOT FORMAT & SAVE                            ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  FileMetadataService.saveSnapshot(projectId, name, syncFiles)       │
│                                                                      │
│  ├─ Format Conversion:                                               │
│  │  Input (from Syncthing):                                          │
│  │  {                                                                │
│  │    path, name, type: "file"|"dir", size,                        │
│  │    modTime, syncStatus                                            │
│  │  }                                                                │
│  │                                                                  │
│  │  Output (Snapshot format):                                        │
│  │  {                                                                │
│  │    path, name, type: "file"|"folder",  ← Changed!               │
│  │    size, hash: "", modifiedAt           ← Fields differ         │
│  │  }                                                                │
│  │                                                                  │
│  │  Drop fields: syncStatus (not in snapshot)                       │
│  │  Add fields: hash (empty string)                                 │
│  │  Rename fields: modTime → modifiedAt                             │
│  │                                                                  │
│  ├─ Create JSON:                                                     │
│  │  {                                                                │
│  │    files: [ { path, name, type, size, hash, modifiedAt }, ... ], │
│  │    generatedAt: "2025-11-19T10:05:00Z",                          │
│  │    fileCount: 523,                                               │
│  │    totalSize: 50000000000  (50GB)                                │
│  │  }                                                                │
│  │                                                                  │
│  ├─ Compress to .gz:                                                 │
│  │  ├─ JSON.stringify(snapshotObject)                               │
│  │  ├─ zlib.gzip(jsonString) → binary buffer                        │
│  │  └─ Result: compressed snapshot                                  │
│  │                                                                  │
│  ├─ Upload to Supabase Storage:                                      │
│  │  POST /storage/v1/object/snapshots/{projectId}-snapshot.json.gz  │
│  │  Content-Encoding: gzip                                          │
│  │  Authorization: Bearer {token}                                    │
│  │                                                                  │
│  │  Returns:                                                         │
│  │  { path: "snapshots/{projectId}-snapshot.json.gz" }              │
│  │                                                                  │
│  ├─ Store in DB:                                                     │
│  │  ✗ ISSUE: Snapshot URL NOT stored in projects table              │
│  │           Need separate UPDATE query                              │
│  │           But response already sent!                              │
│  │                                                                  │
│  └─ Result: Snapshot file exists in storage                          │
│            But project.snapshot_url = null in DB                     │
│            Client can't find it!                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ STAGE 8: SEND RESPONSE TO ELECTRON CLIENT                            ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  res.status(201).json({ project: data })                            │
│                                                                      │
│  Payload Sent:                                                       │
│  {                                                                   │
│    "project": {                                                      │
│      "id": "uuid-123",                                               │
│      "owner_id": "uuid-456",                                         │
│      "name": "My Project",                                           │
│      "description": "Home videos",                                   │
│      "local_path": "/home/user/Videos",                              │
│      "auto_sync": true,                                              │
│      "snapshot_url": null,          ← PROBLEM!                      │
│      "snapshot_generated_at": null, ← PROBLEM!                      │
│      "created_at": "2025-11-19T10:00:00Z",                           │
│      "updated_at": "2025-11-19T10:05:00Z"                            │
│    }                                                                 │
│  }                                                                   │
│                                                                      │
│  ✓ Project created                                                   │
│  ✓ Syncthing folder configured                                       │
│  ✓ Files indexed                                                     │
│  ✓ Snapshot generated and uploaded                                   │
│                                                                      │
│  ✗ But: snapshot_url not populated in response!                     │
│  ✗ But: Client receives null for snapshot_url                       │
│  ✗ But: File browser can't load files (no URL)                      │
│                                                                      │
│  Next steps required by client:                                      │
│  1. Call GET /api/projects/{id}                                      │
│  2. Poll until snapshot_url is not null                              │
│  3. Then download and display snapshot                               │
│                                                                      │
│  Total time: ~4-5 seconds                                            │
│              (PLUS additional polling time if snapshot_url delayed)  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. PROJECT SYNCING COMPLETE HANDLER CHAIN

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ USER ACTION: CLICK "START SYNCING"                                   ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  ProjectSyncControls.tsx                                             │
│  ├─ onClick handler                                                  │
│  ├─ Calls: window.api.syncthingStartForProject(projectId, localPath)│
│  └─ Waits for: Promise to resolve                                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ELECTRON IPC: SYNCTHING:STARTFORPROJECT                              ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  main.ts, Line 211                                                   │
│                                                                      │
│  ipcMain.handle('syncthing:startForProject', async (ev, params) => {│
│    return syncthingManager.startForProject(                          │
│      params.projectId,    // "uuid-123"                              │
│      params.localPath     // "/home/user/Videos"                     │
│    )                                                                 │
│  })                                                                  │
│                                                                      │
│  ✓ Async handler - waits for complete resolution                    │
│  ✗ But underlying implementation doesn't fully wait!                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ SYNCTHING MANAGER - MAIN THREAD (SYNCHRONOUS)                        ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩
│                                                                      │
│  syncthingManager.startForProject(projectId, localPath)              │
│  [syncthingManager.ts, Line 224]                                    │
│                                                                      │
│  ┌─ Step 1: Check Instance Map                                      │
│  │  if (this.instances.has(projectId)) {                            │
│  │    return { success: true, pid, homeDir }  ← Already running     │
│  │  }                                                                │
│  │  ✓ Prevents duplicate processes                                  │
│  │                                                                  │
│  ├─ Step 2: Resolve Syncthing Binary                                │
│  │  const binary = this.resolveBinary()                             │
│  │  ├─ Check: ./go-agent/bin/syncthing/syncthing                    │
│  │  ├─ Check: ../go-agent/bin/syncthing/syncthing                   │
│  │  ├─ Check: ../../../go-agent/bin/syncthing/syncthing             │
│  │  └─ Fallback: 'syncthing' (system PATH)                          │
│  │  ✓ Returns first found location                                  │
│  │  ✗ If not found: Returns 'syncthing', may fail on spawn         │
│  │                                                                  │
│  ├─ Step 3: Create Home Directory                                   │
│  │  const sharedHome = ~/.vidsync/syncthing/shared                  │
│  │  await fs.promises.mkdir(sharedHome, { recursive: true })        │
│  │  ✓ Ensures directory exists                                      │
│  │  ✗ May fail on permission denied                                 │
│  │                                                                  │
│  ├─ Step 4a: Check if Shared Instance Already Exists                │
│  │  if (this.sharedInstance && this.sharedInstance.process) {       │
│  │    // Reuse existing Syncthing process                           │
│  │    // Skip to Step 5                                             │
│  │  } else {                                                         │
│  │    // Create new shared instance (Step 4b)                       │
│  │  }                                                                │
│  │                                                                  │
│  ├─ Step 4b: Spawn New Syncthing Process (if needed)                │
│  │  const proc = spawn('syncthing', ['-home', sharedHome], {        │
│  │    stdio: ['ignore', 'pipe', 'pipe']                             │
│  │  })                                                               │
│  │                                                                  │
│  │  Listeners attached:                                             │
│  │  ├─ proc.stdout?.on('data', handler)                             │
│  │  │  └─ Logs: [Syncthing:shared] output lines                    │
│  │  │                                                                │
│  │  ├─ proc.stderr?.on('data', handler)                             │
│  │  │  └─ Logs: [Syncthing:shared Error] error lines               │
│  │  │                                                                │
│  │  └─ proc.on('exit', handler)                                     │
│  │     ├─ Logs: [Syncthing:shared] exited                          │
│  │     ├─ Clears: this.sharedInstance = null                        │
│  │     └─ Clears: this.instances.clear()  ← All projects!          │
│  │        (Critical: Shared shutdown kills all projects)            │
│  │                                                                  │
│  │  Syncthing Process State:                                        │
│  │  ├─ PID: process.pid                                             │
│  │  ├─ Status: Running                                              │
│  │  ├─ Creating: config.xml in sharedHome                           │
│  │  ├─ Initializing: Certificate generation                         │
│  │  ├─ Starting: REST API on port 8384                              │
│  │  └─ NOT YET: Folders registered or syncing                       │
│  │                                                                  │
│  ├─ Step 4c: Wait Fixed 1500ms for config.xml                       │
│  │  await new Promise(r => setTimeout(r, 1500))                     │
│  │  ├─ Hard-coded delay                                             │
│  │  ├─ Reason: Allow Syncthing to create config.xml                 │
│  │  ├─ ✗ ISSUE: What if system is slow?                            │
│  │  ├─ ✗ ISSUE: What if config.xml takes longer?                   │
│  │  ├─ ✗ ISSUE: No verification of file existence                   │
│  │  └─ ✗ ISSUE: May timeout if disk I/O slow                        │
│  │                                                                  │
│  ├─ Step 4d: Read API Key from config.xml                           │
│  │  const apiKey = await this.getApiKey(sharedHome)                 │
│  │  ├─ Read file: config.xml                                        │
│  │  ├─ Parse regex: /<apikey>([^<]+)<\/apikey>/                    │
│  │  ├─ Extract: apiKey = match[1]                                   │
│  │  └─ Return: string | null                                        │
│  │     ✓ If found: apiKey                                           │
│  │     ✗ If not found or file missing: null                         │
│  │                                                                  │
│  ├─ Step 4e: Store Shared Instance                                  │
│  │  const inst: InstanceInfo = {                                    │
│  │    process: proc,                 // ChildProcess object         │
│  │    homeDir: sharedHome,           // ~/.vidsync/syncthing/shared │
│  │    apiKey: apiKey || undefined    // API key or undefined        │
│  │  }                                                                │
│  │  this.sharedInstance = inst                                      │
│  │  ✓ Stored for future reuse                                       │
│  │                                                                  │
│  ├─ Fallback on Spawn Error: System Syncthing                        │
│  │  if (spawn error) {                                              │
│  │    const sys = this.findSystemSyncthingConfig()                  │
│  │    ├─ Check: ~/.config/syncthing/config.xml                      │
│  │    ├─ Check: ~/.config/Syncthing/config.xml                      │
│  │    └─ Check: ./syncthing/config.xml                              │
│  │    if (sys && sys.apiKey) {                                      │
│  │      const ready = await this.waitForSyncthingReady(sys.apiKey)  │
│  │      if (ready) {                                                │
│  │        this.sharedInstance = { process: null, homeDir, apiKey } │
│  │      } else {                                                    │
│  │        return { success: false, error: '...' }                   │
│  │      }                                                            │
│  │    } else {                                                      │
│  │      return { success: false, error: spawn error }               │
│  │    }                                                              │
│  │  }                                                                │
│  │  ✓ Fallback to system Syncthing if spawn fails                   │
│  │  ✗ User has to have system Syncthing installed                   │
│  │                                                                  │
│  └─ Step 5: Create Project Instance                                  │
│     const projectInstance: InstanceInfo = {                         │
│       process: this.sharedInstance.process,                         │
│       homeDir: this.sharedInstance.homeDir,                         │
│       localPath: localPath,         // "/home/user/Videos"          │
│       apiKey: this.sharedInstance.apiKey,                           │
│       folderConfigured: false       ← INITIAL STATE, NOT true       │
│     }                                                                │
│     this.instances.set(projectId, projectInstance)                  │
│     ✓ Project mapped to shared Syncthing                            │
│     ✗ folderConfigured = false means folder NOT yet added          │
│                                                                      │
│  🔴 RETURN IMMEDIATELY:                                             │
│     return {                                                         │
│       success: true,                                                │
│       pid: this.sharedInstance.process.pid,                         │
│       homeDir: this.sharedInstance.homeDir                          │
│     }                                                                │
│                                                                      │
│     ✓ Caller receives response (promise resolves)                   │
│     ✗ Folder configuration HASN'T STARTED YET                       │
│     ✗ Syncthing API might still be initializing                     │
│     ✗ folderConfigured = false, not true!                           │
│                                                                      │
│     CALLER THINKS: "Done!"                                           │
│     REALITY: "Just starting..." (in background)                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
               ┌─────────────────────────────┐
               │ CONTROL RETURNS TO CALLER   │
               │ (Renderer/Electron UI)      │
               │ Response: { success: true } │
               │ Time elapsed: ~1.5 seconds  │
               └─────────────────────────────┘
                              │
             ┌────────────────┴────────────────┐
             │                                 │
         UI THREAD                     BACKGROUND THREAD
         (Continues)                   (setImmediate callback)
             │                                 │
             │                                 ▼
             │                    ┌──────────────────────────────┐
             │                    │ CONFIGURE FOLDER (Async)      │
             │                    │ [setImmediate started here]   │
             │                    │                              │
             │                    │ if (localPath && apiKey &&   │
             │                    │     fs.existsSync(localPath))│
             │                    │ {                            │
             │                    │   setImmediate(async () => { │
             │                    │                              │
             ▼                    │   ┌─ Step 1: Wait Ready      │
        ┌─────────────────────┐   │   │                          │
        │ Update UI Display   │   │   │ const ready =            │
        │ Show "Syncing!"     │   │   │ await this               │
        │                     │   │   │ .waitForSyncthingReady() │
        │ Fetch projects list │   │   │                          │
        │ Refresh data        │   │   │ Loop: Poll every 1s      │
        │                     │   │   │ Max: 30 seconds          │
        │ Show success alert  │   │   │                          │
        │ "Sync started"      │   │   │ ⏳ WAITING...            │
        │                     │   │   │                          │
        │ ✓ Immediate         │   │   │ GET /rest/system/status  │
        │ ✓ Visible to user   │   │   │ └─ Connection failed     │
        │ ✓ No delay          │   │   │    (Syncthing not ready) │
        │                     │   │   │ Wait 1s, try again       │
        │ ✗ BUT: Folder NOT   │   │   │                          │
        │   configured yet!   │   │   │ GET /rest/system/status  │
        │ ✗ BUT: Syncing NOT  │   │   │ └─ Connection failed     │
        │   actually started! │   │   │    (Still not ready)     │
        │                     │   │   │ Wait 1s, try again       │
        │                     │   │   │                          │
        │                     │   │   │ GET /rest/system/status  │
        │                     │   │   │ └─ 200 OK! ✓             │
        │                     │   │   │                          │
        │                     │   │   │ ┌─ Step 2: Add Folder   │
        │                     │   │   │ │                        │
        │                     │   │   │ │ PUT /rest/config/      │
        │                     │   │   │ │     folders/{id}       │
        │                     │   │   │ │                        │
        │                     │   │   │ │ Payload:               │
        │                     │   │   │ │ {                      │
        │                     │   │   │ │   id: projectId,       │
        │                     │   │   │ │   label: name,         │
        │                     │   │   │ │   path: localPath,     │
        │                     │   │   │ │   type: "sendreceive", │
        │                     │   │   │ │   devices: [...]       │
        │                     │   │   │ │ }                      │
        │                     │   │   │ │                        │
        │                     │   │   │ │ Response: 200 OK ✓     │
        │                     │   │   │ │ Folder added!          │
        │                     │   │   │ │                        │
        │                     │   │   │ └─ Folder Ready ✓        │
        │                     │   │   │                          │
        │                     │   │   │ ┌─ Step 3: Update State │
        │                     │   │   │ │                        │
        │                     │   │   │ │ const inst =           │
        │                     │   │   │ │ this.instances         │
        │                     │   │   │ │ .get(projectId)        │
        │                     │   │   │ │                        │
        │                     │   │   │ │ if (inst) {             │
        │                     │   │   │ │   inst.folderConfigured│
        │                     │   │   │ │   = true               │
        │                     │   │   │ │ }                      │
        │                     │   │   │ │                        │
        │                     │   │   │ └─ NOW Ready! ✓          │
        │                     │   │   │                          │
        │                     │   │   │ [Total time: ~2.5-3s]   │
        │                     │   │   │                          │
        │                     │   │   │ Error Handling:          │
        │                     │   │   │ ├─ try/catch wraps all  │
        │                     │   │   │ ├─ if (isDevelopment()) │
        │                     │   │   │ │   console.error(e)     │
        │                     │   │   │ ├─ Else: SILENT FAIL     │
        │                     │   │   │ ├─ No return to caller   │
        │                     │   │   │ ├─ No UI update         │
        │                     │   │   │ └─ No indication!       │
        │                     │   │   │                          │
        │                     │   │   └─ End setImmediate       │
        │                     │   │                              │
        │                     │   })  // ← End callback         │
        │                     │ }                                │
        │                     │                                  │
        │                     └──────────────────────────────┘
        │
        │ ~1500ms          ~3500-4000ms
        │ (callback sent   (callback completes)
        │  to background)
        │
        ▼
   ┌─────────────────────┐
   │ UI UPDATES COMPLETE │
   │ User sees success   │
   │ Projects refreshed  │
   │ BUT...              │
   │                     │
   │ ⚠ folderConfigured  │
   │   STILL FALSE in    │
   │   shared instance   │
   │   (user can't see)  │
   │                     │
   │ ⚠ Sync might not    │
   │   actually start    │
   │   if background     │
   │   thread encounters │
   │   errors            │
   │                     │
   │ ✗ No error message  │
   │   shown to user     │
   │                     │
   └─────────────────────┘
```

---

## 3. TIMING COMPARISON

```
┌────────────────────────────────────────────────────────────────────┐
│ PROJECT GENERATION TIMELINE                                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ 0ms      User POSTs /projects                                      │
│          │                                                         │
│ 10ms     ├─ DB Insert complete                                     │
│          │  project.id created                                     │
│          │                                                         │
│ 15ms     ├─ Device lookup complete                                 │
│          │  syncthing_id found                                     │
│          │                                                         │
│ 35ms     ├─ Syncthing folder created                               │
│          │  Folder config sent                                     │
│          │  [Syncthing starts scanning...]                        │
│          │                                                         │
│          │  ⏳ EVENT STREAM LISTENING                              │
│          │                                                         │
│ 1000ms   ├─ Syncthing still scanning...                            │
│ 2000ms   ├─ Still indexing files...                                │
│ 3000ms   ├─ LocalIndexUpdated event! ✓                             │
│          │  Index complete                                         │
│          │                                                         │
│ 3010ms   ├─ File list fetched                                      │
│          │  Syncthing /rest/db/browse returned 523 files         │
│          │                                                         │
│ 3100ms   ├─ Snapshot converted & compressed                        │
│          │  .json.gz created                                      │
│          │                                                         │
│ 3200ms   ├─ Snapshot uploaded to Supabase                          │
│          │                                                         │
│ 3210ms   └─ RESPONSE SENT ← snapshot_url = null!                  │
│             ✗ Problem: snapshot_url NOT in response               │
│             ✓ But: Snapshot file exists in storage                │
│                                                                    │
│ Duration: ~3.2 seconds                                             │
│ Result: Project created, snapshot generated, but URL not returned │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ PROJECT SYNCING TIMELINE                                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ MAIN THREAD:                                                        │
│ 0ms      User clicks START SYNC                                    │
│          │                                                         │
│ 1ms      ├─ IPC handler called                                     │
│          │  syncthingManager.startForProject()                     │
│          │                                                         │
│ 5ms      ├─ Instance check                                         │
│          │  Not found (first time)                                 │
│          │                                                         │
│ 10ms     ├─ Binary path resolved                                   │
│          │  Found: ./go-agent/bin/syncthing                        │
│          │                                                         │
│ 15ms     ├─ Home dir created                                       │
│          │  ~/.vidsync/syncthing/shared                            │
│          │                                                         │
│ 20ms     ├─ Spawn Syncthing process                                │
│          │  [Syncthing initializing...]                           │
│          │  PID: 12345                                             │
│          │                                                         │
│ 25ms     ├─ Listeners attached                                     │
│          │  stdout, stderr, exit handlers                          │
│          │                                                         │
│          │  ⏸ WAIT 1500ms FOR CONFIG.XML                          │
│          │                                                         │
│ 1500ms   ├─ config.xml should exist                                │
│          │  [Syncthing still initializing API...]                 │
│          │                                                         │
│ 1510ms   ├─ API key read                                           │
│          │  apiKey = "abc123xyz..."                                │
│          │                                                         │
│ 1515ms   ├─ Instance map entry created                             │
│          │  { process, homeDir, localPath, apiKey,               │
│          │    folderConfigured: false }                            │
│          │                                                         │
│ 1516ms   └─ RESPONSE SENT ← { success: true }                      │
│             ✗ folderConfigured = false!                            │
│             ✓ process started                                      │
│                                                                    │
│ BACKGROUND THREAD (setImmediate callback):                         │
│ 1517ms   ├─ Callback started                                       │
│          │  [Main thread continues...]                            │
│          │                                                         │
│          │  ⏳ WAIT FOR SYNCTHING READY                           │
│          │  Polling /rest/system/status                            │
│          │                                                         │
│ 2000ms   ├─ Poll attempt 1: Failed (not ready)                     │
│ 3000ms   ├─ Poll attempt 2: Failed (still not ready)               │
│ 4000ms   ├─ Poll attempt 3: Success! ✓                             │
│          │  /rest/system/status returned 200 OK                    │
│          │  Syncthing API is now responsive                        │
│          │                                                         │
│ 4010ms   ├─ PUT /rest/config/folders/{id}                          │
│          │  Add folder configuration                              │
│          │  folderConfigured = true                                │
│          │                                                         │
│ 4020ms   └─ Callback complete                                      │
│             ✓ Folder now configured                                │
│             ✓ Syncing can begin                                    │
│                                                                    │
│ Total Main: 1.5 seconds (caller gets response)                    │
│ Total Background: 2.5 seconds (folder setup completes)             │
│                                                                    │
│ PROBLEM: 1 second gap!                                             │
│ Caller has response but folder not yet configured                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

These diagrams show the complete event chains with all the async/await ordering issues and JSON data type handling problems.
