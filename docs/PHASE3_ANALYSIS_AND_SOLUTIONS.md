# Phase 3 - Analysis & Solutions (Tasks 1-9)

**Date**: November 19, 2025  
**Status**: Comprehensive analysis with recommended solutions

---

## TASK 9: Transfer Speed & Sync Verification ✅ PARTIALLY DONE

**Current Status**: Core architecture updated (receiveonly enforced), but NOT YET TESTED

### What We Did
1. ✅ Updated `SyncthingService` to enforce folder types
2. ✅ Added `AddFolderReceiveOnly()` to Go-Agent
3. ✅ Fixed device selection query in project join endpoint

### What Still Needs Testing
```
Owner Device: folder type = "sendreceive"
Invitee Device: folder type = "receiveonly"
```

**Test Plan**:
1. Owner creates project with 100+ files
2. Invitee joins project
3. Verify invitee receives ALL files (read-only)
4. Measure transfer speed: Should see MB/s rate
5. Try invitee adding file → Should FAIL or not sync back

**Port 29999 Status**: ✅ WebSocket server running on Go-Agent at `:29999`

---

## CRITICAL: Using Port 29999 WebSocket for Enhanced Sync Logic

### Current vs. Proposed

**Current Architecture**:
```
Electron App (your device)
    ↓
    Polls Syncthing REST API (:8384)
    ↓
    Gets status, folder info, files
    ↓
    LIMITED: Only snapshots, no real-time sync progress
```

**Proposed Architecture** (Better):
```
Electron App (your device)
    ↓
    Connects to Go-Agent WebSocket (:29999)
    ↓
    Receives REAL-TIME events:
    - FileTransferProgress
    - SyncProgress (0-100%)
    - TransferSpeed (MB/s, files/sec)
    - SyncComplete
    - SyncError
    ↓
    Instant UI updates (no polling!)
```

### Advantages of WebSocket Approach
1. **Real-time**: No polling delay → instant UI updates
2. **Bandwidth**: Uses events instead of constant API calls
3. **Accurate Progress**: Get actual bytes transferred, not guesses
4. **Better UX**: Show speed, ETA, per-file progress

---

## TASK 1: File Browser for Invited Projects

### Problem
Current UI shows flat list with pagination (26k files is terrible UX!)

### Solutions Comparison

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Lazy Load Tree** | Real drill-down UX | Server overhead, slow | Small projects (<1k files) |
| **Virtual List** | Renders visible only | Still flat UX | Large projects (10k+ files) |
| **Cached Tree** | Smooth, instant | High memory (2.4MB) | Most projects |
| **Search First** | Fast for finding files | Hidden files | Projects with search |

### 🌟 RECOMMENDED: Hybrid Approach (Best UX + Performance)

**Phase 1: Client-Side Tree Building** (✅ Snapshot already exists!)
```
1. Fetch snapshot metadata (already uploaded to storage)
2. Parse JSON tree structure in browser
3. NO NEW API CALLS
4. Instant file browser display
```

**Implementation**:
```typescript
// frontend/components/ProjectFileBrowser.tsx
const ProjectFileBrowser = ({ projectId }: Props) => {
  // Step 1: Fetch snapshot (already exists!)
  const snapshot = await fetchSnapshot(projectId);
  
  // Step 2: Build tree in browser
  const fileTree = buildTreeFromSnapshot(snapshot);
  
  // Step 3: Render interactive tree
  return <FileTreeComponent tree={fileTree} />;
};
```

**Benefits**:
- ✅ Zero additional API overhead
- ✅ Instant UI (no loading)
- ✅ Same UX as YourProjects page
- ✅ Works for all project sizes

**Files to Update**:
1. `electron/src/renderer/pages/InvitedProjects.tsx`
   - Replace flat file list with file tree component
2. `electron/src/renderer/components/FileTree/FileTreeBrowser.tsx`
   - Reuse existing component from YourProjects page
3. `cloud/src/api/projects/routes.ts`
   - Add endpoint: `GET /projects/{id}/snapshot` to return stored metadata

---

## TASK 2: Sync/Pause Button

### Implementation

**Backend Changes** (cloud/src/api/projects/routes.ts):
```typescript
// New endpoints
POST /projects/{id}/pause-sync
POST /projects/{id}/resume-sync
GET /projects/{id}/sync-status

// Implementation
router.post('/projects/:id/pause-sync', async (req, res) => {
  const syncService = new SyncthingService(...);
  await syncService.pauseFolder(req.params.id);
  res.json({ status: 'paused' });
});
```

**Frontend Changes** (YourProjectHeader.tsx or InvitedProjectHeader.tsx):
```typescript
<IconButton
  onClick={() => handleTogglePause(projectId)}
  icon={isPaused ? <Play /> : <Pause />}
  label={isPaused ? 'Resume' : 'Pause'}
  variant="outline"
/>
```

**UI State**:
- Show indicator: "⏸️ PAUSED" when paused
- Disable file interactions when paused
- Refresh sync status on join/tab focus

**Complexity**: LOW - Syncthing already supports pause/resume

---

## TASK 3: Download Speed & Progress Display

### Data Source: Port 29999 WebSocket! 🎯

**Real-Time Events from Go-Agent**:
```typescript
{
  type: 'TransferProgress',
  projectId: 'xyz',
  data: {
    folderId: 'xyz',
    currentBytes: 500000000,    // 500 MB
    totalBytes: 1000000000,      // 1 GB
    percentage: 50,              // 0-100%
    bytesPerSec: 2500000,        // 2.5 MB/s
    filesRemaining: 245,
    eta: '6m 40s'
  }
}
```

### UI Options

**Option A**: Per-Project Progress Header
```
┌──────────────────────────────────────────┐
│ Project: My Photos                       │
│ ⏳ 45% ▓▓▓▓░░░░░░  2.5 MB/s  ETA: 12m    │
└──────────────────────────────────────────┘
```

**Option B**: Global App Progress Bar
```
┌─────────────────────────────────────────────┐
│ Syncing 3 projects: 45% | 2.5 MB/s         │
└─────────────────────────────────────────────┘
```

### 🌟 RECOMMENDED: **Both Options**
- Option A: Per-project (visible on project card)
- Option B: Global (top of app for overview)

**Implementation**:
1. Connect Electron to WebSocket (:29999)
2. Listen to `TransferProgress` events
3. Update project state (Redux/Context)
4. Render progress bars with real-time updates

**Complexity**: MEDIUM - Requires WebSocket integration

---

## TASK 4: Invited Users List

### What to Show
In YourProjects page, add "Shared With" tab:

```
Project: My Photos
├── Owner: you@example.com
├── Shared With:
│   ├── alice@example.com
│   │   └── Joined 2 days ago • Last seen 1h ago
│   ├── bob@example.com
│   │   └── Joined 1 day ago • Last seen 3h ago
└── Actions
    ├── [Invite More]
    └── [Manage Permissions]
```

**Backend Changes** (cloud/src/api/projects/routes.ts):
```typescript
GET /projects/{id}/members
// Returns active members with join date, last sync activity

GET /projects/{id}/invites
// Returns pending invites
```

**Query**:
```sql
SELECT 
  pm.user_id,
  du.email,
  pm.joined_at,
  pm.role,
  MAX(s.last_activity) as last_seen
FROM project_members pm
JOIN device_users du ON pm.user_id = du.user_id
LEFT JOIN project_events s ON pm.project_id = s.project_id
WHERE pm.project_id = ?
GROUP BY pm.user_id;
```

**Complexity**: LOW - Just database query + UI

---

## TASK 5: Settings - Default Download Path

### Structure
```
/home/user/downloads/vidsync/  ← Default
├── Project-1-<id>/
├── Project-2-<id>/
└── Project-3-<id>/
```

**Changes Required**:

1. **Database**: Add to `projects` table
```sql
ALTER TABLE projects ADD COLUMN local_sync_path VARCHAR(1024);
```

2. **Backend** (cloud/src/api/projects/routes.ts):
```typescript
PUT /projects/{id}/sync-path
{
  syncPath: '/custom/path/Project-Name'
}
```

3. **Frontend** - New Settings Page
```typescript
// electron/src/renderer/pages/SettingsPage.tsx

<SettingsSection title="Download Locations">
  <SettingItem 
    label="Default Location"
    value="~/downloads/vidsync/"
    action={<BrowseButton />}
  />
  
  {/* Per-project overrides */}
  <SettingItem label="Projects" />
  {projects.map(p => (
    <ProjectPathSetting project={p} />
  ))}
</SettingsSection>
```

4. **Validation**:
   - Check path is writable
   - Create path if doesn't exist
   - Update Syncthing folder config

**Complexity**: MEDIUM - File system handling

---

## TASK 6: Email-to-Devices Mapping (1:M Relationship)

### Current Schema ✅
Already exists:
```sql
CREATE TABLE device_users (
  device_id UUID PRIMARY KEY REFERENCES devices(id),
  email VARCHAR(255),
  user_id UUID,
  UNIQUE(device_id, email)
);
```

### Verify Logic
1. One email → Multiple devices (based on plan)
2. Each device registers independently
3. All devices share same `user_id`

**Validation Checks**:
```typescript
// Check subscription limit
const maxDevices = await getSubscriptionLimit(email);
const currentDevices = await countDevices(email);
if (currentDevices >= maxDevices) {
  throw new Error('Device limit exceeded for your plan');
}
```

**Complexity**: LOW - Just validation logic

---

## TASK 7: Device-Specific Project Filtering

### Problem
User with 2 devices sees SAME projects on both.
Should filter by: `owner_id + device_id`

### Solution

**New Query**:
```typescript
// Instead of:
SELECT * FROM projects WHERE owner_id = ?

// Do this:
SELECT p.* 
FROM projects p
JOIN project_devices pd ON p.id = pd.project_id
WHERE p.owner_id = ? AND pd.device_id = ?
```

**Database Migration**:
```sql
CREATE TABLE project_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  role VARCHAR(20),  -- 'owner', 'editor', 'viewer'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, device_id),
  INDEX idx_project_device(project_id, device_id)
);
```

**Update Endpoint**:
```typescript
GET /projects/list/owned
// Query params:
// - user_id (from auth)
// - device_id (from current device)
```

**Complexity**: MEDIUM - DB schema change + API update

---

## TASK 8: Subscription Plan Limits

### Limits Table
```
Plan     | Devices | Storage | Users/Proj | Projects
---------|---------|---------|------------|----------
Free     | 1       | 100 GB  | 2          | 5
Pro      | 5       | 1 TB    | 10         | 50
Business | ∞       | Custom  | ∞          | ∞
```

### Enforcement Points

```typescript
// 1. Device creation
POST /devices → Check device count vs limit

// 2. Project creation  
POST /projects → Check project count vs limit

// 3. Invite user
POST /projects/{id}/invite → Check members count vs limit
```

**Service** (new file):
```typescript
// cloud/src/lib/subscriptionService.ts

export class SubscriptionService {
  static async getPlan(userId: string): Promise<PlanType>
  static async checkLimit(userId: string, resource: 'devices' | 'projects' | 'users', count: number): Promise<boolean>
  static async getUsage(userId: string): Promise<Usage>
}
```

**Complexity**: MEDIUM - Business logic

---

## Implementation Priority

### 🔴 **CRITICAL - This Week**
1. **TASK 9**: Actually TEST the receiveonly sync (most important!)
   - Create project, invite user, verify files sync
   - Measure transfer speed
   - Verify invitee can't upload files back

2. **WebSocket Integration** (enables Tasks 2, 3)
   - Connect Electron to Go-Agent `:29999`
   - Listen to sync events
   - Display real-time progress

### 🟠 **HIGH - Next Week**
3. **TASK 1**: File browser for invited projects
4. **TASK 3**: Progress bar & transfer speed UI
5. **TASK 2**: Sync/Pause button

### 🟡 **MEDIUM - Week 3**
6. **TASK 4**: Invited users list
7. **TASK 5**: Download path settings
8. **TASK 7**: Device-specific filtering

### 🟢 **LOW - Week 4**
9. **TASK 6**: Email-devices mapping (mostly validation)
10. **TASK 8**: Subscription limits

---

## Key Files to Update

### Frontend (Electron)
- `electron/src/renderer/pages/InvitedProjects.tsx` - Add file browser
- `electron/src/renderer/pages/YourProjects.tsx` - Add pause button & progress bar
- `electron/src/main/websocket-client.ts` - NEW: Connect to port 29999
- `electron/src/renderer/pages/SettingsPage.tsx` - NEW: Download path settings

### Backend (Cloud)
- `cloud/src/api/projects/routes.ts` - Add new endpoints (pause, members, snapshot)
- `cloud/src/lib/subscriptionService.ts` - NEW: Plan limit enforcement
- `cloud/src/migrations/` - NEW: project_devices table, projects.local_sync_path

### Go-Agent
- `go-agent/internal/api/syncthing_client.go` - ✅ Already has AddFolderReceiveOnly
- `go-agent/internal/ws/local_websocket.go` - WebSocket event broadcasting

---

## Next Immediate Step

**RUN TASK 9 TEST**: 
```bash
1. Owner creates project with 50+ files
2. Invitee joins
3. Wait for sync to complete
4. Check transfer speed in console
5. Verify files copied successfully
6. Try adding file on invitee device → should NOT sync back
```

This validates the entire architecture before building UI on top.
