# Backend Architecture Refactoring: Cloud → Client Separation

## Principle
**Cloud backend = Database operations only**
**Electron client = All local Syncthing API operations**

This prevents the central cloud server from directly accessing each user's local Syncthing instances and maintains proper separation of concerns.

---

## ✅ COMPLETED: Project Creation Endpoint

### Changes
**File:** `/cloud/src/api/projects/routes.ts` (POST /api/projects endpoint)

**Before:** 
- Backend created DB record
- Backend created Syncthing folder with `createFolder()`
- Backend verified folder exists with `verifyFolderExists()`
- Backend waited for folder to be known: `waitForFolderKnown()`
- Backend waited for indexing: `waitForFolderScanned()`
- Backend fetched initial file list: `getFolderFiles()`
- Backend generated snapshot from files
- Response included file count and snapshot data

**After:**
- Backend creates DB record ONLY
- Returns project ID immediately
- Includes message: "Client should configure Syncthing folder using syncthing:startForProject()"
- All Syncthing operations deferred to client

### Client-Side Implementation

**Files Updated:**
1. `/electron/src/renderer/pages/Projects/ProjectsPage.tsx`
2. `/electron/src/renderer/pages/Projects/YourProjectsPage.tsx` (already had this)

**Client Flow:**
```typescript
// After API returns successful project creation:
if (localPath) {
  await api.syncthingStartForProject(projectId, localPath);
}
```

**IPC Handler:** `syncthing:startForProject` (already exists in main.ts)
- Creates folder in local Syncthing instance
- Configures folder settings
- Returns status

---

## ⚠️ IDENTIFIED BUT NOT YET REFACTORED

### Endpoints with Syncthing API Calls (in projects/routes.ts)

| Line | Endpoint | Operation | Status |
|------|----------|-----------|--------|
| 673-681 | POST /projects/:projectId/devices | `addDeviceToFolderWithRole()` | ⚠️ TO DO |
| 729-755 | POST /projects/:projectId/invite-user | `getFolderFiles()` for validation | ⚠️ TO DO |
| 1017-1023 | POST /projects/:projectId/decline-invite | `getFolderFiles()` | ⚠️ TO DO |
| 1288-1295 | GET /projects/:projectId/status | `getFolderStatus()` | ⚠️ TO DO |
| 1432-1485 | POST /projects/:projectId/sync-start | Multiple operations (testConnection, addDeviceToFolder, scanFolder, waitForFolderKnown, waitForFolderScanned, getFolderStatus) | ⚠️ MAJOR |
| 1550-1569 | POST /projects/:projectId/pause-sync | `pauseFolder()`, `removeDeviceFromFolder()` | ⚠️ TO DO |
| 1632-1651 | POST /projects/:projectId/resume-sync | `resumeFolder()`, `addDeviceToFolder()` | ⚠️ TO DO |
| 1701-1704 | POST /projects/:projectId/devices/:deviceId (DELETE) | `removeDeviceFromFolder()` | ⚠️ TO DO |
| 1767-1768 | GET /projects/:projectId/sync-status | `getFolderStatus()` | ⚠️ TO DO |
| 2392-2398 | GET /projects/:projectId/events | `getFolderStatus()` | ⚠️ TO DO |
| 2562-2601 | POST /projects/:projectId/ensure-folder | Full folder creation + verification | ⚠️ TO DO |

### Analysis

**Immediate Action Required:**
1. **POST /projects/:projectId/sync-start** (line 1432) - Most complex, handles folder sync operations
   - Should be moved to Electron IPC handler
   - Client calls this when user wants to start sync
   
2. **GET /projects/:projectId/status** (line 1288) - Queries Syncthing status
   - Backend shouldn't query live Syncthing state
   - Could cache status updates from client
   - Or client queries Syncthing and sends status to backend

3. **POST /projects/:projectId/pause-sync** & **resume-sync** - Control operations
   - Should be client-initiated
   - Move to IPC handlers

4. **POST /projects/:projectId/ensure-folder** (line 2562) - Already partially addressed
   - This endpoint is for retroactive folder creation
   - Currently still calls Syncthing directly
   - Consider making this smarter: backend checks if folder exists in DB, client creates if needed

**Lower Priority:**
- Device management operations (add/remove device from folder)
- File list operations (can be replaced with snapshot data or client queries)

---

## Architecture Decision Points

### Option A: Status Queries
**Problem:** Backend needs to know folder status for validation

**Solution 1 (Recommended):** Client sends status on updates
- Client periodically queries Syncthing status via IPC
- Client sends updates to backend via new endpoint
- Backend stores in DB or cache
- Eliminates real-time queries

**Solution 2:** Keep status queries, add caching
- Keep backend status queries for now
- Add 30-60s cache layer
- Phase out over time

### Option B: Ensure Folder Operation
**Problem:** Backend needs to retroactively create missing folders

**Solution:** Make this client-initiated
- Backend provides endpoint to check folder status (uses cache or DB)
- If missing, client gets notified
- Client calls IPC to create folder
- Client calls webhook to notify backend of success

---

## Testing Strategy

1. **Project Creation Flow**
   - ✅ Create project with local path
   - ✅ Verify Syncthing folder created on client
   - ✅ Verify project accessible in dashboard
   - ⚠️ Need to test: Folder creation timeout handling

2. **Sync Operations** (when refactored)
   - Test pause/resume on client
   - Test device add/remove on client
   - Verify DB state matches Syncthing state

3. **Status Queries** (when refactored)
   - Test cached status accuracy
   - Test cache invalidation
   - Test client status updates

---

## Related Issues

- CSRF token errors: ✅ FIXED (auto-refresh on 403)
- Device registration: ✅ FIXED (auto-sync on login)
- Folder creation retry: ✅ FIXED (ensure-folder endpoint)

---

## Summary

**Status:** Architecture refactoring 30% complete
- ✅ Project creation (no Syncthing operations)
- ✅ Project deletion (no Syncthing operations)
- ⏳ Sync operations (11+ endpoints still calling Syncthing API)

**Next Steps:**
1. Refactor POST /projects/:projectId/sync-start (high priority)
2. Implement client-side status monitoring (medium priority)
3. Refactor remaining CRUD operations (lower priority)
4. Add comprehensive error handling for all client-side Syncthing ops
