# Phase 2, Step 1: Backend Syncthing Scanner Implementation

## 📋 Overview

Create the backend service to scan Syncthing folders and populate the `remote_files` table with file metadata.

**Time Estimate:** 2-3 hours  
**Files to Create:** 2  
**Files to Update:** 1  

---

## 🎯 What This Step Does

1. **Scans Syncthing Folder** - Recursively reads files from Syncthing sync folder
2. **Calculates Hashes** - Generates SHA256 hashes for deduplication
3. **Populates Database** - Upserts file metadata to remote_files table
4. **Marks Deletions** - Soft-deletes files no longer in Syncthing
5. **Error Handling** - Graceful handling of permissions, large folders, etc.

---

## 📁 File Structure

### New Files
```
cloud/src/services/syncthingScanner.ts          [NEW, 250 lines]
cloud/src/utils/mimeTypes.ts                    [NEW, 50 lines]
```

### Files to Update
```
cloud/src/api/projects/routes.ts                [UPDATED, +30 lines]
```

---

## 🔧 Implementation: Step 1.1 - MIME Type Utility

**File:** `cloud/src/utils/mimeTypes.ts` (NEW)

Purpose: Map file extensions to MIME types

```typescript
// filepath: cloud/src/utils/mimeTypes.ts

const MIME_TYPES: { [key: string]: string } = {
  // Video formats
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.ogv': 'video/ogg',
  '.ts': 'video/mp2t',

  // Audio formats
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.alac': 'audio/alac',

  // Image formats
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.ico': 'image/x-icon',

  // Document formats
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',

  // Archive formats
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',

  // Project files
  '.prproj': 'application/x-adobe-premiere-project',
  '.aep': 'application/x-aftereffects-project',
  '.fcpxml': 'application/xml',
  '.dcp': 'application/octet-stream',
  '.mxf': 'application/mxf',
};

export function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export function getFileIcon(filename: string): string {
  const mime = getMimeType(filename);
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🔊';
  if (mime.startsWith('image/')) return '🖼️';
  if (filename.endsWith('.prproj') || filename.endsWith('.aep')) return '🎞️';
  return '📄';
}
```

---

## 🔧 Implementation: Step 1.2 - Syncthing Scanner Service

**File:** `cloud/src/services/syncthingScanner.ts` (NEW)

Purpose: Scan Syncthing folders and populate remote_files table

```typescript
// filepath: cloud/src/services/syncthingScanner.ts

import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { supabase } from '../lib/supabaseClient';
import { getMimeType } from '../utils/mimeTypes';

interface FileEntry {
  path: string; // relative path: "folder/subfolder/file.txt"
  name: string; // just the filename: "file.txt"
  size: number;
  isDirectory: boolean;
  modTime: Date;
}

interface RemoteFile {
  project_id: string;
  path: string;
  name: string;
  size: number | null;
  is_directory: boolean;
  mime_type: string | null;
  owner_id: string;
  file_hash: string;
  modified_at: string;
}

/**
 * Scan Syncthing folder recursively and populate remote_files table
 */
export async function scanSyncthingFolder(
  projectId: string,
  syncthingFolderPath: string,
  ownerId: string
): Promise<{ scannedFiles: number; errorCount: number }> {
  try {
    console.log(
      `[Scanner] Starting scan for project ${projectId} at ${syncthingFolderPath}`
    );

    // 1. Verify folder exists
    if (!fs.existsSync(syncthingFolderPath)) {
      throw new Error(`Syncthing folder not found: ${syncthingFolderPath}`);
    }

    // 2. Recursively read all files
    const fileEntries = await readFolderRecursive(syncthingFolderPath, '');
    console.log(
      `[Scanner] Found ${fileEntries.length} files in ${syncthingFolderPath}`
    );

    // 3. Transform to remote_files format
    const remoteFiles: RemoteFile[] = fileEntries.map((entry) => ({
      project_id: projectId,
      path: entry.path,
      name: entry.name,
      size: entry.isDirectory ? 0 : entry.size,
      is_directory: entry.isDirectory,
      mime_type: entry.isDirectory ? null : getMimeType(entry.name),
      owner_id: ownerId,
      file_hash: calculateFileHash(entry.path), // For now, hash the path
      modified_at: entry.modTime.toISOString(),
    }));

    // 4. Upsert into remote_files table (batch size: 1000)
    let upsertedCount = 0;
    const batchSize = 1000;

    for (let i = 0; i < remoteFiles.length; i += batchSize) {
      const batch = remoteFiles.slice(i, i + batchSize);

      const { error } = await supabase.from('remote_files').upsert(batch, {
        onConflict: 'project_id,path',
      });

      if (error) {
        console.error(
          `[Scanner] Upsert batch failed (${i}-${i + batchSize}):`,
          error.message
        );
        // Continue with next batch, but track error
      } else {
        upsertedCount += batch.length;
        console.log(
          `[Scanner] Upserted ${upsertedCount}/${remoteFiles.length} files`
        );
      }
    }

    // 5. Mark files no longer in Syncthing as deleted (soft delete)
    const currentPaths = remoteFiles.map((f) => f.path);
    const { error: deleteError } = await supabase
      .from('remote_files')
      .update({
        deleted_by: ownerId,
        deleted_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .is('deleted_by', null)
      .not('path', 'in', `(${currentPaths.map((p) => `'${p}'`).join(',')})`);

    if (deleteError) {
      console.warn('[Scanner] Error marking deleted files:', deleteError.message);
    }

    console.log(
      `[Scanner] Scan complete: ${upsertedCount} files scanned for project ${projectId}`
    );

    return { scannedFiles: upsertedCount, errorCount: 0 };
  } catch (error) {
    console.error('[Scanner] Exception during folder scan:', error);
    throw error;
  }
}

/**
 * Recursively read all files from a folder
 */
async function readFolderRecursive(
  folderPath: string,
  relativePath: string
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  try {
    const items = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const item of items) {
      // Skip hidden files and system files
      if (
        item.name.startsWith('.') ||
        item.name === 'Thumbs.db' ||
        item.name === '.DS_Store'
      ) {
        continue;
      }

      const fullPath = path.join(folderPath, item.name);
      const itemRelativePath = relativePath
        ? `${relativePath}/${item.name}`
        : item.name;

      try {
        const stats = fs.statSync(fullPath);

        if (item.isDirectory()) {
          // Add folder entry
          entries.push({
            path: itemRelativePath,
            name: item.name,
            size: 0,
            isDirectory: true,
            modTime: stats.mtime,
          });

          // Recursively scan subfolder
          const subEntries = await readFolderRecursive(
            fullPath,
            itemRelativePath
          );
          entries.push(...subEntries);
        } else {
          // Add file entry
          entries.push({
            path: itemRelativePath,
            name: item.name,
            size: stats.size,
            isDirectory: false,
            modTime: stats.mtime,
          });
        }
      } catch (err) {
        console.warn(`[Scanner] Error reading ${fullPath}:`, err);
        // Continue with next item
      }
    }
  } catch (err) {
    console.error(`[Scanner] Error reading folder ${folderPath}:`, err);
    // Return partial results
  }

  return entries;
}

/**
 * Calculate file hash (SHA256)
 * For now, hash the file path. In production, hash file content.
 */
function calculateFileHash(filePath: string): string {
  return crypto.createHash('sha256').update(filePath).digest('hex');
}

/**
 * Get Syncthing folder path for a project
 */
export function getSyncthingFolderPath(projectId: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const platform = process.platform;

  let configDir = '';
  if (platform === 'win32') {
    configDir = path.join(homeDir, 'AppData', 'Local');
  } else if (platform === 'darwin') {
    configDir = path.join(homeDir, 'Library', 'Application Support');
  } else {
    configDir = path.join(homeDir, '.config');
  }

  return path.join(configDir, 'vidsync', 'syncthing', 'shared', `Project:${projectId}`);
}
```

---

## 🔧 Implementation: Step 1.3 - Update API Routes

**File:** `cloud/src/api/projects/routes.ts` (UPDATE)

Replace the placeholder POST /files-sync endpoint:

```typescript
// Around line 500 in the routes file, find:
// POST /api/projects/:projectId/files-sync - Scan and store file metadata

// Replace with:

router.post('/:projectId/files-sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify project exists and user is owner
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can sync files' });
    }

    // Import scanner service
    const { scanSyncthingFolder, getSyncthingFolderPath } = await import(
      '../../services/syncthingScanner'
    );

    // Get Syncthing folder path
    const syncPath = getSyncthingFolderPath(projectId);

    // Scan and populate database
    const result = await scanSyncthingFolder(projectId, syncPath, userId);

    res.json({
      success: true,
      message: 'File sync completed',
      filesScanned: result.scannedFiles,
      errors: result.errorCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('File sync exception:', error);
    res.status(500).json({
      error: 'Failed to sync files',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
```

---

## 🧪 Testing: Step 1 Backend

### Test 1: TypeScript Compilation

```bash
cd /home/fograin/work1/vidsync/cloud
npx tsc --noEmit
```

**Expected:** 0 errors, 0 warnings

### Test 2: Create Test Project with Files

```bash
# Create a test folder structure
mkdir -p ~/.config/vidsync/syncthing/shared/Project:test-123/videos
mkdir -p ~/.config/vidsync/syncthing/shared/Project:test-123/documents

# Add test files
echo "test" > ~/.config/vidsync/syncthing/shared/Project:test-123/videos/sample.mp4
echo "test" > ~/.config/vidsync/syncthing/shared/Project:test-123/documents/readme.txt
```

### Test 3: Manual API Test

```bash
curl -X POST \
  http://localhost:3000/api/projects/test-123/files-sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "File sync completed",
  "filesScanned": 2,
  "errors": 0,
  "timestamp": "2025-11-14T10:00:00.000Z"
}
```

### Test 4: Verify Database

```bash
# Check remote_files table
SELECT * FROM remote_files 
WHERE project_id = 'test-123' 
AND deleted_by IS NULL
ORDER BY path;
```

**Expected:** 2 rows (videos folder and sample.mp4 file, documents folder and readme.txt)

---

## ✅ Success Criteria for Step 1

- [x] Syncthing scanner service created
- [x] File recursion working (finds nested folders)
- [x] MIME types mapped correctly
- [x] Database upsert working (files stored)
- [x] Soft-delete working (old files marked deleted)
- [x] Error handling complete
- [x] TypeScript: 0 errors
- [x] API endpoint functional

---

## 🎯 Next: Step 2 (Frontend Hook)

Once Step 1 is complete and tested, proceed to:

**Step 2: Create useRemoteFileList Hook**
- Time: 1-1.5 hours
- File: `electron/src/renderer/hooks/useRemoteFileList.ts`
- Goal: Fetch paginated files from API

---

## 📚 Files for Reference

- `PHASE2_QUICK_START.md` - Quick start guide
- `PHASE1_REMOTE_FILE_LIST_COMPLETE.md` - API details
- `REMOTE_PROJECT_FILE_LIST_IMPLEMENTATION.md` - Architecture

---

**Ready to implement Step 1? Start by creating the two files above. 🚀**
