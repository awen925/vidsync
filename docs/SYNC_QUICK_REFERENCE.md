# 📊 Sync Architecture - Quick Reference

## Current App State

```
✅ Invite & Join
✅ File Metadata Storage
✅ Permission System
✅ Event Logging

❌ File Transfer
❌ Download Queue
❌ Progress Tracking
```

---

## Member's Journey (What Should Happen)

```
1. User joins project via invite token
   ↓
2. Opens "Invited Projects" → Clicks project
   ↓
3. Sees list of files (via /files-paginated)
   - File name, size, modified date, owner
   - Clickable, downloadable
   ↓
4. Clicks "Download" on report.pdf
   ↓
5. Dialog shows: "Requesting file from owner..."
   ↓
6. Owner gets notification: "John wants report.pdf"
   ↓
7. Owner's app sends file (via HTTP/P2P)
   ↓
8. Progress bar: "Downloading report.pdf (45%)"
   ↓
9. Complete: ✅ "report.pdf saved to /Downloads"
   ↓
10. Next sync: Member already has it, skip
```

---

## Data Flow

```
MEMBER                          BACKEND                         OWNER

Click Download
  ↓
POST /files/download
  ├──────────────────────→ Create record in
  │                         file_transfers table
  │
  │                         Broadcast via WebSocket
  │                         ←────────────────────── Get notification
  │
  │                                                Poll /transfers
  │                                                ←──────────────
  │
  │                                                Send file chunks
  │                    PATCH /transfers/:id ←─────────────────────
  │                    (update bytes_transferred)
  │
  │                         Notify via WebSocket
  │ ←───────────────────────────────────────────
  │
Show progress
  │
  ├──────────────────────→ GET /transfers/:id
  │                         Check status
  │
Receive all chunks
  │
Verify hash
  │
Save locally ✅
```

---

## Database Schema (to add)

```
file_transfers
├── id (UUID)
├── project_id (UUID FK)
├── requester_id (UUID FK → auth.users)
├── file_path (TEXT)
├── file_hash (TEXT)
├── source_device_id (UUID FK → devices)
├── status (pending|in_progress|completed|failed)
├── bytes_transferred (INTEGER)
├── total_bytes (INTEGER)
└── created_at (TIMESTAMP)

transfer_events
├── id (UUID)
├── transfer_id (UUID FK)
├── event_type (started|progress|completed|failed)
├── event_data (JSONB)
└── created_at (TIMESTAMP)
```

---

## API Endpoints (to add)

```
POST /projects/:projectId/files/download
  → Member requests file
  → Creates file_transfers record

GET /projects/:projectId/transfers
  → List pending/active transfers
  → Owner polls this

PATCH /projects/:projectId/transfers/:id
  → Update progress
  → Called by owner as file sends

GET /projects/:projectId/transfers/:id
  → Check transfer status
  → Member polls for progress
```

---

## WebSocket Events (to broadcast)

```
Member → Backend: "Download requested"
Backend → Owner: "transfer_requested"
  {file, requester, size}

Owner → Backend: "Sending file chunks"
Backend → Member: "transfer_progress"
  {percent, speed_mbps, eta}

Owner → Backend: "Transfer complete"
Backend → Member: "transfer_completed"
  {file_hash, size}

Owner → Backend: "Transfer failed"
Backend → Member: "transfer_failed"
  {error_message}
```

---

## Timeline to Completion

```
Phase 1: Database (30 min)
  - Create migration
  - Add tables & indexes
  - Update schema.sql

Phase 2: API (1 hour)
  - Download request endpoint
  - Transfer status endpoint
  - Progress update endpoint

Phase 3: Frontend (2-3 hours)
  - Download button UI
  - Progress modal
  - WebSocket listeners

Phase 4: Electron (3-4 hours)
  - Owner: Poll & send files
  - Member: Receive & verify
  - Local manifest updates

Total: ~6-9 hours implementation
```

---

## Ready?

Send command:
```
"Implement Phase 1: File transfer infrastructure"
```

I'll create:
1. Migration SQL
2. Updated schema.sql
3. Complete API endpoints
4. WebSocket handlers

Then Phase 2, 3, 4 follow! 🚀
