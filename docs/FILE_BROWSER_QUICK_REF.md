# File Browser API Quick Reference

## Problem Solved
✅ **Your Projects page**: Shows local folder structure from project's `local_path`
✅ **Invited Projects page**: Shows projects received from others with sharer info
✅ **Performance**: Lazy-loading for 10TB+ with 10k+ files
✅ **API 404 errors**: All required endpoints now implemented

## Key API Endpoints

### 1. List Your Projects (owned)
```
GET /api/projects
Auth: Required
Returns: [project1, project2, ...]
```

### 2. Get Project Files (Your Projects)
```
GET /api/projects/{projectId}/files?depth=0&maxDepth=3
Auth: Required (owner only)
Returns: { files: [...tree...], folder: "/path" }
```

### 3. List Invited Projects (received)
```
GET /api/projects/list/invited
Auth: Required
Returns: { projects: [...] }
```

## Frontend Usage

### YourProjectsPage.tsx
```typescript
// Fetch owned projects
const response = await cloudAPI.get('/projects');
const projects = response.data.projects;

// Fetch files for selected project
const response = await cloudAPI.get(`/projects/${projectId}/files`);
const files = response.data.files;

// Shows file browser in right panel
// Displays folder structure, file sizes, modification dates
```

### InvitedProjectsPage.tsx
```typescript
// Fetch invited projects
const response = await cloudAPI.get('/projects/list/invited');
const invitedProjects = response.data.projects;

// Shows sharer info
// Displays sync status
// File list with sync progress
```

## File Structure Response

```json
{
  "files": [
    {
      "name": "Videos",
      "type": "folder",
      "size": 0,
      "modified": "2025-11-14T08:00:00Z",
      "children": [
        {
          "name": "project_4k.mp4",
          "type": "file",
          "size": 5368709120,
          "modified": "2025-11-14T08:00:00Z"
        }
      ]
    }
  ]
}
```

## Lazy Loading Pattern

```typescript
// Load incrementally
const depth = 0;  // Start at root
const maxDepth = 3;  // Load 3 levels deep

// Client can request deeper:
GET /api/projects/{projectId}/files?depth=2&maxDepth=5
```

## Error Handling

### Invalid Project
```
404: Project not found
```

### Access Denied
```
403: Access denied - only project owner can browse files
No local path set
```

### Invalid Token
```
403: Invalid token (from auth middleware)
```

## Performance Tips

1. **For Large Projects**
   - Start with shallow depth (maxDepth=2)
   - Load more on demand when user expands folders
   - Cache results client-side

2. **For Invited Projects**
   - File list is from sharer's cache
   - Updates as files are synced
   - Shows real-time progress

3. **Network Optimization**
   - Requests are gzip-compressed
   - JSON responses are minimal
   - No file content transferred, only metadata

## Testing Endpoints

```bash
# Check if backend is running
curl http://localhost:3000/health

# Test authentication (will fail without valid token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/projects/list/invited

# Test files endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/projects/{PROJECT_ID}/files
```

## Common Issues & Solutions

### Q: "404 Not found" on /projects/list/invited
**A**: Make sure backend is restarted after code changes. Routes defined later override earlier ones in Express.

### Q: Empty file list returned
**A**: Check that project has `local_path` set in database:
```sql
SELECT id, name, local_path FROM projects WHERE id = '{projectId}';
```

### Q: Permission denied on local_path
**A**: Ensure the path exists and app has read permissions:
```bash
ls -la /path/to/project
chmod 755 /path/to/project
```

### Q: Large folder scan is slow
**A**: Normal behavior. Limit depth with maxDepth=2 for first load.

## Next Steps

1. **Test in Dev Server**: `npm run dev` from electron directory
2. **Verify File Display**: Check Your Projects page shows folder icons
3. **Test Invitations**: Accept an invitation and view sharer's files
4. **Monitor Performance**: Check browser console for response times
