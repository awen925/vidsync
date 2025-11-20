# Phase 2c: Architecture & Flow Diagrams

## Overall System Architecture (Phase 2c Complete)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ELECTRON RENDERER (UI ONLY)                     │
│  React Components: YourProjectsPage, Dashboard, FileExplorer           │
│  Shows:                                                                 │
│  • Project list with status                                            │
│  • Create project dialog with progress                                 │
│  • File tree from snapshot                                             │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ IPC Channel
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN (IPC & HTTP CLIENT)                    │
│  GoAgentClient: HTTP REST client to local Go service                   │
│  Endpoints:                                                             │
│  • createProject()            (POST /api/v1/projects)                  │
│  • createProjectWithSnapshot()  (POST /api/v1/projects/with-snapshot)  │
│  • getProjectStatus()         (GET /api/v1/projects/{id})              │
│  • generateSnapshot()         (POST /api/v1/projects/{id}/snapshot)    │
└─────────────────────────┬───────────────────────────────────────────────┘
              HTTP REST (localhost:5001)
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GO SERVICE (LOCAL ORCHESTRATOR)                       │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ HTTP Handlers (routes.go)                                        │  │
│  │  • ProjectHandler.CreateProjectWithSnapshot()                    │  │
│  │  • FileHandler.GenerateSnapshot()                               │  │
│  │  • SyncHandler.*, DeviceHandler.*                               │  │
│  └────────────────────┬─────────────────────────────────────────────┘  │
│                       │                                                │
│  ┌────────────────────▼─────────────────────────────────────────────┐  │
│  │ Services Layer (Business Logic)                                  │  │
│  │                                                                  │  │
│  │  ProjectService:                                                │  │
│  │  ├─ CreateProject()                                             │  │
│  │  └─ CreateProjectWithSnapshot()  ← PHASE 2c NEW                │  │
│  │                                                                  │  │
│  │  FileService:                    ← PHASE 2c NEW                │  │
│  │  ├─ WaitForScanCompletion()                                     │  │
│  │  ├─ GenerateSnapshot()                                          │  │
│  │  ├─ GetFileTree()                                               │  │
│  │  └─ uploadSnapshotToCloud()                                     │  │
│  │                                                                  │  │
│  │  SyncService:                                                   │  │
│  │  ├─ StartSync(), PauseSync(), ResumeSync(), StopSync()        │  │
│  │  └─ All call CloudClient for status updates (Phase 2b)         │  │
│  │                                                                  │  │
│  │  DeviceService:                                                 │  │
│  │  └─ SyncDevice()  (calls CloudClient)                           │  │
│  │                                                                  │  │
│  └────────────┬──────────────────────────────────────────────────┘  │
│               │                                                     │
│  ┌────────────▼──────────────────────────────────────────────────┐  │
│  │ API Clients Layer (External Service Integration)              │  │
│  │                                                                │  │
│  │  SyncthingClient:                                              │  │
│  │  ├─ AddFolder(), RemoveFolder()                                │  │
│  │  ├─ AddDeviceToFolder(), RemoveDeviceFromFolder()             │  │
│  │  ├─ GetFolderStatus()                                          │  │
│  │  ├─ Rescan(), PauseFolder(), ResumeFolder()                    │  │
│  │  └─ BrowseFiles()  ← PHASE 2c NEW                              │  │
│  │                                                                │  │
│  │  CloudClient:                                                  │  │
│  │  ├─ PostWithAuth()                                             │  │
│  │  ├─ PutWithAuth()                                              │  │
│  │  └─ GetBaseURL()  ← PHASE 2c NEW                               │  │
│  │                                                                │  │
│  └────────────┬──────────────────────────────────────────────────┘  │
│               │                                                     │
│       ┌───────┴────────┬────────────────┐                          │
│       │                │                │                          │
└───────┼────────────────┼────────────────┼──────────────────────────┘
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌──────────────┐
   │Syncthing│    │ Cloud    │    │ Filesystem   │
   │API      │    │ API      │    │              │
   │:8384    │    │ :6666    │    │ (local)      │
   │         │    │ (dev)    │    │              │
   │File sync│    │Database  │    │Project path  │
   │daemon   │    │Storage   │    │              │
   │         │    │auth      │    │Files + dirs  │
   └─────────┘    └──────────┘    └──────────────┘
```

## Project Creation Flow: Phase 2c Async Event Order

```
USER INITIATES PROJECT CREATION
  │ (UI: Show "Creating project..." dialog)
  │
  ▼ HTTP POST /api/v1/projects/with-snapshot
┌────────────────────────────────────────────────────────────────┐
│ ProjectHandler.CreateProjectWithSnapshot(req)                   │
└────────────────────────────────────────────────────────────────┘
  │
  ▼
┌────────────────────────────────────────────────────────────────┐
│ ProjectService.CreateProjectWithSnapshot(ctx, req)              │
│                                                                 │
│ STEP 1: Create in Cloud Database                               │
│ ├─ cloudClient.PostWithAuth("/projects", {...}, token)        │
│ ├─ Response: { projectId: "proj_123", ... }                   │
│ └─ Extract: projectID = "proj_123"                             │
│    ├─ On Error: FAIL (return error)                            │
│    │  └─ No projectId → cannot proceed                         │
│    └─ On Success: CONTINUE                                     │
│                                                                 │
│ STEP 2: Create Syncthing Folder                                │
│ ├─ syncClient.AddFolder("proj_123", name, path)               │
│ ├─ Syncthing begins scanning files                             │
│ │  (status will be "scanning" or "syncing")                    │
│ └─ On Error: FAIL (return error)                               │
│    ├─ Folder not created → cannot sync                         │
│    └─ But project exists in cloud (orphaned)                   │
│                                                                 │
│ STEP 3: Spawn Background Task (NON-BLOCKING)                   │
│ │                                                               │
│ └─ go func() {  ← New goroutine, doesn't block HTTP response   │
│     ctx, cancel := context.WithTimeout(5*min)                 │
│     defer cancel()                                             │
│                                                                 │
│     FileService.GenerateSnapshot() {                           │
│       ├─ STEP 3a: Wait for Scan Completion                    │
│       │  ├─ Poll GetFolderStatus every 500ms                  │
│       │  ├─ Check: state != "scanning" && != "syncing"        │
│       │  ├─ Timeout: 120 seconds                              │
│       │  └─ Returns when: state = "idle" (or error on timeout)│
│       │                                                        │
│       ├─ STEP 3b: Get Folder Info                            │
│       │  ├─ GetFolderStatus() → { path: "/Users/.../proj" }  │
│       │  └─ folderPath = "/Users/.../proj"                    │
│       │                                                        │
│       ├─ STEP 3c: Browse Files (Filesystem Walk)             │
│       │  ├─ BrowseFiles(folderPath, maxDepth=0)              │
│       │  ├─ Walk filesystem tree                              │
│       │  └─ Collect: [ FileInfo {...}, FileInfo {...}, ... ]  │
│       │                                                        │
│       ├─ STEP 3d: Build JSON Snapshot                        │
│       │  ├─ snapshot := SnapshotMetadata{                     │
│       │  │   ProjectID: "proj_123",                           │
│       │  │   Files: [...],                                    │
│       │  │   FileCount: 1523,                                 │
│       │  │   TotalSize: 5GB,                                  │
│       │  │   CreatedAt: now,                                  │
│       │  │   SyncStatus: { state: "idle", ... }              │
│       │  └─ }                                                  │
│       │  └─ snapshotJSON := json.Marshal(snapshot)            │
│       │                                                        │
│       ├─ STEP 3e: Upload to Cloud Storage                    │
│       │  ├─ uploadSnapshotToCloud(                            │
│       │  │   projectId, snapshotJSON, token                   │
│       │  └─ )                                                  │
│       │  ├─ POST to cloud: /projects/proj_123/snapshot       │
│       │  ├─ Cloud: compress (gzip) + upload to bucket        │
│       │  ├─ Cloud: returns snapshotUrl                        │
│       │  └─ On Error: WARN (log, don't block)                │
│       │     └─ Snapshot still valid locally                  │
│       │                                                        │
│       └─ Log: "Snapshot generation completed"                 │
│     }  ← End FileService.GenerateSnapshot()                   │
│   }()  ← End background goroutine                             │
│                                                                 │
│ RETURN IMMEDIATELY: { ok: true, projectId: "proj_123" }       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
  │
  ▼ HTTP 200 Response
┌────────────────────────────────────────────────────────────────┐
│ Electron GoAgentClient receives response                        │
│ ├─ projectId = "proj_123"                                       │
│ └─ Return to caller                                             │
└────────────────────────────────────────────────────────────────┘
  │
  ▼ Electron Main Process
┌────────────────────────────────────────────────────────────────┐
│ YourProjectsPage.handleCreateProject()                          │
│ ├─ Close dialog                                                 │
│ ├─ Fetch projects again                                         │
│ ├─ Show "proj_123" in project list (status: creating)         │
│ └─ UI UNLOCKED - User can interact immediately                 │
└────────────────────────────────────────────────────────────────┘
  │
  ├─ UI IS NOW RESPONSIVE
  │
  ▼ (Meanwhile, in background Go service...)
┌────────────────────────────────────────────────────────────────┐
│ Snapshot generation continues in background                     │
│                                                                 │
│ Timeline example (for typical project):                         │
│ • t=0s    Scan begins (files being indexed)                    │
│ • t=15s   Scan completes (Syncthing indexed all files)        │
│ • t=16s   File browsing starts                                 │
│ • t=17s   JSON built, upload starts                            │
│ • t=20s   Upload completes, URL saved                          │
│ • Result: Project has snapshot with file tree                  │
│                                                                 │
│ If any step fails:                                              │
│ • Snapshot generation failure → WARN logged, project works    │
│ • Upload failure → WARN logged, local snapshot valid          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## Concurrent Operations: No Race Conditions

```
BEFORE (Phase 2b - Had race condition):
┌──────────────────────────────────┐
│ Electron calls Cloud API directly │
│ POST /projects                    │
└─────────────┬────────────────────┘
              │ Creates in cloud
              ▼
        ┌──────────┐
        │ Cloud DB │  ← Project created
        └──────────┘
              │
              ├─ Electron then calls Syncthing directly (RACE!)
              │
              ▼
        ┌──────────────┐
        │ Syncthing    │  ← Folder being created
        │ (scanning)   │  ← Status doesn't match cloud yet!
        └──────────────┘
                │
                ├─ File sync happening
                │ But status inconsistent between cloud & local

AFTER (Phase 2c - Ordered correctly):
┌─────────────────────────────────────────────────────┐
│ Go Service receives CreateProjectWithSnapshot       │
│ Runs SEQUENTIALLY in single process                 │
└─────────────────────────────────────────────────────┘
              │
              ▼ STEP 1
        ┌──────────┐
        │ Cloud DB │  ← Project created with projectId
        └─────┬────┘
              │ Returns: { projectId: "proj_123" }
              │
              ▼ STEP 2
        ┌──────────────────┐
        │ Syncthing        │  ← Folder created with SAME id
        │ (begins scan)    │  ← NOW id matches everywhere
        └──────────────────┘
              │
              ▼ STEP 3 (Background, non-blocking)
        ┌──────────────────┐
        │ Snapshot Gen     │  ← Runs independently
        │ (polls, browses) │  ← After scan done
        └──────────────────┘

Result: NO RACE CONDITIONS
- projectId consistent everywhere
- Data states guaranteed to match
- Background work doesn't block UI
```

## Error Handling Decision Tree

```
CreateProjectWithSnapshot() flow
        │
        ▼
Is Cloud Create successful?
├─ NO: Return error immediately (BLOCKING)
│      └─ Cannot get projectId → cannot continue
│      └─ Fail fast
│
└─ YES: Got projectId
        │
        ▼
    Is Syncthing Create successful?
    ├─ NO: Return error immediately (BLOCKING)
    │      └─ Folder not created → cannot sync
    │      └─ BUT: Project orphaned in cloud
    │           (could add cleanup logic)
    │
    └─ YES: Folder created
            │
            ▼
        Return to client immediately
        { ok: true, projectId }
            │
            ▼
        Spawn background goroutine
        FileService.GenerateSnapshot()
            │
            ▼
        Is Scan Wait successful?
        ├─ NO: Log warning
        │      └─ Scan never completed
        │      └─ Skip snapshot, project works
        │      └─ Continue gracefully
        │
        └─ YES: Scan completed
                │
                ▼
            Is File Browse successful?
            ├─ NO: Log warning
            │      └─ Couldn't read files
            │      └─ Skip snapshot
            │
            └─ YES: Got file list
                    │
                    ▼
                Is JSON Generation successful?
                ├─ NO: Log warning
                │      └─ Skip upload
                │
                └─ YES: JSON created
                        │
                        ▼
                    Is Upload successful?
                    ├─ NO: Log warning
                    │      └─ Snapshot still local
                    │      └─ Files still sync
                    │      └─ Non-critical
                    │
                    └─ YES: Uploaded!
                           └─ snapshotUrl saved
                           └─ Project complete

KEY PRINCIPLE:
• Critical path: Cloud → Syncthing (MUST succeed)
• Optional path: Snapshot → Upload (NICE to have)
• Local-first design: Works even if cloud upload fails
```

## Performance Characteristics

```
Timeline for Typical Project (5GB, ~1500 files):

    T=0s     HTTP Request received
             ├─ Cloud create: ~500ms
             │
    T=0.5s   Syncthing folder created
             ├─ Syncthing begins scanning
             │
    T=1s     HTTP Response sent (UI unlocked)
             ├─ createProjectWithSnapshot returns
             │ ├─ { ok: true, projectId: "proj_123" }
             │ └─ User sees project in list
             │
    T=1s     Background goroutine starts
             ├─ FileService.GenerateSnapshot()
             │
    T=1-15s  Syncthing scanning
             ├─ Indexing 1500 files
             │ └─ status.state = "scanning"
             │
    T=15s    Scan completes
             ├─ status.state = "idle"
             │ └─ WaitForScanCompletion returns
             │
    T=15-16s File browsing
             ├─ Walk 1500 files from disk
             │ └─ ~50ms for 1500 files
             │
    T=16-17s JSON generation
             ├─ Serialize to JSON
             │ └─ ~100ms for 1500 files
             │
    T=17-20s Network upload
             ├─ gzip + upload to Supabase
             │ └─ Time varies by network/size
             │
    T=20s    Complete!
             ├─ Snapshot in storage
             └─ Project ready for UI to display tree

Total UI blocked time: ~0ms (returns immediately)
Total snapshot time:   ~20s (happens in background)
```

## State Diagram: Project Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ Project States During Creation                          │
└─────────────────────────────────────────────────────────┘

[Not Started]
    │
    ▼ User clicks "Create Project"
┌──────────────────────┐
│ Creating             │ ← Show in UI with spinner
│ (in cloud)           │   POST /projects sent
└──────┬───────────────┘
       │ Cloud: OK
       ▼
┌──────────────────────┐
│ Setting Up           │ ← Show in UI
│ (Syncthing)          │   Folder creation in progress
└──────┬───────────────┘
       │ Syncthing: OK
       ▼
┌──────────────────────┐
│ Scanning Files       │ ← Show in UI  
│ (in background)      │   BG goroutine started
└──────┬───────────────┘
       │ background:
       ├─ WaitForScanCompletion (500ms polls)
       │
       ▼ (Syncthing completes scan after ~15s)
┌──────────────────────┐
│ Building Snapshot    │ ← Show in UI (if polling status)
│ (browsing files)     │   FileService working
└──────┬───────────────┘
       │
       ├─ BrowseFiles()
       ├─ Build JSON
       ├─ Compress
       │
       ▼
┌──────────────────────┐
│ Uploading Snapshot   │ ← Show in UI (if polling)
│ (to storage)         │   Network operation
└──────┬───────────────┘
       │
       ├─ Optional: If fails, log warning
       │           Project still works
       │
       ▼
┌──────────────────────┐
│ Ready                │ ← UI shows "ready"
│ (with snapshot)      │   File tree available
└──────────────────────┘

If snapshot fails at any step:
    └─ Still shows "Ready"
       but snapshot_url = null
       Users still see project and files sync
```

## Network Communication Sequence

```
ELECTRON → GO SERVICE → SYNCTHING & CLOUD

Electron                Go Service              Syncthing      Cloud API
   │                        │                       │             │
   │ POST /projects/        │                       │             │
   │ with-snapshot          │                       │             │
   │◄──────────────────────►│                       │             │
   │     HTTP Request       │                       │             │
   │                        │ POST /projects        │             │
   │                        │     (create)          │             │
   │                        │◄──────────────────────────────────────►
   │                        │  HTTP + Bearer token  │             │
   │                        │                       │             │
   │                        │ (receives projectId)  │             │
   │                        │◄──────────────────────────────────────┤
   │                        │                       │             │
   │                        │ AddFolder(projectId)  │             │
   │                        │◄──────────────────────►             │
   │                        │  REST API call        │             │
   │                        │                       │             │
   │ HTTP 200 Response      │ (returns immediately) │             │
   │ (projectId, ok=true)   │                       │             │
   │◄──────────────────────┤                       │             │
   │                        │                       │             │
   │ (UI unlocked)          │ ┌─────────────────────┴──┐          │
   │                        │ │ Background goroutine  │          │
   │                        │ └─────────────────────┬──┘          │
   │                        │                       │             │
   │ (polling status)       │ GetFolderStatus()     │             │
   │ [optional]             │◄──────────────────────►             │
   │                        │  Poll every 500ms     │             │
   │                        │  until state="idle"   │             │
   │                        │                       │             │
   │                        │ BrowseFiles()         │             │
   │                        │ (filesystem walk)     │             │
   │                        │                       │             │
   │                        │ POST /projects/{id}/  │             │
   │                        │     snapshot          │             │
   │                        │◄──────────────────────────────────────►
   │                        │  JSON + Bearer token  │             │
   │                        │  (optional)           │             │
   │                        │                       │             │
   │                        │ (snapshot in storage) │             │
   │                        │◄──────────────────────────────────────┤
   │                        │                       │             │
   │ (files sync normally)  │ GetFolderStatus()     │             │
   │                        │◄──────────────────────►             │
   │                        │ (monitor sync)        │             │
   │                        │                       │             │

Total HTTP roundtrips:
- 1 initial: POST /projects/with-snapshot (returns immediately)
- 1+ periodic: GET status (in background, optional)
- 1 optional: POST /snapshot (for storage upload)
```

