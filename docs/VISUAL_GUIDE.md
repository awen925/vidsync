# InvitedProjectsPage: Visual & Architecture Guide

## User Interface Flow

### Initial State
```
┌─────────────────────────────────────────────────┐
│ Incoming Projects     [+ Join]                  │
├──────────────────────┬──────────────────────────┤
│                      │                          │
│  • Project A         │                          │
│  • Project B         │  Select a project        │
│  • Project C         │  from the list           │
│                      │                          │
│  (No project         │                          │
│   selected)          │                          │
│                      │                          │
└──────────────────────┴──────────────────────────┘
```

### After Clicking Project A
```
┌─────────────────────────────────────────────────────────┐
│ Incoming Projects     [+ Join]                          │
├──────────────────────┬────────────────────────────────┤
│                      │  Project A                     │
│  • Project A ✓       │  Description here              │
│  • Project B         │  Shared by: Alice              │
│  • Project C         │  Status: [Synced] ✓            │
│                      │  120 files | 5.00 GB           │
│  (Selected:          │  [Pause] [Remove]              │
│   Project A)         │                                │
│                      │  ┌─ FILE LIST ─────────────────┤
│                      │  │ documents/report.pdf         │
│                      │  │ images/photo.jpg             │
│                      │  │ data/dataset.csv             │
│                      │  │ ...                          │
│                      │  │ (Paginated: 1-500 of 500)   │
│                      │  └────────────────────────────┤
│                      │                                │
└──────────────────────┴────────────────────────────────┘
```

## Component Hierarchy

```
<InvitedProjectsPage>
│
├─ State Management
│  ├─ projects: InvitedProject[]
│  ├─ selectedProject: InvitedProject | null
│  ├─ loading: boolean
│  ├─ pauseConfirmOpen: boolean
│  ├─ deleteConfirmOpen: boolean
│  ├─ joinDialogOpen: boolean
│  └─ joinForm state (token, loading, error, success)
│
├─ Event Handlers
│  ├─ fetchInvitedProjects()
│  ├─ handlePauseSync()
│  ├─ handleResumeSync()
│  ├─ handleDeleteProject()
│  ├─ handleJoinProject()
│  └─ handleCloseJoinDialog()
│
└─ Render
   │
   ├─ <InvitedProjectsList>
   │  └─ Left panel (300px width)
   │     └─ Displays projects
   │        └─ Calls: onSelectProject(project)
   │
   ├─ <Box flex=1> Right Panel Container
   │  │
   │  ├─ {selectedProject ? (
   │  │  │
   │  │  ├─ <InvitedProjectHeader>
   │  │  │  │
   │  │  │  └─ Project metadata display
   │  │  │     └─ Pause/Resume/Remove buttons
   │  │  │        └─ Calls: onPauseSync, onResumeSync, onDelete
   │  │  │
   │  │  └─ <Box flex=1> Files Container
   │  │     │
   │  │     └─ <ProjectFilesPage projectId=selectedProject.id>
   │  │        │
   │  │        └─ Paginated file list
   │  │           └─ Calls: GET /api/projects/:id/files-list
   │  │
   │  └─ ) : (
   │     │
   │     └─ <Box> Empty State
   │        └─ "Select a project from the list"
   │
   ├─ <Dialog> Pause Confirmation
   ├─ <Dialog> Delete Confirmation
   ├─ <Dialog> Join Project Dialog
   └─ <Dialog> Join Success/Error
```

## Data Flow Diagram

```
┌──────────────────────┐
│ InvitedProjectsPage  │
│   (Main Container)   │
└──────────┬───────────┘
           │
           ├─────────────────────────────────────┐
           │                                     │
    ┌──────▼──────────┐              ┌──────────▼────┐
    │ fetchProjects() │              │ User clicks:  │
    │                 │              │  - Pause      │
    │ GET /projects/  │              │  - Resume     │
    │ list/invited    │              │  - Remove     │
    └──────┬──────────┘              │  - Join       │
           │                         │               │
    ┌──────▼─────────────────────────▼──────┐       │
    │ Update: projects []                   │       │
    │ If empty: setSelectedProject(null)   │       │
    │ Else: setSelectedProject(first)      │       │
    └──────┬──────────────────────────────────┘       │
           │                                         │
    ┌──────▼──────────────────────────────────────┐  │
    │ <InvitedProjectsList>                        │  │
    │                                              │  │
    │  Shows:                                      │  │
    │  - projects (from state)                     │  │
    │  - selectedProjectId (from state)            │  │
    │  - [✓] next to selected project              │  │
    └──────┬──────────────────────────────────────┘  │
           │                                         │
           │ User clicks project                    │
           │ in list                                │
           └─── onSelectProject(project)            │
                │                                   │
                │ setSelectedProject(project)      │
                │                                   │
           ┌────▼─────────────────────────────────┐ │
           │ <InvitedProjectHeader>                │ │
           │                                       │ │
           │ Shows:                                │ │
           │ - project.name                        │ │
           │ - project.owner_name                  │ │
           │ - project.sync_status                 │ │
           │ - project.file_count                  │ │
           │ - [Pause] [Resume] [Remove]           │ │
           └────┬──────────────────────────────────┘ │
                │ Button clicks trigger:             │
                │  - onPauseSync()                   │
                │  - onResumeSync()                  │
                │  - onDelete()                      │
                │                                    │
                └─────────────────────────────────────┤
                                                     │
           ┌─────────────────────────────────────────▼───┐
           │ User clicks: Join Project Button            │
           │                                             │
           │ setJoinDialogOpen(true)                     │
           │ Shows: <Dialog> with TextField              │
           │ User enters token & clicks Join             │
           │                                             │
           │ handleJoinProject()                         │
           │  POST /projects/join                        │
           │  Body: { invite_code: token }              │
           │                                             │
           │ Refresh: fetchInvitedProjects()             │
           └──────────────────────────────────────────────┘
```

## File Display Details

When a project is selected:

```
<ProjectFilesPage>
│
├─ State:
│  ├─ files: FileSnapshot[]
│  ├─ pagination: { total, limit, offset, hasMore }
│  ├─ page: number
│  └─ loading: boolean
│
├─ On Mount:
│  └─ fetchFiles(offset=0)
│     └─ GET /api/projects/:id/files-list?limit=500&offset=0
│        Response: { files: [], pagination: {} }
│
├─ Display:
│  ├─ <Table>
│  │  ├─ Columns:
│  │  │  ├─ File Path
│  │  │  ├─ Is Directory
│  │  │  ├─ Size
│  │  │  ├─ Hash
│  │  │  └─ Modified At
│  │  │
│  │  └─ Rows: files.map(file => <TableRow>)
│  │
│  ├─ <TablePagination>
│  │  ├─ rowsPerPage: 500
│  │  ├─ page: page
│  │  ├─ rowsPerPageOptions: [100, 500, 1000]
│  │  └─ onChange: setPage() -> fetchFiles(offset)
│  │
│  ├─ [Refresh] Button
│  │  └─ PUT /api/projects/:id/refresh-snapshot
│  │
│  └─ [Start Sync] Button
│     └─ POST /api/projects/:id/sync-start
│
└─ Error Handling:
   ├─ If no files: "No files in this project"
   ├─ If error: <Alert severity="error">
   └─ If loading: <CircularProgress>
```

## Component Props Flow

```
InvitedProjectsPage
│
├─ → <InvitedProjectsList>
│  ├─ projects: InvitedProject[]
│  ├─ selectedProjectId: string | null
│  ├─ onSelectProject: (project: InvitedProject) => void
│  ├─ onJoinClick: () => void
│  └─ loading: boolean
│
├─ → <InvitedProjectHeader>
│  ├─ project: InvitedProject
│  ├─ onPauseSync: () => void
│  ├─ onResumeSync: () => void
│  └─ onDelete: () => void
│
└─ → <ProjectFilesPage>
   ├─ projectId: string
   └─ isOwner: boolean (false for invited projects)
```

## API Request Timeline

```
User Opens "Invited Projects" Tab
│
├─ 1. useEffect() → fetchInvitedProjects()
│  │
│  └─ GET /projects/list/invited
│     ├─ Response: projects[]
│     └─ setState(projects)
│        └─ If first time: setSelectedProject(projects[0])
│
├─ 2. InvitedProjectsList Renders
│  │
│  └─ Shows project list
│     └─ User clicks project
│
├─ 3. User Clicks "Project A"
│  │
│  ├─ setState(selectedProject = Project A)
│  │
│  └─ InvitedProjectHeader Renders
│     └─ Shows: Name, Owner, Status
│
├─ 4. ProjectFilesPage Mounts
│  │
│  └─ useEffect() → fetchFiles()
│     │
│     └─ GET /api/projects/PROJECT_A_ID/files-list?limit=500&offset=0
│        ├─ Response: files[]
│        └─ setState(files)
│           └─ Renders <Table> with files
│
├─ 5. User Clicks Pause Button
│  │
│  └─ InvitedProjectHeader → onPauseSync()
│     │
│     └─ POST /projects/PROJECT_A_ID/pause-sync
│        │
│        └─ fetchInvitedProjects() → Refresh UI
│
├─ 6. User Scrolls Files / Changes Page
│  │
│  └─ ProjectFilesPage → setPage()
│     │
│     └─ GET /api/projects/PROJECT_A_ID/files-list?limit=500&offset=500
│        ├─ Response: next batch of files
│        └─ setState(files)
│           └─ Renders next page
│
└─ 7. User Clicks [Refresh Snapshot]
   │
   └─ ProjectFilesPage → handleRefresh()
      │
      └─ PUT /api/projects/PROJECT_A_ID/refresh-snapshot
         │
         ├─ Backend scans folder
         ├─ Updates metadata
         └─ Response: new snapshot_version
            └─ fetchFiles() → Refresh table
```

## State Management Diagram

```
InvitedProjectsPage State:
│
├─ projects: []
│  └─ Populated by: fetchInvitedProjects()
│  └─ Used by: <InvitedProjectsList>
│
├─ selectedProject: null | InvitedProject
│  ├─ Set by: User clicks project
│  ├─ Used by: <InvitedProjectHeader>, <ProjectFilesPage>
│  └─ Reset by: handleConfirmDelete()
│
├─ loading: boolean
│  ├─ Set by: fetchInvitedProjects()
│  └─ Used by: <InvitedProjectsList> (shows spinner)
│
├─ pauseConfirmOpen: boolean
│  ├─ Set by: User clicks Pause button
│  └─ Used by: <Dialog> Pause Confirmation
│
├─ deleteConfirmOpen: boolean
│  ├─ Set by: User clicks Remove button
│  └─ Used by: <Dialog> Delete Confirmation
│
├─ joinDialogOpen: boolean
│  ├─ Set by: User clicks [+ Join] button
│  └─ Used by: <Dialog> Join Project
│
├─ inviteToken: string
│  ├─ Set by: User types in TextField
│  └─ Used by: handleJoinProject()
│
├─ joinLoading: boolean
│  ├─ Set by: During POST /projects/join
│  └─ Used by: <Dialog> (disable button while loading)
│
├─ joinError: string
│  ├─ Set by: API error response
│  └─ Used by: <Dialog> (show error <Alert>)
│
└─ joinSuccess: boolean
   ├─ Set by: API success response
   └─ Used by: <Dialog> (show success <Alert>)
```

This visual guide helps understand:
- ✅ UI layout and state
- ✅ Component relationships
- ✅ Data flow
- ✅ API interactions
- ✅ User interactions
