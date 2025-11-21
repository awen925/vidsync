# Where to See Go Agent Logs

## How Go Agent Runs

The Go Agent is spawned by the Electron main process in `agentController.ts`:

```typescript
const p = spawn(c, [], { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });

p.stdout?.on('data', (d) => {
  const s = d.toString();
  if (isDevelopment()) console.log(`[Agent] ${d.toString()}`);
  this.events.emit('agent:stdout', s);
});

p.stderr?.on('data', (d) => {
  const s = d.toString();
  if (isDevelopment()) console.log(`[Agent] ${d.toString()}`);
  this.events.emit('agent:stderr', s);
});
```

---

## Where to Find Logs

### Option 1: Electron Developer Console (Easiest)

If running in **development mode**, all Go Agent logs appear in the Electron main process console:

1. **Start Electron in dev mode:**
   ```bash
   cd /home/fograin/work1/vidsync/electron
   npm run dev
   ```

2. **Open DevTools:**
   - Press `Ctrl+Shift+I` (or `Cmd+Option+I` on macOS)
   - Go to **Console** tab
   - Or press `Ctrl+Shift+J`

3. **Look for logs with `[Agent]` prefix:**
   ```
   [Agent] [CreateProject] Handler received request
   [Agent] [CreateProject] Request decoded: projectId=..., name=..., localPath=...
   [Agent] [ProjectService] STEP 1: Creating Syncthing folder for project: ...
   [Agent] [ProjectService] STEP 2: Cloud API payload: map[...localPath:...]
   ```

### Option 2: Listen to Events Programmatically

Add a listener in Electron main process to log all agent output:

**File:** `electron/src/main/main.ts`

```typescript
// After creating agentController
agentController.events.on('agent:stdout', (data) => {
  console.log('[GoAgent-Stdout]', data);
});

agentController.events.on('agent:stderr', (data) => {
  console.error('[GoAgent-Stderr]', data);
});
```

### Option 3: Save to Log File

Redirect agent output to a log file:

**File:** `electron/src/main/agentController.ts`

```typescript
import fs from 'fs';

// Add this property to AgentController class
private logStream: fs.WriteStream | null = null;

// In the start() method, after spawning:
const logPath = path.join(app.getPath('logs'), 'vidsync-agent.log');
this.logStream = fs.createWriteStream(logPath, { flags: 'a' });

p.stdout?.on('data', (d) => {
  const s = d.toString();
  if (isDevelopment()) console.log(`[Agent] ${d.toString()}`);
  this.logStream?.write(s);  // ← Write to file
  this.events.emit('agent:stdout', s);
});

p.stderr?.on('data', (d) => {
  const s = d.toString();
  if (isDevelopment()) console.log(`[Agent] ${d.toString()}`);
  this.logStream?.write(s);  // ← Write to file
  this.events.emit('agent:stderr', s);
});
```

Then logs will be at: `~/.vidsync/logs/vidsync-agent.log` or similar

### Option 4: Check Electron App Logs Directory

Electron automatically saves main process logs:

- **Linux:** `~/.config/vidsync/logs/`
- **macOS:** `~/Library/Logs/vidsync/`
- **Windows:** `%APPDATA%/vidsync/logs/`

---

## Quick Test

### Step-by-step to see logs:

1. **Open terminal 1 - Start Electron in dev mode:**
   ```bash
   cd /home/fograin/work1/vidsync/electron
   npm run dev
   ```

2. **Electron window opens → Open DevTools (Ctrl+Shift+I)**

3. **Open terminal 2 - Create a test project (or use Electron UI):**
   ```bash
   # The project creation will trigger Go Agent operations
   # Watch the DevTools Console for logs
   ```

4. **You should see logs like:**
   ```
   [Agent] [CreateProject] Handler received request
   [Agent] [CreateProject] Request decoded: projectId=..., name=..., localPath=...
   [Agent] [ProjectService] STEP 1: Creating Syncthing folder for project: ...
   [Agent] [ProjectService] STEP 1 FAILED: Failed to create Syncthing folder: ...
   ```

---

## Log Flow Summary

```
Go Agent Process
    ↓ (stdout/stderr)
AgentController.start()
    ├─ if isDevelopment() → console.log(`[Agent] ...`)  ← See in DevTools
    ├─ events.emit('agent:stdout', ...)  ← Can listen to events
    └─ Can redirect to file
         ↓
    DevTools Console or Log File
```

---

## Current Log Messages

### Success Flow:
```
[Agent] [CreateProjectWithSnapshot] Handler received request
[Agent] [CreateProjectWithSnapshot] Request decoded: projectId=uuid, name=test, localPath=/path/to/folder, deviceId=..., ownerId=...
[Agent] [ProjectService] CreateProjectWithSnapshot started for: test
[Agent] [ProjectService] STEP 1: Creating project in cloud database...
[Agent] [ProjectService] STEP 1: Cloud API payload: map[name:test localPath:/path/to/folder deviceId:... ownerId:... status:active]
[Agent] [ProjectService] STEP 1 SUCCESS: Project created in cloud
[Agent] [ProjectService] STEP 2: Creating Syncthing folder...
[Agent] [ProjectService] STEP 2: Adding folder to Syncthing: id=..., label=test, path=/path/to/folder
[Agent] [ProjectService] STEP 2 SUCCESS: Syncthing folder created
[Agent] [ProjectService] STEP 3: Starting background snapshot generation...
[Agent] [ProjectService] CreateProjectWithSnapshot completed successfully
```

### Failure Flow (Example):
```
[Agent] [ProjectService] STEP 2 FAILED: Failed to create Syncthing folder: syncthing API error: 403 - CSRF Error
```

---

## Verify localPath is Sent

Look for this log to verify `localPath` is in the payload:

```
[Agent] [ProjectService] STEP 1: Cloud API payload: map[...localPath:/path/to/folder...]
```

If `localPath` is there → Issue is in Cloud API (not saving it)
If `localPath` is NOT there → Issue is in Go Agent or Electron
