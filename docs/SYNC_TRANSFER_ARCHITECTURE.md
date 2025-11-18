# 🔄 Sync/Transfer Architecture & Implementation Plan

## Current State

✅ **What Works:**
- Project creation & ownership
- Invite tokens & project joining
- Permission system (owner vs member)
- Remote files table with metadata
- Paginated file browsing (`/files-paginated`)
- Delta change tracking (`/files/update`)
- Event sequence logging (`/project_events`)

❌ **What's Incomplete:**
- Owner→Member file transfer mechanism
- Member download/sync flow
- Device assignment to members
- Real-time sync status
- Bandwidth-optimized transfer

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SYNC/TRANSFER FLOW                                │
└─────────────────────────────────────────────────────────────────────┘

OWNER SIDE:
  File Watcher (Electron)
    ↓ (detects changes)
  POST /projects/:projectId/files/update
    ↓ (sends deltas)
  Backend stores in remote_files + project_events
    ↓ (broadcasts to members via WebSocket)

MEMBER SIDE:
  GET /projects/:projectId/files-paginated
    ↓ (lists available files with metadata)
  User clicks download
    ↓ 
  POST /projects/:projectId/files/download
    ↓ (request download)
  Backend queues transfer job
    ↓
  WebSocket notifies owner's device
    ↓
  Owner's app sends file via P2P/HTTP
    ↓
  Member receives & stores locally
    ↓ (sync complete)

REAL-TIME UPDATES:
  WebSocket broadcasts:
    - File added/updated/deleted
    - Download requests
    - Sync progress
    - Error notifications
```

---

## Phase 1: Core Transfer Infrastructure

### 1.1 File Download Request Endpoint

**POST /api/projects/:projectId/files/download**

```ts
Request:
{
  file_path: "/documents/report.pdf",
  file_hash: "abc123def456",  // for integrity check
  request_mode: "full" | "delta"  // full copy or incremental
}

Response:
{
  success: true,
  download_id: "uuid",
  file: {
    path: "/documents/report.pdf",
    size: 1024000,
    hash: "abc123def456",
    mime_type: "application/pdf"
  },
  transfer_info: {
    protocol: "http" | "p2p",  // how to transfer
    source_device_id: "owner-device-uuid",
    expires_at: "2025-11-18T12:00:00Z"
  }
}
```

### 1.2 Download Queue Table

```sql
CREATE TABLE IF NOT EXISTS file_transfers (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  file_path TEXT NOT NULL,
  file_hash TEXT,
  source_device_id UUID NOT NULL REFERENCES devices(id),
  status TEXT DEFAULT 'pending',  -- pending, in_progress, completed, failed
  requested_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  bytes_transferred INTEGER DEFAULT 0,
  total_bytes INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_file_transfers_project_id ON file_transfers(project_id);
CREATE INDEX idx_file_transfers_requester_id ON file_transfers(requester_id);
CREATE INDEX idx_file_transfers_status ON file_transfers(status);
```

### 1.3 Transfer Events Log

```sql
CREATE TABLE IF NOT EXISTS transfer_events (
  id UUID PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES file_transfers(id) ON DELETE CASCADE,
  event_type TEXT,  -- started, progress, completed, failed, cancelled
  event_data JSONB,  -- {bytes_transferred, speed, eta}
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Phase 2: Member-Side Download Flow

### 2.1 List Downloadable Files

**GET /api/projects/:projectId/files-paginated**
- ✅ Already implemented
- Members see all files with metadata
- Includes: path, size, hash, mime_type, modified_at

### 2.2 Request Download

**POST /api/projects/:projectId/files/download**

```ts
// Member requests file
const { data: downloadReq, error } = await supabase
  .from('file_transfers')
  .insert({
    project_id: projectId,
    requester_id: userId,
    file_path: filePath,
    source_device_id: ownerDeviceId,
    status: 'pending'
  })
  .select()
  .single();

// Backend broadcasts to owner's device via WebSocket:
// "User <name> requested <file> (size: 10MB)"
```

### 2.3 Download Progress Tracking

**GET /api/projects/:projectId/transfers/:transferId**

```ts
{
  id: "uuid",
  status: "in_progress",
  bytes_transferred: 524288000,
  total_bytes: 1048576000,
  percent_complete: 50,
  speed_mbps: 12.5,
  eta_seconds: 40,
  source_device: {...}
}
```

---

## Phase 3: Owner-Side Upload Flow

### 3.1 Monitor Download Requests

Owner's Electron app polls:
**GET /api/projects/:projectId/transfers?status=pending**

### 3.2 Send File to Member

Owner's app reads local file and sends to:
1. **HTTP Server (for same-network):** Direct file transfer
2. **P2P (Nebula):** Encrypted tunnel transfer
3. **Cloud Relay (fallback):** Through Supabase storage

### 3.3 Update Transfer Progress

Owner sends updates:
**PATCH /api/projects/:projectId/transfers/:transferId**

```ts
{
  status: "in_progress",
  bytes_transferred: 524288000,
  completed_at: null  // still transferring
}
```

Triggers WebSocket broadcast to member about progress.

---

## Phase 4: Sync Completion & Verification

### 4.1 File Integrity Check

```ts
// After transfer completes
const downloadedHash = calculateHash(localFile);
const remoteHash = fileMetadata.hash;

if (downloadedHash === remoteHash) {
  // ✅ Verified
  UPDATE file_transfers SET status = 'completed'
} else {
  // ❌ Corrupted, retry
  UPDATE file_transfers SET status = 'failed'
}
```

### 4.2 Update Local Manifest

Member's app stores:
```ts
local_files_manifest.json:
{
  project_id: "uuid",
  synced_files: [
    {
      path: "/documents/report.pdf",
      local_path: "/home/user/Downloads/project1/report.pdf",
      hash: "abc123",
      synced_at: "2025-11-17T18:00:00Z",
      size: 1048576
    }
  ]
}
```

---

## Phase 5: Real-Time Status Updates (WebSocket)

### 5.1 Events Broadcast

```ts
// From owner to member
{
  type: 'file_transfer_progress',
  data: {
    file_path: "/documents/report.pdf",
    status: "in_progress",
    percent: 75,
    speed_mbps: 15.2,
    eta_seconds: 30
  }
}

{
  type: 'file_transfer_complete',
  data: {
    file_path: "/documents/report.pdf",
    hash: "abc123",
    size: 1048576,
    completed_at: "2025-11-17T18:05:00Z"
  }
}
```

### 5.2 Member Notifications

Member sees:
- 📥 "Downloading: report.pdf (75%)"
- ✅ "report.pdf synced"
- ❌ "Failed to download report.pdf (retry)"

---

## Implementation Roadmap

### ✅ Already Done
- [x] Remote files table & API
- [x] Paginated file browsing
- [x] Delta change tracking
- [x] Event sequencing
- [x] WebSocket infrastructure (partial)

### 🔧 Need to Implement (In Order)

**Step 1: File Transfer Infrastructure**
- Create `file_transfers` table
- Create `transfer_events` table
- Add to `schema.sql`
- Create migration

**Step 2: Download Request API**
- POST `/api/projects/:projectId/files/download` - request file
- GET `/api/projects/:projectId/transfers` - list pending transfers
- GET `/api/projects/:projectId/transfers/:transferId` - get progress
- PATCH `/api/projects/:projectId/transfers/:transferId` - update progress

**Step 3: Member-Side UI**
- File list component with download buttons
- Download progress modal
- Local sync manifest

**Step 4: Owner-Side Transfer Logic**
- Monitor `file_transfers` table for requests
- Read local files
- Send via HTTP/P2P
- Update progress
- Broadcast WebSocket events

**Step 5: Sync Verification**
- Hash verification on receive
- Retry logic for failed transfers
- Local manifest updates

---

## Quick Implementation Guide

### Start with Step 1: Database Schema

I can create a migration that adds:
```sql
-- file_transfers table
-- transfer_events table
-- Indexes for performance
-- Grant permissions to authenticated users
```

### Then Step 2: API Endpoints

```ts
// POST /files/download - request download
// GET /transfers - list pending
// PATCH /transfers/:id - update progress
```

### Then Step 3-5: Client-side

Frontend & Electron app handle UI and file operations.

---

## Key Design Decisions

✅ **Bandwidth Optimized**
- Delta sync (only changed files)
- Compression support
- P2P when possible (avoid cloud)

✅ **Reliable**
- Hash verification
- Retry logic
- Interrupt-resume support

✅ **Scalable**
- Event-based architecture
- WebSocket for real-time
- Database queue for persistence

✅ **Member-Friendly**
- No file system access required
- Simple download UI
- Progress tracking

---

## Next Steps

**Ready to implement?**

Say:
👉 **"Implement file transfer infrastructure"**

And I'll create:
1. Migration with all necessary tables
2. API endpoints (download request, progress tracking)
3. Documentation for frontend integration

Or ask questions about any part of the design!
