# 🚀 Sync/Transfer - What's Done & What's Next

## Status Summary

### ✅ Completed Features
- Project creation & management
- Invite system (tokens, joining)
- Member permissions
- Remote file metadata storage
- File pagination API (`/files-paginated`) ← Members use this
- Delta change tracking
- Event sequencing
- WebSocket infrastructure

### 🔄 In Progress
- File transfer mechanism
- Download request API
- Progress tracking
- Real-time notifications

### ❌ Not Started
- Transfer queue persistence
- P2P/HTTP file transmission
- Local manifest sync
- Bandwidth optimization

---

## Problem You Reported

> "After joined, app tried to fetch files by calling /:projectId/files but it seems not working. It checked user_id = owner_id and returned 403 error code."

### Root Cause
`/files` endpoint is **owner-only** (local file system browsing)

### Solution
**Members should use** `/files-paginated` instead (remote files)

I've updated the endpoint to clarify this.

---

## File Browsing Flow

### Owner
```
GET /projects/:projectId/files
→ Browse local disk files
```

### Member
```
GET /projects/:projectId/files-paginated?path=/&page=1
→ Browse remote metadata
→ See what's available to download
```

---

## Complete Sync Flow (What Needs to Happen)

```
1. Member views files
   GET /projects/:projectId/files-paginated
   ↓
2. Member clicks "Download report.pdf"
   ↓
3. Member requests download
   POST /projects/:projectId/files/download
   {file_path: "/documents/report.pdf"}
   ↓
4. Backend creates transfer record
   ↓
5. Owner's app polls for requests
   GET /projects/:projectId/transfers?status=pending
   ↓
6. Owner's app sends file to member
   (Via HTTP/P2P/Nebula)
   ↓
7. Owner sends progress updates
   PATCH /projects/:projectId/transfers/:id
   {bytes_transferred: 512000}
   ↓
8. Member receives file & verifies hash
   ↓
9. Member saves locally
   ↓
✅ File synced!
```

---

## Database Changes Needed

### New Table: `file_transfers`
```sql
CREATE TABLE file_transfers (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  requester_id UUID NOT NULL,        -- member requesting download
  file_path TEXT NOT NULL,
  file_hash TEXT,
  source_device_id UUID NOT NULL,    -- owner's device sending
  status TEXT DEFAULT 'pending',     -- pending → in_progress → completed
  bytes_transferred INTEGER,
  total_bytes INTEGER,
  error_message TEXT,
  created_at TIMESTAMP
);
```

### New Table: `transfer_events`
```sql
CREATE TABLE transfer_events (
  id UUID PRIMARY KEY,
  transfer_id UUID NOT NULL,
  event_type TEXT,  -- started, progress, completed, failed
  event_data JSONB, -- {bytes_transferred, speed, eta}
  created_at TIMESTAMP
);
```

---

## API Endpoints to Add

### 1. Member requests file
```
POST /api/projects/:projectId/files/download
{
  file_path: "/documents/report.pdf",
  file_hash: "abc123"
}
```

### 2. Owner checks pending requests
```
GET /api/projects/:projectId/transfers?status=pending
```

### 3. Owner updates transfer progress
```
PATCH /api/projects/:projectId/transfers/:transferId
{
  status: "in_progress",
  bytes_transferred: 512000
}
```

### 4. Member checks download progress
```
GET /api/projects/:projectId/transfers/:transferId
```

---

## Implementation Plan

### Phase 1 (Database)
- Create migration with `file_transfers` & `transfer_events` tables
- Add to `schema.sql`
- Set up indexes & permissions

### Phase 2 (API)
- POST `/files/download` - request download
- GET `/transfers` - list pending
- PATCH `/transfers/:id` - update progress
- GET `/transfers/:id` - check status

### Phase 3 (Client)
- Member UI: show download button, progress bar
- Owner Electron app: poll transfers, send file, update progress
- Member Electron app: receive file, verify, save

---

## Which Phase Do You Want to Tackle First?

### Option A: Just Database
```
"Implement Phase 1: File transfer database tables"
```

### Option B: Database + API
```
"Implement Phase 1 & 2: File transfer infrastructure"
```

### Option C: Complete Solution
```
"Implement full file transfer system"
```

Choose and I'll build it! 🚀
