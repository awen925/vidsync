# Phase 3 Feature Test Guide - Edit Project & Bug Fixes

## Quick Start Testing

### Feature 1: Header Logo ✅ DEPLOYED
**Status:** Code complete, logo1.png verified to exist

```bash
# To test:
1. Start the Electron app: npm start (in /electron folder)
2. Look at the top header
3. Should see: [LOGO] Vidsync (instead of 📹 Vidsync)
4. Logo should be white/transparent, 32px tall
```

**Expected Result:** Professional logo displays instead of emoji ✅

---

### Feature 2: Delete Project - Syncthing Removal ✅ DEPLOYED
**Status:** Code complete, config reload added

```bash
# To test:
1. Start Electron app with Syncthing running
2. Create a new project with a local folder path
3. Watch Syncthing GUI - folder should appear in list
4. In Vidsync, right-click project → Delete Project
5. Confirm deletion
6. Watch Syncthing GUI closely

# Expected: Within 1-2 seconds, folder disappears from Syncthing GUI
# Before fix: Folder would remain in Syncthing GUI
```

**What was fixed:**
- Added `restartSyncthingFolder()` method
- Calls POST `/rest/system/config/insync` after DELETE
- Signals Syncthing to reload configuration
- GUI updates automatically

---

### Feature 3: Edit Project ✅ DEPLOYED
**Status:** Code complete, ready for testing

#### Test 3A: Edit Menu Item
```bash
1. Open Vidsync app
2. Go to "Your Projects" tab
3. Right-click any project in the list
4. Context menu should show:
   ├── Edit Project  ← NEW OPTION
   └── Delete Project
```

#### Test 3B: Edit Dialog - Name & Description
```bash
1. Right-click project → "Edit Project"
2. Dialog should open with three fields:
   - Project Name (text field)
   - Description (multiline text field)
   - Local Path (text field + Browse button)
3. All fields should be pre-filled with current values
4. Edit name to "Test Project 2"
5. Edit description to "Updated description"
6. Click "Save Changes"
7. Dialog closes
8. Project list refreshes with new values

# Expected: Name and description update without warning
```

#### Test 3C: Edit Dialog - Path Change Warning
```bash
1. Right-click project → "Edit Project"
2. Click "Browse Folder" button
3. Select a DIFFERENT folder than current one
4. Notice local path field updates
5. Click "Save Changes"

# Expected: WARNING MODAL appears with:
- Title: "Large Local Path Change" with warning icon
- Message about full re-synchronization
- Suggestions:
  ✓ Create new project instead
  ✓ Wait for sync to complete
  ✓ Check disk space and bandwidth
- Two buttons:
  - "Cancel Edit" (close dialog without saving)
  - "Proceed Anyway" (continue with update)

6. Click "Cancel Edit"
   # Expected: Warning closes, Edit dialog remains open, path unchanged
7. Click "Browse Folder" again, select same DIFFERENT folder
8. Click "Save Changes" again to trigger warning
9. Click "Proceed Anyway"

# Expected: 
- Warning closes
- Project updates in backend
- Syncthing updates to new folder path
- Project list refreshes
- Dialog closes
```

---

## Testing Checklist

### Functional Tests
- [ ] Header shows logo1.png instead of emoji
- [ ] Logo is properly sized (32px tall, auto width)
- [ ] Delete project removes folder from Syncthing GUI
- [ ] Edit menu item appears on right-click
- [ ] Edit dialog opens with current values
- [ ] Can edit name and description
- [ ] Can browse for local path
- [ ] Warning modal appears when path changes
- [ ] Warning has icon and message about re-sync
- [ ] "Cancel Edit" button closes warning without saving
- [ ] "Proceed Anyway" button saves changes
- [ ] Project list refreshes after save

### Edge Cases
- [ ] Edit with same values (should save without warning)
- [ ] Edit name only (should save without warning)
- [ ] Edit path to same path (should save without warning)
- [ ] Edit path to new path (should show warning)
- [ ] Cancel dialog (should not change anything)
- [ ] Cancel from warning modal (should not save)
- [ ] Delete project while edit dialog open (shouldn't crash)

### TypeScript & Build
- [x] npm run build succeeds (verified ✅)
- [x] 0 TypeScript errors (verified ✅)
- [x] No console errors on startup (needs testing)

---

## Code Locations for Reference

### Header Logo Change
**File:** `electron/src/renderer/layouts/MainLayout.tsx`
**Lines:** ~113-122
**Change:** Replaced emoji with img tag showing logo1.png

### Syncthing Enhancement
**File:** `electron/src/main/syncthingManager.ts`
**Changes:**
- New method: `restartSyncthingFolder()` - sends POST to config/insync
- Enhanced: `removeFolder()` - calls restart after DELETE succeeds

### Edit Project Implementation
**File:** `electron/src/renderer/pages/Projects/YourProjectsPage.tsx`
**Components Added:**
- Edit menu item (line ~741)
- Edit dialog (line ~670-705)
- Warning modal (line ~707-745)

**State variables added:**
- editDialogOpen
- editingProject
- editProjectName
- editProjectDesc
- editProjectLocalPath
- editPathWarning

**Handlers added:**
- handleOpenEditDialog()
- handleEditProjectLocalPath()
- handleSaveEditProject()
- performEditProjectSave()

---

## Debugging Tips

### Logo not showing
1. Check file exists: `/electron/public/icons/logo1.png`
2. Check network tab for 404 errors on /icons/logo1.png
3. Verify img tag has correct src: `/icons/logo1.png` (with leading slash)

### Delete not removing from Syncthing
1. Check Syncthing API is running: localhost:8384/rest/system/version
2. Check Syncthing API key matches: Settings → GUI → API Key
3. Check /rest/system/config/insync returns 200 status
4. Wait 2-3 seconds after delete (config reload takes time)

### Edit dialog not opening
1. Check menu item has onClick handler
2. Check selectedMenuProject is not null
3. Check editingProject is being set with project data
4. Look for console errors

### Warning modal not showing
1. Check editPathWarning state is being set to true
2. Verify path actually changed (compare old vs new)
3. Check new path is not empty string
4. Look for console errors

---

## Success Criteria

All 3 features working together:
✅ Header shows professional logo instead of emoji
✅ Delete project removes folder from Syncthing within 2 seconds
✅ Edit menu item appears on right-click
✅ Edit dialog opens with current values
✅ Warning modal appears when changing path significantly
✅ Can save changes and refresh project list
✅ 0 TypeScript errors
✅ Build successful

---

## Rollback Plan (if needed)

If any feature needs rollback:

```bash
# View recent commits
git log --oneline -10

# Rollback to previous version
git revert f19cbab  # Replace with actual commit hash

# Or reset to previous state
git reset --hard HEAD~1
```

---

**Last Updated:** November 17, 2025
**Commit:** f19cbab
**Status:** Ready for testing
