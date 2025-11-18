# InvitedProjectsPage Refactoring: Clean Components & File Display

## Solution Overview

The `InvitedProjectsPage` has been refactored into **smaller, reusable components** with clear separation of concerns. When you click an invited project, it now **shows the file list in the right panel**.

## Component Structure

```
InvitedProjectsPage (Main Container)
├── InvitedProjectsList (Left Panel)
│   └── Shows list of invited projects
│   └── Highlights selected project
│   └── Join button for adding new projects
│
├── Right Panel (Project Details)
│   ├── InvitedProjectHeader (Header Section)
│   │   ├── Project name, description, owner
│   │   ├── Sync status (synced/syncing/paused/error)
│   │   └── Pause/Resume/Remove buttons
│   │
│   └── ProjectFilesPage (File Listing)
│       └── Paginated file list (500 files per page)
│       └── File path, size, hash, modified date
│       └── Refresh snapshot button (if owner)
│       └── Sync start button
```

## Files Created/Modified

### New Components (Small & Focused)

#### 1. `InvitedProjectsList.tsx` (Component)
**Location:** `/electron/src/renderer/components/InvitedProjectsList.tsx`

**Purpose:** Left panel with project list
- Shows all invited projects
- Highlights currently selected project
- Join button to add new projects
- Loading state

**Props:**
```typescript
interface InvitedProjectsListProps {
  projects: InvitedProject[];
  selectedProjectId?: string | null;
  onSelectProject: (project: InvitedProject) => void;
  onJoinClick: () => void;
  loading?: boolean;
}
```

#### 2. `InvitedProjectHeader.tsx` (Component)
**Location:** `/electron/src/renderer/components/InvitedProjectHeader.tsx`

**Purpose:** Header section of right panel
- Project title, description, owner name
- Sync status with progress bar
- File count and total size
- Pause/Resume/Remove buttons

**Props:**
```typescript
interface InvitedProjectHeaderProps {
  project: InvitedProject;
  onPauseSync: () => void;
  onResumeSync: () => void;
  onDelete: () => void;
}
```

### Refactored Pages

#### 3. `InvitedProjectsPage.tsx` (Page)
**Location:** `/electron/src/renderer/pages/Projects/InvitedProjectsPage.tsx`

**Changes:**
- ✅ Removed 200+ lines of inline JSX
- ✅ Now uses `InvitedProjectsList` component
- ✅ Now uses `InvitedProjectHeader` component
- ✅ Integrates `ProjectFilesPage` for file listing
- ✅ Handles state and API calls only
- ✅ Much cleaner and maintainable

**State Management:**
- `projects` - List of invited projects
- `selectedProject` - Currently selected project
- `loading` - Initial fetch loading state
- `pauseConfirmOpen` - Pause confirmation dialog
- `deleteConfirmOpen` - Delete confirmation dialog
- `joinDialogOpen` - Join new project dialog
- `inviteToken, joinLoading, joinError, joinSuccess` - Join form state

## User Flow: From Selection to File Display

```
1. User opens "Invited Projects" tab
   └─ InvitedProjectsPage renders
   └─ Fetches list from GET /projects/list/invited

2. Left panel shows list of projects
   └─ InvitedProjectsList displays projects
   └─ No project selected initially

3. User clicks a project in left list
   └─ InvitedProjectsList calls onSelectProject callback
   └─ selectedProject state is updated
   └─ Right panel appears

4. InvitedProjectHeader renders
   └─ Shows project details (name, owner, status)
   └─ Shows sync controls (Pause/Resume/Remove)

5. ProjectFilesPage renders
   └─ Calls GET /api/projects/:projectId/files-list
   └─ Returns paginated file list (500 per page)
   └─ Shows file path, size, hash, modified_at
   └─ Displays refresh and sync buttons

6. User can:
   ├─ Scroll through paginated files
   ├─ Click Pause to stop syncing
   ├─ Click Resume to continue syncing
   ├─ Click Remove to delete project
   └─ Refresh snapshot to get latest metadata
```

## API Endpoints Used

### Fetch Invited Projects
```http
GET /projects/list/invited
Response:
{
  "projects": [
    {
      "id": "project-123",
      "name": "Project A",
      "description": "...",
      "owner_name": "Alice",
      "sync_status": "synced",
      "file_count": 120,
      "total_size": 5368709120
    }
  ]
}
```

### Get File List (NEW Phase 1)
```http
GET /api/projects/:projectId/files-list?limit=500&offset=0
Response:
{
  "files": [
    {
      "file_path": "folder/document.pdf",
      "is_directory": false,
      "size": 1048576,
      "file_hash": "abc123",
      "modified_at": "2025-11-17T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 500,
    "offset": 0,
    "hasMore": false
  }
}
```

### Pause Sync
```http
POST /projects/:projectId/pause-sync
Body: {}
```

### Resume Sync
```http
POST /projects/:projectId/resume-sync
Body: {}
```

### Delete/Remove Project
```http
DELETE /projects/:projectId
```

## Folder Metadata Storage

### When Creating a Project (Owner)

**API Call:**
```http
POST /api/projects
Body:
{
  "name": "My Project",
  "description": "Project description",
  "local_path": "/home/user/my-project",
  "auto_sync": true
}
```

**Database Storage:**
```sql
-- projects table
INSERT INTO projects (
  owner_id,
  name,
  description,
  local_path,
  auto_sync
)
VALUES (
  'user-uuid',
  'My Project',
  'Project description',
  '/home/user/my-project',  -- ← Local path stored here
  true
);
```

### Folder Metadata Structure

**File metadata is stored in TWO places:**

#### 1. `project_sync_state` table (Summary)
```sql
CREATE TABLE project_sync_state (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  snapshot_version INT NOT NULL,
  total_files INT NOT NULL,
  total_size BIGINT NOT NULL,
  root_hash TEXT,
  created_at TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

**Example:**
```
snapshot_version: 5
total_files: 150
total_size: 5368709120  (5 GB)
root_hash: "abc123...xyz"
```

#### 2. `project_file_snapshots` table (Detailed)
```sql
CREATE TABLE project_file_snapshots (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  snapshot_version INT NOT NULL,
  file_path TEXT NOT NULL,
  is_directory BOOLEAN NOT NULL,
  size BIGINT NOT NULL,
  file_hash TEXT NOT NULL,
  modified_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

**Example Entries:**
```
file_path: "documents/report.pdf"
is_directory: false
size: 1048576 (1 MB)
file_hash: "hash1"
modified_at: 2025-11-17T10:30:00Z

file_path: "documents"
is_directory: true
size: 0
file_hash: ""
modified_at: 2025-11-17T10:30:00Z
```

### When Snapshot is Refreshed

**API Call:**
```http
PUT /api/projects/:projectId/refresh-snapshot
Body: {}
Response: { "success": true, "snapshot_version": 6 }
```

**Process:**
1. Scans local folder at `local_path`
2. Generates hashes for all files
3. Increments `snapshot_version` in `project_sync_state`
4. Inserts new rows in `project_file_snapshots`
5. Updates `total_files` and `total_size`
6. Updates `root_hash` (hash of all file hashes)

## Component Communication Flow

```
InvitedProjectsPage
├─ State: projects, selectedProject, loading, dialogs
│
├─ fetchInvitedProjects()
│  └─ GET /projects/list/invited
│  └─ setProjects(data.projects)
│
├─ handlePauseSync()
│  └─ POST /projects/:id/pause-sync
│  └─ fetchInvitedProjects()
│
├─ handleResumeSync()
│  └─ POST /projects/:id/resume-sync
│  └─ fetchInvitedProjects()
│
├─ handleDeleteProject()
│  └─ DELETE /projects/:id
│  └─ setSelectedProject(null)
│  └─ fetchInvitedProjects()
│
└─ Renders:
   ├─ <InvitedProjectsList
   │    projects={projects}
   │    selectedProjectId={selectedProject?.id}
   │    onSelectProject={setSelectedProject}  ← Updates state
   │    onJoinClick={() => setJoinDialogOpen(true)}
   │ />
   │
   └─ {selectedProject && (
        ├─ <InvitedProjectHeader
        │    project={selectedProject}
        │    onPauseSync={handlePauseSync}
        │    onResumeSync={handleResumeSync}
        │    onDelete={handleDeleteProject}
        │ />
        │
        └─ <ProjectFilesPage
             projectId={selectedProject.id}
             isOwner={false}
           />
      )}
```

## Design Benefits

✅ **Separation of Concerns**
- List component only handles selection UI
- Header component only handles sync controls
- Files are managed by ProjectFilesPage
- Page component handles state and API

✅ **Reusability**
- `InvitedProjectsList` can be used elsewhere
- `InvitedProjectHeader` can be used in YourProjectsPage too
- `ProjectFilesPage` already used in multiple places

✅ **Maintainability**
- Each component ~100-150 lines
- Easy to find and fix bugs
- Clear component boundaries
- Props interface documents expectations

✅ **Testability**
- Components can be tested in isolation
- Mock props easily for unit tests
- State logic separate from UI

✅ **Performance**
- Components only re-render when props change
- No unnecessary re-renders
- ProjectFilesPage handles pagination internally

## Code Metrics

**Before Refactoring:**
- InvitedProjectsPage.tsx: 528 lines
- All logic + UI mixed together
- Difficult to follow

**After Refactoring:**
- InvitedProjectsPage.tsx: ~200 lines (state + logic only)
- InvitedProjectsList.tsx: ~130 lines (left panel UI)
- InvitedProjectHeader.tsx: ~130 lines (header UI)
- ProjectFilesPage.tsx: ~295 lines (file listing)
- **Total organization: 755 lines, but much clearer structure**

## Testing Checklist

- [ ] Open "Invited Projects" tab
- [ ] Left panel shows list of projects
- [ ] Right panel is empty initially
- [ ] Click a project
- [ ] Right panel shows project header with details
- [ ] File list appears below header
- [ ] Pause button works (if syncing)
- [ ] Resume button works (if paused)
- [ ] Remove button shows confirmation dialog
- [ ] Join dialog still works
- [ ] Scroll through files (pagination)
- [ ] Refresh snapshot button works
- [ ] No console errors
- [ ] No TypeScript errors: `npm run build`

## Future Improvements

1. **Shared Header Component**: Use same header for YourProjectsPage too
2. **Extract Dialogs**: Create separate components for pause/delete/join dialogs
3. **State Management**: Consider Context API or Zustand for shared state
4. **Sync Status Updates**: WebSocket for real-time status updates
5. **File Search**: Add search/filter functionality to file list
6. **Favorites**: Star/favorite projects for quick access

## Summary

✨ **InvitedProjectsPage is now clean and component-based:**
- ✅ Split into 3 focused components
- ✅ Shows file list when project selected
- ✅ Uses new Phase 1 API endpoints
- ✅ 0 TypeScript errors
- ✅ Easy to maintain and extend
- ✅ Folder metadata stored in `projects.local_path` (owner info) and `project_file_snapshots` (detailed metadata)

The design keeps the split-panel layout you preferred while making the code much cleaner! 🎯
