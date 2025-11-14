# listDirectory IPC Quick Start

## What Changed?

Your file browser now uses a simpler, faster approach for local projects:
- **Old way**: Recursive API calls trying to scan entire directory tree
- **New way**: Simple `listDirectory` IPC that returns one folder's contents at a time

## How to Test

### 1. Local Project File Browser
```bash
# Start the electron app
cd electron
npm start
```

### 2. Create a Local Project
1. Click "Create Project" button
2. Give it a name and description
3. **Important**: Set a local path (e.g., `/home/user/Videos` or `~/code/myproject`)
4. Click "Create"

### 3. Navigate Files
1. Select your local project
2. Right panel should show files from that folder
3. Click any folder → should show its contents
4. Click back arrow → go to previous folder
5. Try navigating deep (5+ levels) - should work instantly

### 4. Test with Large Folders
Try navigating to a folder with 10,000+ files - should still be fast!

## What's Different for Users?

### Before (❌ Problems)
- Files disappeared at depth 3-4
- Deep navigation didn't work
- Slow with large folders
- Complex error messages

### After (✅ Fixed)
- Navigate unlimited depth
- Instant per-folder loading
- Handles 10k+ files easily
- Simple, clear behavior

## For Invited (Remote) Projects

These still use the cloud API (no changes yet):
- Files come from cloud backend
- Will add sync status indicators soon (✓ synced, ⟳ syncing, ⚠ waiting, ✗ deleted)

## Technical Details

### IPC Handler
```typescript
// In electron/src/main/main.ts
ipcMain.handle('fs:listDirectory', async (_ev, dirPath: string, includeHidden?: boolean) => {
  // Returns immediate children of dirPath with full paths
});
```

### React Hook
```typescript
// In components
const entries = await window.api.fsListDirectory(folderPath);
// entries[0] = { name: 'file.txt', type: 'file', fullPath: '/path/to/file.txt', ... }
```

### YourProjectsPage Changes
- Local projects: Use IPC → fast, direct OS access
- Remote projects: Use API → existing behavior, will add sync status later

## Troubleshooting

### Files not showing?
1. Check project has `local_path` set
2. Check path exists and is readable
3. Check permissions: `ls -la /path/to/folder`

### Navigation slow?
1. Should be instant per-folder
2. If it's not, check if IPC is working:
   ```javascript
   // In browser console
   window.api.fsListDirectory('/home/user').then(r => console.log(r))
   ```

### Errors in console?
1. Check folder path is correct
2. Check folder isn't deleted
3. Check permissions

## Files Changed
```
✓ electron/src/main/fileScanner.ts    - Added listDirectory()
✓ electron/src/main/main.ts           - Added IPC handler
✓ electron/src/main/preload.ts        - Added API exposure
✓ electron/src/renderer/pages/Projects/YourProjectsPage.tsx - Updated to use IPC
```

## What's Next?

1. **Sync Status for Remote Projects** (in design phase)
   - Show whether files are synced ✓, syncing ⟳, waiting ⚠, or deleted ✗
   - Pagination for 10k+ files

2. **Performance Optimizations**
   - Virtual scrolling for very large folders
   - Batch sync status queries
   - Caching improvements

## Questions?
See `LISTDIRECTORY_IPC_IMPLEMENTATION.md` for full technical details.
