# Remote Project File List with Sync Status - Design Document

## Overview
For invited/remote projects with 10k+ files per project, implement a file list that shows:
1. File metadata (name, size, type)
2. **Sync status** from Syncthing (synced ✓, syncing ⟳, not-synced ⚠, deleted ✗)
3. Pagination to handle large file lists

## Sync Status States

### Status Definitions

```
✓ SYNCED      - File completely synced, local copy matches remote hash
⟳ SYNCING     - Sync in progress, show percentage complete (e.g., 45%)
⚠ NOT_SYNCED  - Waiting to sync (in queue or remote not available)
✗ DELETED      - File deleted by owner, marked for removal
```

### Visual Indicators

| Status | Icon | Color | Badge Text | Meaning |
|--------|------|-------|------------|---------|
| Synced | ✓ | Green | "Synced" | Ready to use |
| Syncing | ⟳ | Blue | "Syncing 45%" | In progress |
| Not-Synced | ⚠ | Amber | "Waiting" | Not yet synced |
| Deleted | ✗ | Red | "Deleted" | Owner removed this |

## Data Flow Architecture

### 1. File Metadata (Cloud Backend)
**Stored in Database:**
```typescript
interface RemoteFile {
  id: string;
  project_id: string;
  path: string;                    // e.g., "folder/subfolder/file.txt"
  name: string;
  size: number;                    // bytes
  is_directory: boolean;
  mime_type?: string;
  created_by: string;              // owner's user_id
  created_at: timestamp;
  deleted_by?: string;             // if owner deleted it
  deleted_at?: timestamp;
  synced_devices?: string[];       // device IDs that have it synced
}
```

**API Endpoint:**
```
GET /api/projects/:projectId/files
Query params:
  - path: string (default "/") - folder to list
  - page: number (default 1)
  - per_page: number (default 100, max 1000)
  
Response:
{
  success: true,
  files: RemoteFile[],
  total: number,                   // total files in folder
  page: number,
  per_page: number,
  has_more: boolean
}
```

### 2. Sync Status (Syncthing API)
**Query from Syncthing REST API:**
```typescript
interface SyncthingFileStatus {
  path: string;
  status: 'synced' | 'syncing' | 'not-synced';
  progress?: number;               // 0-100 for syncing files
  local_version?: number;
  global_version?: number;
}
```

**Endpoint to call from main process:**
```
GET http://localhost:8384/rest/db/file?folder=projectId&file=path/to/file
Authorization: X-API-Key header
```

### 3. Deleted Files
**Stored in Cloud Database:**
- Track `deleted_by` and `deleted_at` in `remote_files` table
- When owner deletes a file:
  1. Backend marks record with `deleted_by: userId, deleted_at: timestamp`
  2. Syncthing gets .stignore rule to block the file
  3. UI shows ✗ status
  4. After 30 days, file can be hard-deleted from DB

## Implementation Strategy

### Phase 1: Backend (Cloud API)
1. Create `remote_files` table to store file metadata
2. Implement `GET /api/projects/:projectId/files` endpoint with pagination
3. Implement `DELETE /api/projects/:projectId/files/:fileId` to soft-delete
4. Return sync status flags (synced_devices array)

### Phase 2: IPC Handler (Electron)
```typescript
// Main process
ipcMain.handle('syncthing:getFileStatus', async (_ev, projectId: string, filePath: string) => {
  try {
    const status = await queryStatusFromSyncthing(projectId, filePath);
    return { success: true, status };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Helper to query Syncthing
async function queryStatusFromSyncthing(projectId: string, filePath: string) {
  const apiKey = process.env.SYNCTHING_API_KEY;
  const response = await fetch(
    `http://localhost:8384/rest/db/file?folder=${projectId}&file=${filePath}`,
    { headers: { 'X-API-Key': apiKey } }
  );
  const data = await response.json();
  
  return {
    status: data.synced ? 'synced' : data.inSync ? 'syncing' : 'not-synced',
    progress: data.progress,
  };
}
```

### Phase 3: React Component
```typescript
interface RemoteFileListProps {
  projectId: string;
  folderPath?: string;
}

const RemoteFileList: React.FC<RemoteFileListProps> = ({ projectId, folderPath = '/' }) => {
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [syncStatus, setSyncStatus] = useState<Map<string, SyncStatus>>(new Map());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Load file list
  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true);
      const response = await cloudAPI.get(
        `/projects/${projectId}/files`,
        { params: { path: folderPath, page, per_page: 100 } }
      );
      setFiles(response.data.files);
      
      // Load sync status for each file
      for (const file of response.data.files) {
        const status = await (window as any).api.syncthingGetFileStatus(projectId, file.path);
        setSyncStatus(prev => new Map(prev).set(file.id, status));
      }
      setLoading(false);
    };
    
    loadFiles();
  }, [projectId, folderPath, page]);
  
  // Render file list with sync status badges
  return (
    <Table>
      <TableBody>
        {files.map(file => (
          <TableRow key={file.id}>
            <TableCell>{file.name}</TableCell>
            <TableCell>{formatFileSize(file.size)}</TableCell>
            <TableCell>
              <SyncStatusBadge status={syncStatus.get(file.id)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

// Sync status badge component
const SyncStatusBadge: React.FC<{ status?: SyncStatus }> = ({ status }) => {
  if (!status) return <CircularProgress size={16} />;
  
  const statusConfig = {
    synced: { icon: '✓', color: 'success', label: 'Synced' },
    syncing: { icon: '⟳', color: 'info', label: `Syncing ${status.progress}%` },
    'not-synced': { icon: '⚠', color: 'warning', label: 'Waiting' },
    deleted: { icon: '✗', color: 'error', label: 'Deleted' },
  };
  
  const config = statusConfig[status.status] || statusConfig['not-synced'];
  
  return (
    <Chip
      icon={<>{config.icon}</>}
      label={config.label}
      color={config.color}
      variant="outlined"
      size="small"
    />
  );
};
```

## Performance Considerations

### For 10k+ Files
1. **Pagination**: Load 100 files per page
2. **Lazy Status Loading**: Only load sync status for visible rows
3. **Caching**: Cache status for 5 minutes
4. **Virtual Scrolling**: Use react-window for large lists
5. **Debouncing**: Batch sync status queries

### Optimization Example
```typescript
// Batch query sync status (not one per file)
async function batchQuerySyncStatus(projectId: string, filePaths: string[]) {
  // Group by parent folder
  const grouped = groupByFolder(filePaths);
  
  // Query Syncthing progress endpoint (gets all at once)
  const response = await fetch(
    `http://localhost:8384/rest/db/status?folder=${projectId}`,
    { headers: { 'X-API-Key': apiKey } }
  );
  
  return parseStatusMap(response.json());
}
```

## Database Schema (Supabase)

### Table: remote_files
```sql
CREATE TABLE remote_files (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  path TEXT NOT NULL,                    -- Unique per project
  name TEXT NOT NULL,
  size BIGINT,
  is_directory BOOLEAN DEFAULT false,
  mime_type TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT now(),
  deleted_by UUID REFERENCES auth.users(id),    -- NULL if not deleted
  deleted_at TIMESTAMP,                         -- NULL if not deleted
  
  UNIQUE(project_id, path),
  CHECK (deleted_by IS NULL OR deleted_at IS NOT NULL)
);
```

### Table: file_synced_devices
```sql
CREATE TABLE file_synced_devices (
  file_id UUID NOT NULL REFERENCES remote_files(id),
  device_id UUID NOT NULL REFERENCES devices(id),
  synced_at TIMESTAMP DEFAULT now(),
  
  PRIMARY KEY (file_id, device_id)
);
```

## API Changes Required

### Update POST /api/projects/:projectId/files
Currently scans local OS and returns tree. **Keep for local projects**.
For remote projects, query `remote_files` table instead.

### New GET /api/projects/:projectId/files
```typescript
// Existing: scans local OS for local projects
// New: queries database for remote projects with pagination

const isLocalProject = !!(await getProject(projectId)).local_path;

if (isLocalProject) {
  // Existing behavior: scan local directory
  const files = await scanLocalDirectory(...);
  return { files };
} else {
  // New behavior: query remote_files table
  const files = await db.query(
    'SELECT * FROM remote_files WHERE project_id = ? AND path LIKE ? AND deleted_by IS NULL LIMIT ?',
    [projectId, folderPath + '%', perPage]
  );
  return { files, total, page, per_page, has_more };
}
```

### New DELETE /api/projects/:projectId/files/:fileId
```typescript
// Soft-delete: mark deleted_by and deleted_at
// Return success
// Syncthing event listener will add .stignore rule

await db.query(
  'UPDATE remote_files SET deleted_by = ?, deleted_at = now() WHERE id = ?',
  [userId, fileId]
);
```

## Summary

| Component | Responsibility |
|-----------|-----------------|
| **Cloud Backend** | Store file metadata, track deleted files, return paginated lists |
| **Electron IPC** | Query Syncthing API for actual sync status, batch queries |
| **React UI** | Display files with sync status badges, handle pagination |
| **Syncthing** | Provide actual sync status via REST API |

This architecture separates concerns:
- **Metadata**: Persistent, stored in cloud DB
- **Sync Status**: Real-time, queried from Syncthing
- **Deletion**: Soft-delete with recovery period
- **Scale**: Pagination handles 10k+ files gracefully

---

**Status**: Design phase - ready for implementation
**Next**: Start with backend table/API changes
