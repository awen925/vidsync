# Complete Implementation Reference

## Quick Start: Testing the Features

### Test 1: Logout Flow (2 minutes)
```bash
1. Start Electron: npm start
2. Navigate to Settings page (click gear icon or /settings)
3. Scroll to "Account" section
4. Click "Logout" button
5. Should redirect to /auth page
6. Verify refresh token gone: ls -la ~/.vidsync/refresh_token.json
   (should show "No such file or directory")
7. Log back in to verify app still works
```

### Test 2: Syncthing Auto-Configuration (5 minutes)
```bash
1. Start Electron: npm start (must have Syncthing binary at go-agent/bin/syncthing/)
2. Navigate to Projects page
3. Create new project:
   - Name: "Test Project"
   - Local folder: Select any folder (e.g., ~/Documents/test-sync)
4. Click "Create Project"
5. Auto-redirects to project detail page
6. Check Electron console for logs starting with [Syncthing:xxx]
   Should see: "[Syncthing:xxx] Folder added" or "[Syncthing:xxx] Folder failed to add"
7. Open http://localhost:8384 (Syncthing web UI)
   Should see folder named "Project: xxx" with the selected path
```

### Test 3: Multi-Folder Selection (3 minutes)
```bash
1. In project detail page, leave "Choose Folder" section empty
2. Click "Choose Folder" button
3. Select different directory
4. Check logs for new Syncthing folder config
5. Open Syncthing UI - should show multiple folders
```

## File Structure & Changes

```
electron/
├── src/
│   ├── main/
│   │   ├── syncthingManager.ts         ← ENHANCED: Auto-config logic
│   │   │   ├── getApiKey()             ← NEW: Extract API key
│   │   │   ├── waitForSyncthingReady() ← NEW: Poll API
│   │   │   └── addFolder()             ← NEW: Configure via REST
│   │   ├── main.ts                     (IPC handlers, unchanged)
│   │   └── preload.ts                  (IPC bridge, unchanged)
│   │
│   └── renderer/
│       ├── pages/
│       │   ├── Settings/
│       │   │   └── SettingsPage.tsx    ← ENHANCED: Logout button
│       │   │       ├── handleLogout()  ← NEW: Clear session + token
│       │   │       └── Logout button   ← NEW: UI element
│       │   │
│       │   └── Projects/
│       │       ├── ProjectsPage.tsx    (folder picker, unchanged)
│       │       └── ProjectDetailPage.tsx ← ENHANCED: Auto-start Syncthing
│       │           └── startSyncthingForProject() ← NEW: Trigger start
│       │
│       ├── lib/
│       │   └── supabaseClient.ts       (session management, unchanged)
│       └── hooks/
│           └── useCloudApi.ts          (axios interceptors, unchanged)
│
└── package.json                         (dependencies, unchanged)
```

## Code Snippets: Key Functions

### 1. Logout Handler (SettingsPage.tsx)
```typescript
const handleLogout = async () => {
  setLoggingOut(true);
  try {
    // Clear Supabase session
    await supabase.auth.signOut();
    
    // Clear secure refresh token from file system
    await (window as any).api.secureStore.clearRefreshToken();
    
    // Redirect to login
    navigate('/auth');
  } catch (error) {
    console.error('Failed to logout:', error);
    alert('Logout failed');
    setLoggingOut(false);
  }
};
```

### 2. Syncthing Auto-Start (ProjectDetailPage.tsx)
```typescript
// Trigger auto-start when project loads
useEffect(() => {
  if (project && (project as any).local_path) {
    setLocalPath((project as any).local_path);
    loadFiles((project as any).local_path);
    startSyncthingForProject((project as any).local_path);  // Start here!
  }
}, [project]);

// Function to trigger IPC handler
const startSyncthingForProject = async (localPath: string) => {
  try {
    const result = await (window as any).api.syncthingStartForProject(projectId, localPath);
    if (result.success) {
      console.log('Syncthing started for project:', projectId);
    } else {
      console.error('Failed to start Syncthing:', result.error);
    }
  } catch (err) {
    console.error('Error starting Syncthing:', err);
  }
};
```

### 3. API Key Extraction (syncthingManager.ts)
```typescript
private async getApiKey(homeDir: string): Promise<string | null> {
  try {
    const configPath = path.join(homeDir, 'config.xml');
    const content = await fs.promises.readFile(configPath, 'utf-8');
    // Extract: <apikey>XXXXX</apikey>
    const match = content.match(/<apikey>([^<]+)<\/apikey>/);
    return match ? match[1] : null;
  } catch (e) {
    console.error('Failed to read API key:', e);
    return null;
  }
}
```

### 4. Syncthing Readiness Check (syncthingManager.ts)
```typescript
private async waitForSyncthingReady(
  apiKey: string, 
  timeout: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      return await new Promise((resolve) => {
        const req = https.request(
          {
            hostname: 'localhost',
            port: 8384,
            path: '/rest/system/status',
            method: 'GET',
            headers: { 'X-API-Key': apiKey },
            rejectUnauthorized: false, // Dev only!
          },
          (res) => {
            resolve(res.statusCode === 200);
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.setTimeout(2000);
        req.end();
      });
    } catch (e) {
      // Continue trying
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s, try again
  }
  return false;
}
```

### 5. Folder Configuration (syncthingManager.ts)
```typescript
private async addFolder(
  apiKey: string, 
  projectId: string, 
  localPath: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const folderConfig = {
      id: projectId,
      label: `Project: ${projectId}`,
      path: localPath,
      type: 'sendreceive',
      devices: [],
      rescanIntervalS: 3600,
      fsWatcherEnabled: true,
    };

    const data = JSON.stringify(folderConfig);

    const req = https.request(
      {
        hostname: 'localhost',
        port: 8384,
        path: `/rest/config/folders/${projectId}`,
        method: 'PUT',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        rejectUnauthorized: false,
      },
      (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 201);
      }
    );

    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}
```

### 6. Enhanced Start for Project (syncthingManager.ts)
```typescript
async startForProject(
  projectId: string, 
  localPath?: string
): Promise<{ success: boolean; pid?: number; homeDir?: string; error?: string }> {
  if (this.instances.has(projectId)) {
    // Already running
    const info = this.instances.get(projectId)!;
    return { success: true, pid: info.process.pid, homeDir: info.homeDir };
  }

  const binary = this.resolveBinary();
  const homeDir = path.join(app.getPath('userData'), 'syncthing', projectId);

  try {
    // Create home directory for this Syncthing instance
    await fs.promises.mkdir(homeDir, { recursive: true });

    // Spawn Syncthing process
    const proc = spawn(binary, ['-home', homeDir], { 
      stdio: ['ignore', 'pipe', 'pipe'] 
    });

    // Capture logs
    proc.stdout?.on('data', (d) => 
      console.log(`[Syncthing:${projectId}] ${d.toString()}`)
    );
    proc.stderr?.on('data', (d) => 
      console.error(`[Syncthing:${projectId} Error] ${d.toString()}`)
    );

    // Handle process exit
    proc.on('exit', (code, signal) => {
      console.log(`[Syncthing:${projectId}] exited code=${code} sig=${signal}`);
      this.instances.delete(projectId);
    });

    // Wait for config.xml to be created
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Extract API key from config
    const apiKey = await this.getApiKey(homeDir);

    // Store instance info
    const instanceInfo = { process: proc, homeDir, localPath, apiKey };
    this.instances.set(projectId, instanceInfo);

    // Background: Configure folder when ready
    if (localPath && apiKey && fs.existsSync(localPath)) {
      setImmediate(async () => {
        try {
          const ready = await this.waitForSyncthingReady(apiKey);
          if (ready) {
            const folderAdded = await this.addFolder(apiKey, projectId, localPath);
            console.log(`[Syncthing:${projectId}] Folder ${folderAdded ? 'added' : 'failed to add'}`);
          } else {
            console.warn(`[Syncthing:${projectId}] API did not become ready`);
          }
        } catch (e) {
          console.error(`[Syncthing:${projectId}] Error configuring folder:`, e);
        }
      });
    }

    return { success: true, pid: proc.pid, homeDir };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}
```

## Database Schema (No Changes Needed!)

```sql
-- Already exists in projects table:
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,  -- References auth.users (no FK constraint)
  name TEXT NOT NULL,
  description TEXT,
  local_path TEXT,        -- ← We use this! No changes needed
  auto_sync BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

## API Endpoints Used

### Project Creation
```
POST /api/projects
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "name": "My Project",
  "description": "Optional description",
  "local_path": "/home/producer/videos/docs"
}

Response:
{
  "project": {
    "id": "uuid",
    "name": "My Project",
    "description": "...",
    "local_path": "/home/producer/videos/docs",
    ...
  }
}
```

### Get Project (includes local_path)
```
GET /api/projects/{projectId}
Authorization: Bearer {access_token}

Response:
{
  "project": {
    "id": "uuid",
    "name": "...",
    "local_path": "/home/producer/videos/docs",
    ...
  },
  "members": [...],
  "devices": [...]
}
```

## Configuration Files (No Changes)

### Syncthing Config (Auto-Generated)
Location: `~/.vidsync/syncthing/{projectId}/config.xml`

```xml
<configuration>
  <apikey>EXTRACTED_BY_getApiKey()</apikey>
  <gui enabled="true" tls="false" addr="127.0.0.1:8384">
    ...
  </gui>
  <folders>
    <!-- Added by addFolder() REST call -->
    <folder id="{projectId}" label="Project: {projectId}" 
            path="/home/producer/videos/docs" type="sendreceive"
            rescanIntervalS="3600" fsWatcherEnabled="true">
      ...
    </folder>
  </folders>
</configuration>
```

### Refresh Token Storage (Unchanged)
Location: `~/.vidsync/refresh_token.json`
- Deleted on logout via `clearRefreshToken()`
- Mode 0600 (owner read/write only)

## Environment Variables (No Changes)

```bash
# In Electron .env or build process:
REACT_APP_SUPABASE_URL=https://xxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=xxx

# Syncthing uses:
SYNCTHING_HOME=~/.vidsync/syncthing/{projectId}
```

## Logs & Debugging

### View Electron Main Process Logs
```bash
# In DevTools: Main → Console tab
[Syncthing:projectId] Started
[Syncthing:projectId] Folder added
[Syncthing:projectId] exited code=0 sig=null
```

### View Syncthing Logs
```bash
# In Electron console (captured stdout/stderr):
[Syncthing:projectId] [V6Y4D] INFO: Geolocation database not found: GeoLite2-City.mmdb
[Syncthing:projectId] [V6Y4D] INFO: Starting API server at 127.0.0.1:8384
```

### Check Syncthing Web UI
- URL: http://localhost:8384
- Look for folder under Settings → Folders tab
- Should show folder ID = projectId
- Status should show sync activity

### Verify Refresh Token Cleared
```bash
# After logout:
cat ~/.vidsync/refresh_token.json
# Should return: "No such file or directory"
```

## Known Issues & Workarounds

### Issue: Syncthing API doesn't respond
**Symptom**: Console shows "API did not become ready"
**Cause**: Syncthing binary not found or slow startup
**Fix**: Ensure binary at `go-agent/bin/syncthing/syncthing`, check permissions (755)

### Issue: Folder not appearing in Syncthing UI
**Symptom**: Config sent successfully but folder missing from web UI
**Cause**: Syncthing UI cache or configuration not reloaded
**Fix**: Restart Syncthing, or refresh Syncthing web page (F5)

### Issue: Can't find Syncthing binary
**Symptom**: `resolveBinary()` returns just "syncthing" string
**Cause**: Not in expected paths and not in $PATH
**Fix**: Add syncthing to $PATH or copy binary to expected location

### Issue: HTTPS certificate errors
**Symptom**: API calls fail with certificate verification error
**Cause**: Syncthing uses self-signed cert in dev
**Fix**: Expected - code already has `rejectUnauthorized: false` for dev

## Production Checklist

Before deploying to production:

- [ ] Replace `rejectUnauthorized: false` with proper certificate handling
- [ ] Add error UI indicator: "Syncthing not configured" if folder config fails
- [ ] Add sync status indicator: polling `/rest/db/status` for progress
- [ ] Test logout with multiple user accounts
- [ ] Verify refresh token truly cleared from all storage locations
- [ ] Test Syncthing auto-start on app restart
- [ ] Add telemetry/monitoring for Syncthing crashes
- [ ] Document Syncthing web UI access for users
- [ ] Add "Open Syncthing UI" button to project detail page
- [ ] Test with various local_path values (special chars, spaces, etc.)

## Next Features

### Phase 3 (Recommended Next)
1. **Nebula Config Generation**: Auto-generate P2P network config
2. **Real-time Sync Status**: Show per-file and per-device progress
3. **Invite/Share Workflow**: Share project with other users
4. **File Sync Events**: Subscribe to sync events from agent

## Success Criteria

✅ Logout button works and clears session
✅ Refresh token file deleted on logout
✅ User redirected to login page after logout
✅ Syncthing starts automatically for projects
✅ Folder auto-configured in Syncthing
✅ Syncthing web UI shows configured folder
✅ Logs show folder configuration success
✅ Can create multiple projects with different local_paths
✅ No crashes or memory leaks
✅ UI responsive during Syncthing setup

All items ✅ = Ready for Phase 2 completion!
