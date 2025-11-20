# Phase 2d: Detailed Task Breakdown

## Task 1: Cloud API Endpoint for Snapshot Upload

### Location
`/cloud/src/routes/projects.ts` (add new route handler)

### Endpoint Details
```
POST /projects/:projectId/snapshot
Headers: Authorization: Bearer <token>
Body: JSON snapshot metadata
Response: { ok: true, snapshotUrl, snapshotSize, uploadedAt }
```

### Implementation Steps

**Step 1a: Add route handler**
```typescript
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { supabase } from '../config/supabase';
import * as zlib from 'zlib';
import { v4 as uuidv4 } from 'uuid';

router.post('/:projectId/snapshot', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    
    // Step 1b: Validate project ownership
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single();
    
    if (projectErr || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    
    if (project.owner_id !== userId) {
      return res.status(403).json({ ok: false, error: 'Unauthorized' });
    }
    
    // Step 1c: Validate snapshot JSON
    const snapshotData = req.body;
    if (!snapshotData || typeof snapshotData !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid snapshot format' });
    }
    
    // Step 1d: Convert to JSON string
    const jsonString = JSON.stringify(snapshotData, null, 2);
    const jsonBuffer = Buffer.from(jsonString);
    
    // Step 1e: Compress with gzip
    const compressedBuffer = await new Promise((resolve, reject) => {
      zlib.gzip(jsonBuffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    // Step 1f: Generate storage path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${timestamp}.json.gz`;
    const storagePath = `projects/${projectId}/${filename}`;
    
    // Step 1g: Upload to Supabase Storage
    const { data: uploadData, error: uploadErr } = await supabase
      .storage
      .from('project-snapshots')
      .upload(storagePath, compressedBuffer, {
        contentType: 'application/gzip',
        upsert: false
      });
    
    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return res.status(500).json({ 
        ok: false, 
        error: 'Failed to upload snapshot to storage' 
      });
    }
    
    // Step 1h: Generate public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('project-snapshots')
      .getPublicUrl(storagePath);
    
    // Step 1i: Update project metadata in database
    const { error: updateErr } = await supabase
      .from('projects')
      .update({
        snapshot_url: publicUrl,
        snapshot_updated_at: new Date().toISOString(),
        snapshot_file_count: snapshotData.fileCount || 0,
        snapshot_total_size: snapshotData.totalSize || 0
      })
      .eq('id', projectId);
    
    if (updateErr) {
      console.error('Database update error:', updateErr);
      // Don't fail - snapshot is already in storage
    }
    
    // Step 1j: Return success response
    res.json({
      ok: true,
      snapshotUrl: publicUrl,
      snapshotSize: compressedBuffer.length,
      uploadedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Snapshot upload error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});
```

### Database Schema Update

**Migration file: `/cloud/migrations/003-add-snapshot-columns.sql`**
```sql
-- Add snapshot metadata columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_updated_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_file_count INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snapshot_total_size BIGINT DEFAULT 0;

-- Index for snapshot queries
CREATE INDEX IF NOT EXISTS idx_projects_snapshot_updated 
  ON projects(snapshot_updated_at DESC);
```

### Storage Bucket Setup

**File: `/cloud/scripts/setup-storage.ts`**
```typescript
import { supabase } from '../config/supabase';

async function setupStorageBucket() {
  try {
    // Create project-snapshots bucket if not exists
    const { data, error } = await supabase
      .storage
      .createBucket('project-snapshots', {
        public: true,
        fileSizeLimit: 5368709120  // 5GB max
      });
    
    if (error && error.message.includes('already exists')) {
      console.log('Bucket already exists');
    } else if (error) {
      throw error;
    } else {
      console.log('Bucket created:', data);
    }
    
    // Set bucket policies
    const { error: policyErr } = await supabase.rpc('sql', {
      query: `
        CREATE POLICY "Allow public read" ON storage.objects
        FOR SELECT USING (bucket_id = 'project-snapshots');
        
        CREATE POLICY "Allow authenticated upload" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'project-snapshots');
      `
    });
    
    if (policyErr) console.warn('Policy setup error (may already exist):', policyErr);
  } catch (error) {
    console.error('Storage setup error:', error);
    throw error;
  }
}

setupStorageBucket();
```

---

## Task 2: Electron UI Update

### Location
`/electron/src/renderer/pages/Projects/YourProjectsPage.tsx`

### Current Implementation to Replace

**Current:**
```typescript
const handleCreateProject = async () => {
  if (!newProjectName.trim()) return;
  setCreatingProject(true);
  setCreationStatus('Creating project...');
  
  try {
    const response = await cloudAPI.post('/projects', {
      name: newProjectName,
      description: newProjectDesc,
      local_path: newProjectLocalPath || null,
    });
    // ...
  }
};
```

### New Implementation

**Step 2a: Add imports**
```typescript
import { v4 as uuidv4 } from 'uuid';
import { useUserStore } from '../../stores/userStore';
```

**Step 2b: Replace handler**
```typescript
const handleCreateProject = async () => {
  if (!newProjectName.trim()) return;
  
  setCreatingProject(true);
  setCreationStatus('Creating project...');
  
  try {
    const userStore = useUserStore.getState();
    const userId = userStore.user?.id;
    const deviceId = await (window as any).api.getDeviceId?.() || 'unknown-device';
    const accessToken = userStore.authToken;
    
    if (!userId || !accessToken) {
      throw new Error('Not authenticated');
    }
    
    // Validate local path
    if (newProjectLocalPath) {
      setCreationStatus('Validating folder path...');
      const isValid = await (window as any).api.validateProjectPath?.(newProjectLocalPath);
      if (!isValid) {
        throw new Error('Invalid or inaccessible folder path');
      }
    }
    
    // Generate projectId clientside
    const projectId = uuidv4();
    
    setCreationStatus('Creating project in database...');
    
    // Call Go service instead of cloud API directly
    const response = await (window as any).api.createProjectWithSnapshot({
      projectId,
      name: newProjectName,
      description: newProjectDesc,
      localPath: newProjectLocalPath || null,
      deviceId,
      ownerId: userId,
      accessToken
    });
    
    if (!response.ok) {
      throw new Error(response.error || 'Failed to create project');
    }
    
    const createdProjectId = response.projectId || projectId;
    
    // Show intermediate success
    setCreationStatus('Project created, generating snapshot...');
    
    // Start polling for snapshot completion
    let isComplete = false;
    let pollAttempts = 0;
    const maxPolls = 300; // 5 minutes at 1s intervals
    
    while (!isComplete && pollAttempts < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
      pollAttempts++;
      
      try {
        const projectStatus = await cloudAPI.get(`/projects/${createdProjectId}`);
        
        if (projectStatus.data?.snapshot_url) {
          // Snapshot complete!
          isComplete = true;
          setCreationStatus('✓ Project created successfully!');
        } else {
          // Update status based on phase
          const syncStatus = projectStatus.data?.sync_status;
          if (syncStatus?.state === 'scanning') {
            setCreationStatus(`Scanning files... (${projectStatus.data?.snapshot_file_count || '?'} files)`);
          } else if (syncStatus?.state === 'syncing') {
            setCreationStatus('Synchronizing files...');
          } else {
            setCreationStatus('Uploading snapshot...');
          }
        }
      } catch (statusErr) {
        // Polling error, continue
        console.warn('Status poll error:', statusErr);
      }
    }
    
    if (!isComplete) {
      console.warn('Snapshot generation timeout, but project created');
      setCreationStatus('Project created (snapshot generation in progress)');
    }
    
    // Delay closing dialog for visibility
    setTimeout(() => {
      setCreateDialogOpen(false);
      setCreatingProject(false);
      setCreationStatus('');
      setNewProjectName('');
      setNewProjectDesc('');
      setNewProjectLocalPath('');
      
      // Refresh projects list
      fetchProjects();
    }, 1500);
    
  } catch (error: any) {
    console.error('Failed to create project:', error);
    setCreatingProject(false);
    setCreationStatus(`Error: ${error.message || 'Unknown error'}`);
    
    // Show error for a few seconds
    setTimeout(() => {
      setCreationStatus('');
    }, 3000);
  }
};
```

**Step 2c: Add helper functions in IPC bridge**

`/electron/src/main/ipc-bridge.ts`:
```typescript
// Get current device ID
ipcMain.handle('getDeviceId', async () => {
  // Load from electron-store or generate
  const deviceId = store.get('deviceId') || generateDeviceId();
  store.set('deviceId', deviceId);
  return deviceId;
});

// Validate project path
ipcMain.handle('validateProjectPath', async (event, path: string) => {
  try {
    const stat = await fs.promises.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
});

// Create project with snapshot via Go service
ipcMain.handle('createProjectWithSnapshot', async (event, data: any) => {
  try {
    return await goAgentClient.createProjectWithSnapshot(
      data.projectId,
      data.name,
      data.description,
      data.localPath,
      data.deviceId,
      data.ownerId,
      data.accessToken
    );
  } catch (error: any) {
    return {
      ok: false,
      error: error.message
    };
  }
});
```

---

## Task 3: Project Status Endpoint

### Location
`/go-agent/internal/handlers/project.go`

### Implementation

**Add method to ProjectService:**
```go
// ProjectStatus represents current project status
type ProjectStatus struct {
    ProjectID          string                 `json:"projectId"`
    Status             string                 `json:"status"`
    SnapshotStep       string                 `json:"snapshotStep,omitempty"`
    SnapshotProgress   int                    `json:"snapshotProgress"`
    SnapshotUrl        string                 `json:"snapshotUrl,omitempty"`
    FolderStatus       map[string]interface{} `json:"folderStatus,omitempty"`
}

// GetProjectStatus returns current project status including snapshot progress
func (ps *ProjectService) GetProjectStatus(ctx context.Context, projectID string) (*ProjectStatus, error) {
    ps.logger.Debug("[ProjectService] Getting project status: %s", projectID)
    
    status, err := ps.syncClient.GetFolderStatus(projectID)
    if err != nil {
        ps.logger.Error("[ProjectService] Failed to get folder status: %v", err)
        return nil, err
    }
    
    // TODO: Get snapshot status from database/cache
    // For now, return basic status
    
    return &ProjectStatus{
        ProjectID:     projectID,
        Status:        "active",
        SnapshotStep:  "scanning",  // Could be: waiting, scanning, uploading, complete
        SnapshotProgress: 30,        // Percentage
        FolderStatus:  status,
    }, nil
}
```

**Add handler:**
```go
// GetProjectStatus gets project status including snapshot progress
func (h *ProjectHandler) GetProjectStatus(w http.ResponseWriter, r *http.Request) {
    projectID := r.PathValue("projectId")
    
    result, err := h.service.GetProjectStatus(r.Context(), projectID)
    if err != nil {
        h.logger.Error("Failed to get project status: %v", err)
        http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}
```

**Add route:**
```go
mux.HandleFunc("GET /api/v1/projects/{projectId}/status", r.projectHandler.GetProjectStatus)
```

---

## Task 4: Retry Logic for Snapshot Upload

### Location
`/go-agent/internal/services/file_service.go`

### Implementation

**Add retry wrapper:**
```go
// uploadSnapshotToCloudWithRetry uploads snapshot with exponential backoff
func (fs *FileService) uploadSnapshotToCloudWithRetry(
    ctx context.Context,
    projectID string,
    snapshotJSON []byte,
    accessToken string,
) (string, error) {
    maxRetries := 3
    backoffDelays := []time.Duration{
        1 * time.Second,
        2 * time.Second,
        4 * time.Second,
    }
    
    var lastErr error
    
    for attempt := 0; attempt < maxRetries; attempt++ {
        fs.logger.Info("[FileService] Snapshot upload attempt %d/%d for project: %s", 
            attempt+1, maxRetries, projectID)
        
        // Try to upload
        snapshotUrl, err := fs.uploadSnapshotToCloud(ctx, projectID, snapshotJSON, accessToken)
        if err == nil {
            fs.logger.Info("[FileService] Snapshot uploaded successfully on attempt %d", attempt+1)
            return snapshotUrl, nil
        }
        
        lastErr = err
        fs.logger.Warn("[FileService] Snapshot upload failed (attempt %d): %v", attempt+1, err)
        
        // Check if we should retry
        if attempt < maxRetries-1 {
            // Check if error is retryable (not 403/404)
            if shouldRetryUpload(err) {
                delay := backoffDelays[attempt]
                fs.logger.Info("[FileService] Retrying in %v...", delay)
                
                select {
                case <-time.After(delay):
                    // Continue to next attempt
                case <-ctx.Done():
                    return "", ctx.Err()
                }
            } else {
                fs.logger.Warn("[FileService] Non-retryable error, giving up")
                return "", err
            }
        }
    }
    
    fs.logger.Error("[FileService] Snapshot upload failed after %d attempts", maxRetries)
    return "", fmt.Errorf("snapshot upload failed: %w", lastErr)
}

// shouldRetryUpload determines if an error is worth retrying
func shouldRetryUpload(err error) bool {
    if err == nil {
        return false
    }
    
    errStr := err.Error()
    
    // Retry on network errors
    if strings.Contains(errStr, "timeout") ||
        strings.Contains(errStr, "connection refused") ||
        strings.Contains(errStr, "temporary failure") {
        return true
    }
    
    // Retry on 5xx errors
    if strings.Contains(errStr, "500") ||
        strings.Contains(errStr, "502") ||
        strings.Contains(errStr, "503") ||
        strings.Contains(errStr, "504") {
        return true
    }
    
    // Don't retry on auth errors
    if strings.Contains(errStr, "401") ||
        strings.Contains(errStr, "403") ||
        strings.Contains(errStr, "404") {
        return false
    }
    
    return true // Retry on unknown errors
}
```

**Update GenerateSnapshot to use retry:**
```go
// In GenerateSnapshot, replace:
// snapshotURL, err := fs.uploadSnapshotToCloud(...)

// With:
snapshotURL, err := fs.uploadSnapshotToCloudWithRetry(ctx, projectID, snapshotJSON, accessToken)
if err != nil {
    fs.logger.Warn("[FileService] Final snapshot upload failed: %v", err)
    // Don't return error - project still works without snapshot
}
```

---

## Task 5: Testing Checklist

### Unit Tests

**Cloud API Endpoint:**
```typescript
describe('POST /projects/:projectId/snapshot', () => {
  it('should upload snapshot successfully', async () => {
    // Test valid snapshot upload
  });
  
  it('should compress snapshot with gzip', async () => {
    // Verify gzip compression
  });
  
  it('should update database metadata', async () => {
    // Verify database update
  });
  
  it('should return 401 without auth', async () => {
    // Test authentication
  });
  
  it('should return 403 if not owner', async () => {
    // Test authorization
  });
  
  it('should handle storage errors', async () => {
    // Test error handling
  });
});
```

**Electron UI:**
```typescript
describe('handleCreateProject', () => {
  it('should call createProjectWithSnapshot', async () => {
    // Mock and verify call
  });
  
  it('should poll for snapshot completion', async () => {
    // Verify polling mechanism
  });
  
  it('should display progress updates', async () => {
    // Verify status messages
  });
  
  it('should handle errors gracefully', async () => {
    // Test error handling
  });
});
```

### Integration Tests

```go
func TestProjectCreationWithSnapshot(t *testing.T) {
    // 1. Create project via API
    // 2. Verify cloud record
    // 3. Verify Syncthing folder
    // 4. Wait for snapshot
    // 5. Verify storage upload
    // 6. Verify metadata
    // 7. Verify file tree renders
}

func TestSnapshotRetry(t *testing.T) {
    // 1. Simulate upload failure
    // 2. Verify retry logic
    // 3. Verify exponential backoff
    // 4. Verify eventual success
}

func TestConcurrentSnapshots(t *testing.T) {
    // 1. Create multiple projects
    // 2. All generate snapshots simultaneously
    // 3. Verify no conflicts
    // 4. Verify all complete
}
```

---

## Implementation Priority

**HIGH PRIORITY (Required for Phase 2d):**
1. Cloud API endpoint ← Start here
2. Database schema migration
3. Electron UI update
4. Basic polling

**MEDIUM PRIORITY (Improves reliability):**
5. Retry logic
6. Error handling
7. Status endpoint

**NICE TO HAVE:**
8. Progress percentage calculation
9. WebSocket (Phase 2e+)

