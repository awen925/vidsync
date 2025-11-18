# 📁 File Sync/Transfer Complete Architecture

## Problem Analysis

Your app has the database layer but needs the **transfer logic** to complete the sync workflow:

```
❌ User joins project via invite
✅ Can see project details
✅ Can list files (via /files-paginated)
❌ BUT: Cannot download/sync files yet
```

---

## Solution: 3-Phase Implementation

### Phase 1: Database Layer (Next Step)
Add tables for tracking file transfers:
- `file_transfers` - track who's downloading what
- `transfer_events` - log progress updates
- Enables queuing and real-time tracking

### Phase 2: API Endpoints (Step After)
```
POST /files/download          - Member requests file
GET /transfers                - Owner sees pending requests
PATCH /transfers/:id          - Update download progress
GET /transfers/:id/status     - Member tracks progress
```

### Phase 3: Client Integration (Electron App)
```
Owner App:
  ↓ Polls /transfers?status=pending
  ↓ Reads local file
  ↓ Sends to member (HTTP or P2P)
  ↓ Updates progress via PATCH /transfers/:id

Member App:
  ↓ Clicks download on /files-paginated
  ↓ POST /files/download request
  ↓ Listens to WebSocket for progress
  ↓ Saves received file locally
```

---

## Current API Status

### ✅ Already Implemented
- `GET /projects/:projectId/files-paginated` - List files (members can use this!)
- `POST /projects/:projectId/files/update` - Owner publishes changes
- `GET /projects/:projectId/events` - Pull file change events
- WebSocket infrastructure (partial)

### ❌ Still Needed
- Download request mechanism
- Transfer queue/tracking
- Progress updates
- Real-time notifications

---

## File Browsing Fix

**Updated `/files` endpoint:**
- Owner: Can browse local file system (unchanged)
- Member: Gets helpful error pointing to `/files-paginated` ✅

Members should use:
```ts
GET /projects/:projectId/files-paginated?path=/&page=1&per_page=100
```

Response:
```json
{
  "files": [
    {
      "name": "report.pdf",
      "path": "/documents/report.pdf",
      "size": 1048576,
      "is_directory": false,
      "mime_type": "application/pdf",
      "file_hash": "abc123def456",
      "modified_at": "2025-11-17T18:00:00Z",
      "owner_id": "owner-uuid"
    },
    ...
  ],
  "pagination": {
    "page": 1,
    "per_page": 100,
    "total": 245,
    "total_pages": 3,
    "has_more": true
  }
}
```

---

## High-Level Transfer Flow

```
MEMBER CLICKS "DOWNLOAD report.pdf"
  ↓
1. POST /projects/:projectId/files/download
   {
     file_path: "/documents/report.pdf",
     file_hash: "abc123def456"
   }
  ↓
2. Backend creates record in file_transfers table
   {
     status: "pending",
     requester_id: member-uuid,
     source_device_id: owner-device-uuid
   }
  ↓
3. WebSocket notifies OWNER'S DEVICE:
   "Member John requested: report.pdf (1MB)"
  ↓
4. OWNER'S APP READS:
   - Detects pending transfer in /transfers
   - Reads /home/owner/project/report.pdf
   - Establishes connection to member
  ↓
5. TRANSFER BEGINS:
   - Sends file chunks
   - Each chunk: PATCH /transfers/:id {bytes_transferred, status}
  ↓
6. TRANSFER COMPLETE:
   - PATCH /transfers/:id {status: "completed"}
   - Member receives file
  ↓
7. VERIFICATION:
   - Member computes hash
   - Compares with original hash
   - If match: ✅ File saved
   - If mismatch: ❌ Retry
  ↓
8. UPDATE LOCAL MANIFEST:
   - Member stores in local_files_manifest.json
   - Next sync: skip this file (already have it)
  ↓
MEMBER SEES: ✅ "report.pdf synced (1MB)"
```

---

## What's Required at Each Layer

### Backend (Cloud)
✅ Project & user management
✅ Remote file metadata storage
✅ Event sequencing
❌ **Transfer queue tracking** ← Need to add
❌ **Transfer progress API** ← Need to add
❌ **WebSocket handlers** ← Partially done

### Frontend (React)
- File list UI
- Download button
- Progress modal

### Electron App (Owner)
- Poll for pending transfers
- Read files from disk
- Send via HTTP/P2P
- Update progress

### Electron App (Member)
- Show download UI
- Listen to WebSocket
- Save received file
- Verify integrity

---

## Ready to Implement?

```
✅ Phase 1: Database tables + Migration
   → Creates file_transfers & transfer_events

✅ Phase 2: API Endpoints
   → POST /files/download
   → GET /transfers
   → PATCH /transfers/:id

✅ Phase 3: Frontend/Client
   → Download button + progress UI
   → Electron transfer logic
```

---

## Say Next:

**"Implement Phase 1: File transfer infrastructure"**

And I'll create:
1. Migration SQL for new tables
2. Updated schema.sql
3. Complete API endpoints
4. WebSocket event handlers

Then Phase 2 & 3 follow!

🚀
