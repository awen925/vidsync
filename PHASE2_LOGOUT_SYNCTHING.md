# Phase 2: Logout & Syncthing Auto-Config Implementation

## Overview
This document describes the implementation of:
1. **Logout Flow** - Clear session and secure storage, redirect to auth
2. **Syncthing Auto-Configuration** - Auto-configure folders when projects are opened or folders are selected

## Implementation Details

### 1. Logout Button & Handler

**File**: `electron/src/renderer/pages/Settings/SettingsPage.tsx`

#### Changes:
- Added `useNavigate` hook from react-router
- Imported `supabase` client for session management
- Added `loggingOut` state to show loading state
- Added `handleLogout` function that:
  1. Calls `supabase.auth.signOut()` to clear Supabase session
  2. Calls `window.api.secureStore.clearRefreshToken()` to remove secure token
  3. Navigates to `/auth` page

#### UI:
- Added logout button in "Account" section at bottom of settings
- Red button style to indicate destructive action
- Shows "Logging out..." when in progress

#### Flow:
```
User clicks Logout
  ↓
handleLogout() called
  ↓
supabase.auth.signOut() + clearRefreshToken()
  ↓
navigate('/auth')
  ↓
User redirected to login page
  ↓
Next login requires fresh authentication
```

### 2. Syncthing Auto-Configuration

**File**: `electron/src/main/syncthingManager.ts`

#### New Features:

1. **API Key Extraction**
   - Reads Syncthing's `config.xml` file to extract API key
   - API key needed for REST API calls to configure folders

2. **Syncthing Readiness Check**
   - `waitForSyncthingReady()` polls Syncthing REST API (`/rest/system/status`)
   - Waits up to 30 seconds for Syncthing process to be ready
   - Uses HTTPS with self-signed cert (rejectUnauthorized: false)

3. **Folder Configuration**
   - `addFolder()` creates folder config via REST API
   - Sends PUT request to `/rest/config/folders/{projectId}`
   - Folder config includes:
     - `id`: Project ID (unique identifier)
     - `label`: Human-readable name
     - `path`: Local directory path
     - `type`: "sendreceive" (can send and receive)
     - `rescanIntervalS`: 3600 (scan every hour)
     - `fsWatcherEnabled`: true (watch filesystem for changes)

4. **Enhanced startForProject()**
   - Waits 2 seconds for Syncthing to create `config.xml`
   - Extracts API key from config
   - Stores instance info including API key
   - Asynchronously (non-blocking):
     - Waits for Syncthing to be ready (API online)
     - Calls `addFolder()` to auto-configure the sync folder
     - Logs success/failure

#### Process Timeline:
```
1. startForProject(projectId, localPath) called
   ↓
2. Create home dir: ~/.vidsync/syncthing/{projectId}/
   ↓
3. Spawn Syncthing binary with -home flag
   ↓
4. Wait 2 seconds for config.xml to be created
   ↓
5. Read API key from config.xml
   ↓
6. Store instance info (process, homeDir, localPath, apiKey)
   ↓
7. Return success immediately to renderer
   ↓
8. [Background] Wait for Syncthing API to be ready (poll every 1s, timeout 30s)
   ↓
9. [Background] Send folder config via REST API
   ↓
10. [Background] Log success/failure (or silently fail if user doesn't check logs)
```

### 3. Project Detail Page Integration

**File**: `electron/src/renderer/pages/Projects/ProjectDetailPage.tsx`

#### Changes:
- Added `startSyncthingForProject()` function that calls IPC handler
- Updated useEffect to call `startSyncthingForProject()` when project loads and has `local_path`
- Updated `chooseFolder()` to also start Syncthing when user manually selects folder

#### Triggers:
1. **Auto-start on project open**: If project has `local_path` stored, Syncthing starts automatically
2. **User selects folder**: If user clicks "Choose Folder", Syncthing starts with that path
3. **Both cases**: Folder is auto-configured in Syncthing without user interaction

### 4. Workflow: From Project Creation to Sync

**Step 1: User Creates Project**
```
User fills form:
  - Project name: "Documentary Series"
  - Description: "Episode 1-3"
  - Local folder: /home/producer/videos/docs (via folder picker)
Click "Create Project"
  ↓
Frontend POST /api/projects with local_path
  ↓
Backend stores project with owner_id (from auth) + local_path
  ↓
Project created in database
```

**Step 2: User Opens Project**
```
User navigates to project detail page
  ↓
useEffect triggers, fetches project from API
  ↓
Project data includes local_path
  ↓
startSyncthingForProject(local_path) called
  ↓
Syncthing process spawned with dedicated home dir
  ↓
Config.xml created automatically by Syncthing
  ↓
API key extracted
  ↓
Syncthing comes online (API responds)
  ↓
Folder auto-configured via REST API
  ↓
Syncthing now syncing the local folder!
```

**Step 3: Ongoing Sync**
```
Producer adds/edits video files in local folder
  ↓
Syncthing detects changes (filesystem watcher)
  ↓
Syncthing creates history and prepares for sync
  ↓
When project shared with editor, editor's Syncthing connects
  ↓
Files are synced via Syncthing P2P protocol
```

## Technical Considerations

### Security
- **Logout clears tokens**: Both Supabase session and secure refresh token cleared
- **IPC sandboxing**: Folder selection restricted to `dialog:openDirectory` IPC call
- **HTTPS verification disabled**: Syncthing uses self-signed certs in dev/local; should enable in production

### Error Handling
- **Graceful degradation**: If Syncthing API doesn't come online, folder config silently fails
  - User can still manually configure in Syncthing web UI
  - Should probably add UI indicator that folder isn't configured
- **Invalid paths**: If `local_path` doesn't exist, Syncthing will still configure but won't sync
  - Validation could be added to project creation or detail page
- **Already running**: If Syncthing already running for projectId, returns existing instance
  - Prevents duplicate processes

### Performance
- **Non-blocking startup**: Syncthing configuration happens in background
- **2-second initial wait**: Allows time for Syncthing to create config files
- **30-second timeout**: API readiness polling won't hang forever
- **1-second polling interval**: Balances between quick startup and CPU usage

### Debugging
- All operations logged to console
- Format: `[Syncthing:projectId] message`
- Can trace folder config success/failure in DevTools

## Files Modified

1. **electron/src/renderer/pages/Settings/SettingsPage.tsx**
   - Added logout button and handler
   - Clears Supabase session + secure token
   - Redirects to /auth

2. **electron/src/main/syncthingManager.ts**
   - Enhanced with API key extraction
   - Added Syncthing readiness polling
   - Added folder auto-configuration
   - Non-blocking async folder setup

3. **electron/src/renderer/pages/Projects/ProjectDetailPage.tsx**
   - Added `startSyncthingForProject()` function
   - Auto-starts Syncthing when project loads
   - Auto-starts when user chooses folder

## Testing Checklist

- [ ] **Logout Flow**
  - Navigate to Settings page
  - Click "Logout" button
  - Verify redirected to /auth page
  - Verify cannot access projects without logging back in
  - Verify refresh token cleared from `~/.vidsync/refresh_token.json`

- [ ] **Syncthing Auto-Start on Project Open**
  - Create a project with local_path (e.g., ~/test-sync)
  - Close and reopen the app
  - Navigate to project detail page
  - Check electron logs for `[Syncthing:projectId] Folder added`
  - Verify Syncthing folder config created

- [ ] **Syncthing Auto-Start on Folder Selection**
  - Open project detail page
  - Click "Choose Folder"
  - Select a different directory
  - Verify new Syncthing folder config created

- [ ] **Syncthing Web UI**
  - Open http://localhost:8384 (default Syncthing port)
  - Verify folder appears in Syncthing web UI
  - Check folder path matches local_path
  - Verify sync is monitoring folder

- [ ] **Error Cases**
  - Stop Syncthing process manually
  - Try opening project - should handle gracefully
  - No crashes expected, just no sync activity

## Next Steps

1. **Fix Production Warnings**
   - Remove HTTPS verification disable (use proper certs)
   - Add UI indicator for sync status per project
   - Add validation that local_path exists before creating project

2. **Enhance Syncthing Config**
   - Add editor device to project folder's allowed devices list
   - Set folder permissions per member role (owner vs editor)
   - Add folder versioning configuration

3. **Real-time Sync Status**
   - Poll Syncthing `/rest/db/browse` to get file list
   - Poll `/rest/db/status` for completion percentage
   - Update UI with per-file or per-device sync progress

4. **Multi-Device Workflow**
   - When project shared with another user:
     - Generate invite code or link
     - Second device creates mirror project folder
     - Syncthing connects devices and syncs folders
   - Nebula handles encrypted P2P tunnel between devices

## Migration Notes

No database migration needed - the `local_path` column already exists in projects table.
The schema migration `003-remove-users-fk-constraints.sql` was previously applied to allow owner_id to reference Supabase auth users directly.

If applying this code to an existing database:
1. Run `npm run migrate` in cloud/ to apply FK constraint removal
2. Ensure Supabase is configured with valid URL and anon key
3. Ensure Syncthing binary exists at expected path (or in PATH)
