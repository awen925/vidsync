# Corrected Architecture: Go Service is Local Orchestrator

## Key Principle
**Go Service is LOCAL to each device and calls OUT to cloud, not the other way around.**

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Device A                                   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Electron Application                           │  │
│  │                                                             │  │
│  │  ┌──────────────────┐      ┌──────────────────┐            │  │
│  │  │   Renderer       │      │   Main Process   │            │  │
│  │  │   (React UI)     │      │  (IPC Handlers)  │            │  │
│  │  └────────┬─────────┘      └────────┬─────────┘            │  │
│  │           │                         │                       │  │
│  │           └─────────┬───────────────┘                       │  │
│  │                     │ IPC                                   │  │
│  │                     ↓                                       │  │
│  │          ┌──────────────────────┐                          │  │
│  │          │ IPC Handlers call    │                          │  │
│  │          │ GoAgentClient        │                          │  │
│  │          └──────────┬───────────┘                          │  │
│  │                     │ HTTP                                 │  │
│  └─────────────────────┼─────────────────────────────────────┘  │
│                        │                                         │
│  ┌─────────────────────▼─────────────────────────────────────┐  │
│  │          Go Service (Port 5001)                           │  │
│  │          LOCAL Orchestrator                               │  │
│  │                                                           │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │              HTTP Handlers                        │    │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  │         (routes.go - handles incoming requests)         │  │
│  │                                                           │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │         Business Logic Services                  │    │  │
│  │  │                                                  │    │  │
│  │  │  - ProjectService   (project operations)        │    │  │
│  │  │  - SyncService      (sync orchestration)        │    │  │
│  │  │  - DeviceService    (device management)         │    │  │
│  │  │  - FileService      (file operations)           │    │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  │                      ▲  ▲  ▲  ▲                           │  │
│  │                      │  │  │  │                           │  │
│  │           ┌──────────┘  │  │  └──────────┐               │  │
│  │           │             │  │             │               │  │
│  │  ┌────────▼────┐ ┌──────▼──▼──┐ ┌────────▼────┐          │  │
│  │  │SyncthingCli │ │CloudClient │ │FileScanner  │          │  │
│  │  │   (REST)    │ │  (HTTP)    │ │    (FS)     │          │  │
│  │  └────────┬────┘ └──────┬─────┘ └────────┬────┘          │  │
│  │           │             │               │                │  │
│  └───────────┼─────────────┼───────────────┼────────────────┘  │
│              │             │               │                    │
│              │             │               │                    │
│              │             │               ↓                    │
│              │             │          ┌─────────┐              │
│              │             │          │Local FS │              │
│              │             │          └─────────┘              │
│              │             │                                    │
│              ↓             │                                    │
│         ┌──────────────┐   │                                    │
│         │  Syncthing   │   │                                    │
│         │ (port 8384)  │   │                                    │
│         └──────────────┘   │                                    │
│              │              │                                    │
│              │ Syncs files  │                                    │
│              ↓              │                                    │
│         ┌──────────────┐    │                                    │
│         │  Local Files │    │                                    │
│         └──────────────┘    │                                    │
└──────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┘
          │ HTTP Calls (auth, db updates)
          │
          ↓
     ┌──────────────────────────────────────┐
     │        Cloud Server                  │
     │   (localhost:6666 in dev)            │
     │                                      │
     │  ┌──────────────────────────────┐   │
     │  │   API Routes                 │   │
     │  │                              │   │
     │  │ - Project CRUD               │   │
     │  │ - Device registration        │   │
     │  │ - Sync status updates        │   │
     │  │ - File metadata sync         │   │
     │  └──────────────────────────────┘   │
     │              ▲                       │
     │              │                       │
     │  ┌───────────▼──────────────────┐   │
     │  │   Supabase (Database)        │   │
     │  │                              │   │
     │  │ - projects table             │   │
     │  │ - devices table              │   │
     │  │ - project_members table      │   │
     │  │ - file_metadata table        │   │
     │  │ - sync_events table          │   │
     │  └──────────────────────────────┘   │
     │                                      │
     └──────────────────────────────────────┘
```

## Call Flows

### Flow 1: User Pauses Sync

```
Electron UI (Click "Pause")
  ↓
Electron Main: project:pauseSync IPC
  ↓
GoAgentClient.pauseSync(projectId, accessToken)
  ↓
HTTP POST http://localhost:5001/api/v1/projects/{projectId}/sync/pause
  Authorization: Bearer {accessToken}
  ↓
Go Service Handler: pauseSync
  ↓
SyncService.PauseSync()
  ├─ Call SyncthingClient.PauseFolder() → Syncthing (localhost:8384)
  ├─ Update DB via CloudClient
  └─ Return result
  ↓
HTTP Response back to Electron
  ↓
IPC Result back to Renderer UI
  ↓
UI Updates "Paused" status
```

### Flow 2: Cloud Server Requests Project Sync Status

```
Cloud Server needs current status
  ↓
Cloud calls Go Service: GET http://localhost:5001/api/v1/projects/{projectId}/sync/status
  Header: Authorization: Bearer {device_token}
  ↓
Go Service Handler: getSyncStatus
  ↓
SyncService.GetSyncStatus()
  ├─ Call SyncthingClient.GetFolderStatus()
  └─ Return current state
  ↓
HTTP Response with status
  ↓
Cloud updates DB with returned status
```

## Key Points

### ✅ Go Service Responsibilities
1. **Orchestrate LOCAL Syncthing** - Direct calls to localhost:8384
2. **Call Cloud API** - HTTP calls to cloud server for DB updates
3. **Manage LOCAL state** - File system, Syncthing config
4. **Device-local logic** - Per-device business decisions

### ✅ Cloud Server Responsibilities
1. **Manage GLOBAL state** - Users, projects, memberships
2. **Store PERSISTENT data** - Database of record
3. **Authenticate requests** - Validate access tokens
4. **Coordinate MULTI-DEVICE** - When devices interact

### ✅ Electron Responsibilities
1. **UI rendering only** - React components
2. **Delegate to Go Service** - All operations via IPC/HTTP
3. **Receive updates** - Status changes from Go service

### ✅ Flow of Authority
```
User Action (Electron UI)
  → Electron Main (trusted local process)
  → Go Service (trusted local service)
  → Syncthing (local daemon)
     + Cloud Server (for persistence)
```

## API Endpoints on Go Service

All endpoints at `http://localhost:5001/api/v1`:

**Protected with Bearer token (from Electron/Cloud):**
- `POST /projects` - Create project
- `GET /projects/{id}` - Get project
- `DELETE /projects/{id}` - Delete project
- `POST /projects/{id}/devices` - Add device
- `DELETE /projects/{id}/devices/{deviceId}` - Remove device
- `POST /projects/{id}/sync/start` - Start sync
- `POST /projects/{id}/sync/pause` - Pause sync
- `POST /projects/{id}/sync/resume` - Resume sync
- `POST /projects/{id}/sync/stop` - Stop sync
- `GET /projects/{id}/sync/status` - Get sync status
- `POST /projects/{id}/snapshot` - Generate snapshot
- `GET /projects/{id}/files` - List files
- `GET /projects/{id}/files-tree` - Get file tree

**Cloud Server Can Call:**
- `GET /devices/{deviceId}/status` - Check device status
- `POST /devices/sync` - Force device sync

## Environment Configuration

```bash
# Go Service knows where to find cloud:
CLOUD_URL=http://localhost:6666  # Development
CLOUD_URL=https://api.vidsync.app  # Production
CLOUD_API_KEY=xxx  # Or auth via token

# Go Service runs locally:
PORT=5001
SYNCTHING_URL=https://localhost:8384
SYNCTHING_API_KEY=xxx
```

## Implementation Status

- ✅ Phase 1: Go Service module structure complete
- ✅ Phase 2a: Electron IPC handlers delegate to Go service
- ⏳ Phase 2b: Add CloudClient calls from Go service to update DB
- ⏳ Phase 2c: Implement file operations
- ⏳ Phase 2d: Error handling and fallbacks
- ⏳ Phase 3: Update cloud endpoints to call Go service if needed
- ⏳ Phase 4: Production deployment and testing

## Benefits of This Architecture

1. **Independence** - Each device works independently, cloud is just persistence
2. **Resilience** - Go service works offline, syncs when cloud available
3. **Security** - Local Syncthing never exposed to internet
4. **Performance** - No latency on local operations
5. **Simplicity** - Clear separation: local orchestration vs global state
