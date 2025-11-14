# Phase 2: Local Path Fix Summary

## Problem Identified
Project creation was failing with FK constraint error:
```
insert or update on table 'projects' violates foreign key constraint 'projects_owner_id_fkey'
```

Additionally, the ProjectsPage UI was not capturing the local folder path where video files are stored.

## Root Cause Analysis
1. **Schema Issue**: `projects.owner_id` had a Foreign Key constraint referencing a custom `users` table that doesn't exist in Supabase
2. **Architecture Issue**: Supabase auth users live in `auth.users` table, not a custom table
3. **UI Issue**: ProjectsPage form had no folder picker to capture `local_path`

## Solutions Implemented

### 1. Schema Migration (New)
**File**: `cloud/migrations/003-remove-users-fk-constraints.sql`
- Removes FK constraint from `projects.owner_id`
- Removes FK constraints from `project_members.user_id` and `project_members.invited_by`
- Uses Supabase auth UUIDs directly without FK enforcement
- All constraints removed gracefully with IF EXISTS checks

### 2. Backend API (Already Present, Verified)
**File**: `cloud/src/api/projects/routes.ts`
- Already extracts `local_path` from request body: `const { name, description, local_path, auto_sync } = req.body;`
- Already includes it in the insert payload: `local_path: local_path || null,`
- No changes needed - was ready to go!

### 3. Frontend UI Enhancement
**File**: `electron/src/renderer/pages/Projects/ProjectsPage.tsx`
- Added `localPath` state variable
- Added `handleChooseFolder` function that calls IPC handler `window.api.openDirectory()`
- Updated form to include folder picker UI:
  - Read-only input showing selected path
  - "Choose Folder" button to open directory picker
- Updated `handleCreate` to send `local_path` in POST request body

### 4. IPC Infrastructure (Already Present, Verified)
**File**: `electron/src/main/main.ts` and `electron/src/main/preload.ts`
- IPC handler `dialog:openDirectory` already implemented
- Exposes `window.api.openDirectory()` to renderer
- Returns selected directory path or null

## How It Works Now

### Project Creation Flow
1. User clicks "New Project" or visits `/projects/new`
2. User fills in:
   - Project name (required)
   - Description (optional)
   - Clicks "Choose Folder" button to select local video folder (optional)
3. User clicks "Create Project"
4. Frontend sends POST to `/api/projects`:
   ```json
   {
     "name": "My Video Project",
     "description": "Documentary series",
     "local_path": "/home/producer/Videos/my-docs"
   }
   ```
5. Backend creates project with `owner_id` = current user's Supabase auth UUID
6. No FK constraint violations - owner_id is accepted as plain UUID
7. User is redirected to project detail page

## What local_path Enables
- **Video Producer's Folder**: Marks where the producer stores raw video files on their machine
- **Syncthing Config**: Next phase will auto-generate Syncthing folder config pointing to this path
- **Sync Scope**: Defines the boundary of what gets synced to editor machines
- **Project Isolation**: Each project points to a separate folder hierarchy

## Files Modified
1. **New Migration**: `cloud/migrations/003-remove-users-fk-constraints.sql`
2. **Enhanced UI**: `electron/src/renderer/pages/Projects/ProjectsPage.tsx` (folder picker added)
3. **Verified Unchanged**: 
   - Backend API routes (already handles local_path)
   - IPC handlers (already expose openDirectory)
   - Preload bridge (already setup)

## Testing Checklist
- [ ] Apply migration to dev database: `npm run migrate` (in cloud/)
- [ ] Start both cloud and Electron apps
- [ ] Navigate to Projects page
- [ ] Create a new project
- [ ] Click "Choose Folder" and select a directory
- [ ] Submit form - project should be created successfully
- [ ] Verify no FK constraint errors in cloud logs
- [ ] Verify local_path is stored in database: `SELECT id, name, local_path FROM projects LIMIT 1;`
- [ ] Verify can navigate to project detail page

## Next Steps
1. **Test project creation** with local_path to verify FK fix works
2. **Implement sign-out button** (quick UX improvement)
3. **Implement Syncthing folder config** to auto-configure sync based on local_path
4. **Implement Nebula config** for secure P2P networking
5. **Real-time sync status** from agent to UI

## Technical Notes
- No custom users table exists - we rely entirely on Supabase auth.users
- Projects can be shared via `project_members` table with other Supabase users (by UUID)
- Each project belongs to exactly one owner (the creator)
- The `local_path` is metadata only - actual sync config is generated in Syncthing/Nebula
