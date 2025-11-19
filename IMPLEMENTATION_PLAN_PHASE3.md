# Vidsync Phase 3 - Implementation Plan (9 Major Tasks)

**Date**: November 18, 2025  
**Architecture**: Electron + Cloud (Node.js/TS) + Go-Agent (WebSocket on :29999)  
**Priority Order**: 9 → 1 (start with most critical)

---

## PHASE 3A: CRITICAL - Sync Verification & Architecture

### ⚠️ TASK 9 [MOST PRIORITY] - Test Transfer Speed & Sync Verification
**Objective**: Verify bi-directional vs uni-directional sync; ensure invited users can ONLY receive files  
**Status**: NOT STARTED - BLOCKING ALL OTHER TASKS

#### 9.1 Verify Syncthing Folder Configuration
- [ ] Check current folder type in cloud: `createFolder()` method
  - **Current Issue**: Folder type might be "sendreceive" instead of "receiveonly" for invitee
  - **Required Change**: 
    - Owner's device: `sendreceive` (can send AND receive)
    - Invitee's device: `receiveonly` (can ONLY receive, cannot send back)
  
**File**: `cloud/src/services/syncthingService.ts` → `createFolder()` method
```typescript
// MUST CHECK: Is folder type set correctly for each device?
// For owner device: type: 'sendreceive'
// For invitee device: type: 'receiveonly'
```

**Implementation Steps**:
1. Add `deviceType` parameter to `createFolder()` 
2. In folder config: set `folder.type` based on device role
3. When adding invitee device: use `addDeviceToFolder()` but ensure folder type is "receiveonly"
4. Backend logs: trace folder creation for both owner and invitee
5. **Test Case**: 
   - Owner creates project with 100 files
   - Invitee joins project
   - Verify invitee can see all 100 files (read-only)
   - Try invitee adding file → should fail or not sync back
   - Measure transfer speed between two local devices

#### 9.2 WebSocket Event Streaming from Go-Agent
- [ ] Listen to Go-Agent WebSocket (`:29999`) for sync events
  - **Current**: We poll Syncthing REST API
  - **Better**: Subscribe to real-time events via Go WebSocket
  
**Available Endpoints**:
- `ws://127.0.0.1:29999/v1/events` - Real-time events
- `ws://127.0.0.1:29999/v1/status` - Status updates
- `ws://127.0.0.1:29999/v1/device` - Device info

**Real-Time Events Available**:
- `FileTransferProgress` - Per-file transfer progress
- `SyncProgress` - Overall folder sync progress
- `TransferSpeed` - Current download/upload speed
- `SyncComplete` - When sync finishes for folder
- `SyncError` - Transfer errors

#### 9.3 Measure Transfer Speed
**To Add to Go-Agent Events**:
```go
type TransferSpeedEvent struct {
    Timestamp   time.Time
    FolderId    string
    BytesPerSec int64
    FilesPerSec int32
    ETA         time.Duration
    Percentage  int32  // 0-100
}
```

---

## PHASE 3B: ARCHITECTURE - Enable File Browser for Invited Projects

### TASK 1 [HARD] - File Browser for Invited Projects Page
**Objective**: Show interactive file browser (not flat list) for invited projects  
**Complexity**: HIGH - Impacts performance, UI, and UX  
**Status**: DEPENDS ON TASK 9

#### 1.1 Problem Analysis
Current State:
- Invited Projects: Flat file list with pagination (26k files!)
- Your Projects: File browser with drill-down navigation
- Issue: Pagination + flat list is terrible UX for large projects

**Solutions Comparison**:

| Solution | Pros | Cons | Performance |
|----------|------|------|-------------|
| **Lazy Load Tree** | Best UX, click drill down | Complex impl, API overhead | Good (O(n)) |
| **Virtual List** | Renders visible only | Still flat UX | Excellent |
| **Search First** | Fast for target finding | Hidden files | Fair |
| **Cached Tree** | Smooth navigation | High memory | Excellent |
| **Metadata Snapshot** | Minimal server load | Stale data risk | Excellent |

#### 1.2 RECOMMENDED SOLUTION: Hybrid Approach
**Phase 1**: Initial load uses Metadata Snapshot (ALREADY GENERATED ON CREATION!)
- File structure is in snapshot JSON
- Build tree client-side from snapshot
- NO NEW API CALLS needed
- Instant browser experience

**Phase 2**: Real-time sync shows live updates via WebSocket
- Update tree as files appear
- Show sync progress per folder

**Implementation**:
```typescript
// Use existing snapshot to build tree
const snapshot = await fetchSnapshot(projectId);
const fileTree = buildTreeFromSnapshot(snapshot);
// Render as interactive browser
```

#### 1.3 Payload Analysis
- Snapshot size: 2.4 MB per project (example) - already loaded
- Tree structure: Built in browser (NO extra API calls)
- Network: ZERO extra load!

**Action Items**:
1. [ ] Modify `/api/projects/{id}/files-list` to return snapshot as tree structure
2. [ ] Add `buildFileTree()` function in frontend
3. [ ] Implement tree UI component for invited projects
4. [ ] Show same drill-down UI as YourProjects page

---

## PHASE 3C: UI ENHANCEMENTS - Sync Controls & Progress

### TASK 2 - Sync/Pause Button
**Objective**: User can pause/resume sync for any project  
**Complexity**: LOW-MEDIUM  
**Dependencies**: Task 9 (folder config), Go-Agent WebSocket

#### 2.1 Backend Changes
**File**: `cloud/src/api/projects/routes.ts`
```typescript
// Add endpoints:
POST /projects/{id}/pause     // Pause syncing
POST /projects/{id}/resume    // Resume syncing
GET  /projects/{id}/sync-status // Get current pause state
```

**Implementation**:
```typescript
// Use syncthingService.pauseFolder(folderId)
// Use syncthingService.resumeFolder(folderId)
```

#### 2.2 Frontend Changes
**File**: `electron/src/renderer/components/Projects/YourProjectHeader.tsx`
```typescript
// Add button next to project name:
<IconButton 
  onClick={() => handleTogglePause()}
  icon={isPaused ? <Play/> : <Pause/>}
  label={isPaused ? "Resume" : "Pause"}
/>
```

#### 2.3 UI State
- Show indicator when paused (e.g., "⏸️ PAUSED")
- Button changes: Pause ↔ Resume
- Disable file list interactions when paused

---

### TASK 3 - Download Speed & Progress Display
**Objective**: Show real-time transfer speed and sync progress %  
**Complexity**: MEDIUM  
**Dependencies**: Task 9 (WebSocket events)

#### 3.1 Data Source
From Go-Agent WebSocket events:
```typescript
{
  type: 'TransferProgress',
  data: {
    folderId: string,
    currentBytes: number,
    totalBytes: number,
    percentage: number,      // 0-100
    bytesPerSec: number,     // Current speed
    filesRemaining: number,
    eta: string              // "5m 32s"
  }
}
```

#### 3.2 UI Components to Add

**Option A**: Per-Project Progress Header
```
┌─────────────────────────────────────────┐
│ Project: My Photos        ⏸️ 45% ▓▓░░░░ │
│ Speed: 2.5 MB/s • ETA: 12m 45s         │
└─────────────────────────────────────────┘
```

**Option B**: Global Progress Bar (at top of app)
```
Syncing 3 projects: 45% | 2.5 MB/s
```

**Recommendation**: Option A (per-project) + Option B (global overview)

#### 3.3 Implementation
1. [ ] Connect to Go-Agent WebSocket in Electron
2. [ ] Parse `TransferProgress` events
3. [ ] Update project progress state
4. [ ] Render progress bar with speed/ETA

---

## PHASE 3D: UX IMPROVEMENTS - Users & Device Management

### TASK 4 - Invited Users List
**Objective**: Owner sees who has access to shared project  
**Complexity**: LOW  
**Status**: Schema support exists (project_invites table)

#### 4.1 Backend Changes
**File**: `cloud/src/api/projects/routes.ts`
```typescript
// Add endpoint:
GET /projects/{id}/invites
// Returns: [{ id, email, status, joinedAt, lastSeen }]
```

#### 4.2 UI Changes
**File**: `electron/src/renderer/components/Projects/YourProjectSharedTab.tsx`
```typescript
// Add section: "Who has access"
// Show table:
// Email | Joined | Last Seen | Actions
// user@example.com | 2 days ago | 1h ago | Revoke
```

#### 4.3 Implementation
1. [ ] Query `project_invites` table for active invites
2. [ ] Join with `device_users` to get real-time activity
3. [ ] Show email, join date, last sync activity
4. [ ] Add "Revoke Access" button (disable device in Syncthing)

---

### TASK 5 - Settings: Default Download Path
**Objective**: Configure where projects sync locally  
**Complexity**: MEDIUM  
**Dependencies**: None

#### 5.1 Settings Structure
**Default**: `~/downloads/vidsync/`
**Per-Project Path**: `~/downloads/vidsync/{projectName}-{projectId}/`

#### 5.2 Backend Changes
**Database**: Add to `projects` table:
```sql
ALTER TABLE projects ADD COLUMN 
  local_download_path VARCHAR(1024) DEFAULT NULL;
```

**File**: `cloud/src/api/projects/routes.ts`
```typescript
// Add endpoint:
PUT /projects/{id}/download-path
// Body: { downloadPath: string }
```

#### 5.3 Frontend Changes
**New Settings Page**: `electron/src/renderer/pages/SettingsPage.tsx`
```typescript
// Settings sections:
// 1. Default Download Location
//    [Browse folder] ~/downloads/vidsync/
// 2. Per-Project Override (optional)
//    Project: My Files
//    [Browse folder] /custom/path/
```

#### 5.4 Validation
- [ ] Ensure path is writable
- [ ] Create path if doesn't exist
- [ ] Update Syncthing folder config with new path

---

### TASK 6 - Email to Devices Mapping
**Objective**: Verify 1 email → N devices relationship  
**Complexity**: LOW (mostly validation)

#### 6.1 Current Schema Check
```sql
SELECT * FROM device_users WHERE email = 'user@example.com';
-- Should return multiple devices based on subscription limit
```

**Subscription Limits** (to define):
- Free: 1 device
- Pro: 5 devices
- Business: Unlimited

#### 6.2 Validation Points
- [ ] Device creation: Check subscription limit
- [ ] Device list: Show all user's devices
- [ ] Project visibility: Filter by device

---

### TASK 7 - Device-Specific Project Filtering
**Objective**: User only sees projects for their current device  
**Complexity**: MEDIUM  
**Dependencies**: Database schema changes

#### 7.1 Problem
Current `/api/projects/list/owned` endpoint:
```typescript
// Returns ALL projects for owner_id
// BUT should return only for OWNER_ID + DEVICE_ID
```

#### 7.2 Solution
**Add to endpoint**:
```typescript
// New query:
SELECT projects 
FROM projects p
JOIN project_devices pd ON p.id = pd.project_id
WHERE p.owner_id = ? AND pd.device_id = ?
```

**Changes Required**:
1. [ ] Create `project_devices` junction table (if not exists)
2. [ ] On project creation: Insert owner_device_id
3. [ ] On device join: Insert device_id
4. [ ] Update `/api/projects/list/owned` to filter by device

#### 7.3 Migration
```sql
CREATE TABLE project_devices (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  device_id UUID NOT NULL REFERENCES devices(id),
  role VARCHAR(20),  -- 'owner', 'editor', 'viewer'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_device ON project_devices(project_id, device_id);
```

---

### TASK 8 - Subscription Plan Limits
**Objective**: Enforce plan-based feature limits  
**Complexity**: MEDIUM  
**Status**: Requires business logic

#### 8.1 Limits to Implement

| Feature | Free | Pro | Business |
|---------|------|-----|----------|
| Devices | 1 | 5 | Unlimited |
| Storage | 100 GB | 1 TB | Custom |
| Users/Project | 2 | 10 | Unlimited |
| Projects | 5 | 50 | Unlimited |

#### 8.2 Enforcement Points
1. [ ] Device creation: `POST /devices`
   - Check user's device count vs limit
2. [ ] Project creation: `POST /projects`
   - Check user's project count vs limit
3. [ ] Invite user: `POST /projects/{id}/invite`
   - Check project's user count vs limit

#### 8.3 Backend Changes
**File**: `cloud/src/lib/subscriptionService.ts` (NEW)
```typescript
export class SubscriptionService {
  static async getPlan(userId: string): Promise<PlanType>
  static async checkLimit(userId: string, resource: string): Promise<boolean>
}
```

---

## IMPLEMENTATION SEQUENCE

### 🔴 RED CRITICAL (Week 1)
1. **TASK 9**: Sync verification & WebSocket integration
   - [ ] Verify folder types (sendreceive vs receiveonly)
   - [ ] Connect to Go-Agent WebSocket (29999)
   - [ ] Test transfer speed measurement
   - **Blocker**: Everything else depends on this

### 🟠 HIGH PRIORITY (Week 2)
2. **TASK 1**: File browser for invited projects
   - [ ] Use existing snapshot metadata
   - [ ] Build tree structure client-side
   - [ ] Implement drill-down UI
   
3. **TASK 3**: Transfer speed & progress display
   - [ ] Add progress bars
   - [ ] Show download speed & ETA
   - [ ] Real-time WebSocket updates

4. **TASK 2**: Sync/Pause controls
   - [ ] Add pause/resume endpoints
   - [ ] UI buttons and states

### 🟡 MEDIUM PRIORITY (Week 3)
5. **TASK 7**: Device-specific filtering
   - [ ] Create `project_devices` table
   - [ ] Update `/list/owned` endpoint
   
6. **TASK 4**: Invited users list
   - [ ] Show who has access
   - [ ] Revoke functionality

7. **TASK 5**: Download path settings
   - [ ] Settings page
   - [ ] Path configuration per project

### 🟢 LOW PRIORITY (Week 4)
8. **TASK 6**: Email-to-devices validation (mostly testing)
9. **TASK 8**: Subscription limits (business logic)

---

## Key Insights

### Architecture Leverage Points
- ✅ **Snapshot already exists** - Use for file tree (Task 1)
- ✅ **Go-Agent WebSocket ready** - Use for real-time progress (Tasks 3, 9)
- ✅ **Syncthing folder types** - Already supported, just need configuration (Task 9)
- ✅ **Existing schema** - project_invites exists, just need to expose (Task 4)

### Performance Considerations
- Tree building happens **in browser** (not server)
- Snapshot reused (no extra API calls)
- WebSocket for real-time (not polling)
- Device filtering at DB query level (efficient)

### Critical Unknowns (To Verify)
1. Is current folder type "sendreceive" for both owner and invitee? (TASK 9)
2. Does Syncthing properly enforce "receiveonly" permissions? (TASK 9)
3. Can Go-Agent emit real-time transfer speed events? (TASK 9)

---

## Next Step

**START WITH TASK 9**: 
1. Verify Syncthing folder configuration
2. Check current behavior (can invitee send files back?)
3. Test transfer speed between devices
4. Then proceed with UI improvements

This ensures the **core sync logic is solid** before building UI on top.
