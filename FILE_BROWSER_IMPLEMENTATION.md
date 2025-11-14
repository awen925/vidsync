# File Browser Implementation - Vidsync

## Overview
Implemented professional file browsing for both "Your Projects" and "Invited Projects" pages. The system is optimized for large-scale video production workflows (10TB+, 10k+ files).

## Backend Endpoints Created

### 1. `GET /api/projects/:projectId/files`
**Purpose**: Retrieve local file tree structure for a project owner's project

**Features**:
- Scans the project's `local_path` from the filesystem
- Returns hierarchical folder structure with file metadata
- Supports lazy-loading with depth limits (default 3, max 5)
- Filters out hidden files (starting with `.`)
- Includes file sizes and modification dates
- Access control: Only project owner can browse

**Response Format**:
```json
{
  "files": [
    {
      "name": "folder_name",
      "type": "folder",
      "size": 0,
      "modified": "2025-11-14T08:00:00.000Z",
      "children": [
        {
          "name": "video.mp4",
          "type": "file",
          "size": 5368709120,
          "modified": "2025-11-14T08:00:00.000Z"
        }
      ]
    }
  ],
  "folder": "/path/to/project"
}
```

### 2. `GET /api/projects/list/invited`
**Purpose**: Retrieve list of projects the user has been invited to (received from others)

**Features**:
- Returns only accepted invitations (status = 'accepted')
- Includes project metadata with owner information
- Shows projects shared by other users
- Access control: Any authenticated user can access

**Response Format**:
```json
{
  "projects": [
    {
      "id": "project-uuid",
      "name": "Shared Video Project",
      "description": "4K footage from production",
      "local_path": "/sharer/device/path",
      "owner": {
        "id": "owner-uuid",
        "email": "sharer@example.com"
      },
      "created_at": "2025-11-14T08:00:00.000Z"
    }
  ]
}
```

## Frontend Integration

### YourProjectsPage.tsx
**Updates**:
- Calls `GET /api/projects/:projectId/files` to display local folder structure
- Shows file browser on right panel when project selected
- Displays file icons, names, sizes, and modification times
- Supports nested folder expansion

**Features**:
- Project creation with local path
- File browser showing disk contents
- Share functionality with invite codes
- Project management (delete, rename)

### InvitedProjectsPage.tsx
**Updates**:
- Calls `GET /api/projects/list/invited` to fetch received projects
- Displays list of incoming projects from other users
- Shows project owner/sharer information
- File structure available for viewing

**Features**:
- Unidirectional sync visualization
- Sync status indicators (synced/syncing/paused/error)
- Progress tracking
- Pause/resume sync controls
- File list with sync status badges

## Performance Optimizations

### 1. Lazy Loading
- Default folder depth: 3 levels
- Maximum depth limit: 5 levels
- Prevents loading of entire 10TB+ structures at once
- Client can request specific depth as needed

### 2. Safe File System Access
```typescript
- Follows symlinks safely
- Skips hidden files (.) to reduce clutter
- Handles permission errors gracefully
- Filters invalid entries
- Protects against path traversal
```

### 3. Error Handling
- Returns empty array on permission denied
- Gracefully handles missing paths
- Provides meaningful error messages
- Prevents app crashes from bad paths

### 4. Async Processing
- File scanning runs asynchronously
- Non-blocking file system operations
- Suitable for large directory trees
- Response streaming ready for future optimization

## Database Schema Integration

### Projects Table
```sql
- id: UUID (primary key)
- owner_id: UUID (foreign key to users)
- name: string
- description: text (nullable)
- local_path: string (nullable) ← Used by /files endpoint
- auto_sync: boolean
- created_at: timestamp
```

### Project Members Table
```sql
- project_id: UUID (foreign key)
- user_id: UUID (foreign key)  
- status: enum('pending', 'accepted', 'rejected', 'left')
```

## Usage Example

### For Your Projects (Owner):
```bash
# Get projects you own
GET /api/projects
Response: { projects: [...owned_projects...] }

# Get files in project
GET /api/projects/{projectId}/files
Response: { files: [...folder_tree...], folder: "/path" }
```

### For Invited Projects (Member):
```bash
# Get projects you're invited to
GET /api/projects/list/invited
Response: { projects: [...invited_projects...] }

# Files shown from owner's /files endpoint
# (when owner shares their file structure)
```

## Unidirectional Sync Architecture

**Sharer (Owner)**:
- Initiates sync
- Has local files to send
- Can view/manage their own folder structure
- Can control who receives their files via invites

**Invitee (Member)**:
- Receives sync
- Accepts/rejects invitations
- Can pause/resume sync
- Cannot modify original project
- Sees copy of shared files in their own storage

## Future Enhancements

1. **Remote File Caching**
   - Cache sharer's file list for offline viewing
   - Show cached file structure while syncing

2. **Partial Sync**
   - Select specific folders to sync
   - Skip large files initially
   - Progressive sync strategy

3. **Bandwidth Management**
   - Limit sync speed per project
   - Schedule syncs during off-peak hours
   - Compression options

4. **Conflict Resolution**
   - Handle file modifications during sync
   - Version control for large files
   - Automatic backup strategies

5. **Search & Filter**
   - Quick file search across projects
   - Filter by sync status
   - Sort by size/date/name

## Testing Notes

- ✅ Backend endpoints compile without errors
- ✅ Routes registered correctly (before /:projectId)
- ✅ Authentication middleware active
- ✅ File system access working
- ✅ Invitee list query functional

## Performance Metrics (Expected)

- File listing: < 500ms for typical projects
- Sync initiation: < 1 second
- Large tree scan (10k files): < 5 seconds
- API response: < 200ms after file scan

## Security Considerations

✅ **Implemented**:
- Authentication required on all endpoints
- Owner-only access to own files
- Member-only access to invited projects  
- Hidden files filtered
- Path traversal protection

⚠️ **Recommendations**:
- Rate limit file listing (large trees use CPU)
- Monitor disk I/O on high-load
- Log file access for audit trail
- Consider read-only access for members
