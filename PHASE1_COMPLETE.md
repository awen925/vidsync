# Vidsync Phase 1 – Complete Installation, Auth & Device Registration Flow

## Overview

This document describes the complete Phase 1 flow for Vidsync:
1. **App Installation** → User downloads and runs the Electron app.
2. **Signup/Login** → User creates account or logs in via Supabase Auth.
3. **Device Registration** → App automatically registers the local device with the cloud and obtains a device token from the Go agent.
4. **Background Services** → Nebula (P2P VPN) and Syncthing (file sync) start automatically to enable folder transfer/sync.

---

## Architecture

### Components

- **Electron App** (Desktop UI)
  - Renders React frontend
  - Manages Electron window, IPC, and launches background services
  - Stores device identity locally in `userData/device.json`
  - Reads device token from the Go agent's HTTP endpoint

- **Go Agent** (Local Orchestration)
  - Runs as a subprocess, started by Electron
  - Manages Nebula and Syncthing services
  - Persists device identity (ID + cryptographic token) in local SQLite database
  - Exposes device info via HTTP endpoint (`/v1/device`) at `http://127.0.0.1:29999`

- **Cloud Backend** (Node.js + Supabase)
  - Handles user authentication (Supabase Auth)
  - Persists devices to Supabase `devices` table
  - Provides `/api/devices/register` endpoint to register or update devices

- **Nebula** (P2P VPN)
  - Provides encrypted overlay network between devices
  - Binaries included in project or packaged with app

- **Syncthing** (File Sync)
  - Synchronizes folders between devices over the Nebula network
  - Binaries included in project or packaged with app

### Data Flow

```
User runs app
  ↓
Electron starts Go agent (vidsync-agent binary)
  ↓
Agent initializes device (generates or loads device ID + token from SQLite)
  ↓
Agent exposes /v1/device endpoint (with device ID, name, platform, token)
  ↓
Agent starts Nebula and Syncthing services (if binaries available)
  ↓
User opens Auth page, signs up or logs in
  ↓
On success, renderer calls IPC: window.api.deviceGetInfo()
  ↓
Main process fetches device info from agent's /v1/device endpoint (or falls back to local device.json)
  ↓
Renderer gets device info (including agent-generated token) and POSTs to /api/devices/register
  ↓
Cloud server receives registration, stores device record in Supabase with user_id, device_id, device_token
  ↓
Toast notification shows success or failure
  ↓
User navigates to Dashboard; device sync/transfer ready
```

---

## Setup Steps

### Prerequisites

- Node.js 16+ and npm
- Go 1.18+
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (set in cloud/.env)
- Nebula and Syncthing binaries (optional for Phase 1 testing; required for full functionality)

### 1. Build and Run the Cloud Backend

```bash
cd /home/fograin/work1/vidsync/cloud

# Ensure .env has Supabase credentials
cat .env | grep SUPABASE_

# Install dependencies
npm install

# Start dev server (ts-node)
npm run dev
```

Expected output:
```
Supabase credentials are not set. Supabase client will not work...
╔════════════════════════════════════╗
║   Vidsync Cloud Server             ║
║   Listening on port 3000           ║
╚════════════════════════════════════╝
```

### 2. Build the Go Agent

```bash
cd /home/fograin/work1/vidsync/go-agent

# Build the binary
go build -o vidsync-agent ./cmd/agent/

# Verify
ls -lh vidsync-agent
```

### 3. Prepare the Electron App

```bash
cd /home/fograin/work1/vidsync/electron

# Install dependencies
npm install

# Build Electron main process
npm run build-main

# Install Tailwind CSS (for styling)
npm install -D tailwindcss postcss autoprefixer
```

### 4. Start the Electron Dev Flow

```bash
cd /home/fograin/work1/vidsync/electron

# Start React dev server (port 3001) + Electron
npm start
```

Expected:
- React dev server starts at `http://localhost:3001`
- Electron window opens
- Go agent process starts (you'll see `[Agent] Device initialized: <uuid>` in Electron's terminal)
- Nebula and Syncthing services attempt to start (may fail silently if binaries not found)

---

## Testing the Complete Flow

### Test 1: Signup → Device Registration

1. **Open the Auth page** in the Electron app
2. **Click "Sign up"**
3. **Enter email and password** (e.g., `testuser+$(date +%s)@example.com` and `Password123!`)
4. **Click "Create account"**

**Expected behavior:**
- Auth request succeeds, returns Supabase JWT token
- App calls `window.api.deviceGetInfo()` to fetch device info from the agent
- App POSTs to `/api/devices/register` with device info + token
- **Toast notification appears:** "Device registered successfully" (green)
- App navigates to Dashboard

**Verify in Supabase:**
```bash
# Query devices table in Supabase SQL Editor
SELECT * FROM devices ORDER BY created_at DESC LIMIT 5;
```

Expected columns: `id`, `user_id`, `device_id`, `device_name`, `platform`, `device_token`, `is_online`, etc.

### Test 2: Login → Device Update

1. **Logout** (clear token from localStorage or close app)
2. **Click "Login"**
3. **Enter the same email and password**
4. **Click "Sign in"**

**Expected behavior:**
- Same as Test 1; device registration succeeds again (or updates existing record)

### Test 3: Device Token Consistency

1. **In Electron dev tools console**, run:
   ```javascript
   const deviceInfo = await window.api.deviceGetInfo();
   console.log('Device token:', deviceInfo.deviceToken);
   ```

2. **Query Supabase** to find the registered device token:
   ```bash
   SELECT device_token FROM devices WHERE device_id = '<deviceInfo.deviceId>' LIMIT 1;
   ```

**Expected:** The token values should match.

### Test 4: Agent Auto-Start

1. **Open Electron app dev console** (`F12` → console)
2. **Look for log output:**
   - `[Agent] Device initialized: <uuid>`
   - `[Nebula] started via <path>` (if binary found)
   - `[Syncthing] started via <path>` (if binary found)

If Nebula/Syncthing binaries are not found:
```
Nebula binary not found in candidates
Syncthing binary not found in candidates
```

This is expected in Phase 1; they will be packaged in production builds.

---

## File Changes Summary

### Go Agent (`go-agent/`)
- `internal/device/device_manager.go` — Already generates and persists `device.Token` (UUID) on first run
- `internal/ws/local_websocket.go` — Added `/v1/device` endpoint to expose device info (ID, name, platform, token)
- `cmd/agent/main.go` — Pass `deviceMgr` to `NewWebSocketServer`

### Electron (`electron/`)
- `src/main/main.ts`
  - Import `http` for fetching from agent
  - Updated `device:getInfo` IPC handler to fetch from agent's `/v1/device` endpoint first, fallback to local `device.json`
  - Pass `deviceMgr` to WebSocket server initialization
  - Auto-start Nebula and Syncthing on app ready

- `src/main/agentController.ts`
  - Added `startNebula()` and `startSyncthing()` methods
  - Attempt to locate binaries in project paths and PATH
  - Track processes and expose status

- `src/main/preload.ts`
  - Exposed `deviceGetInfo` IPC to renderer

- `src/renderer/pages/Auth/AuthPage.tsx`
  - Added `Toast` interface and state management
  - After successful signup/login:
    1. Call `window.api.deviceGetInfo()`
    2. POST device info to `/api/devices/register`
    3. Show toast notification (success or error)
  - Non-blocking: app proceeds to Dashboard even if device registration fails

### Cloud Backend (`cloud/`)
- `src/api/devices/routes.ts` — Already implements `/api/devices/register` endpoint
- `src/middleware/authMiddleware.ts` — Validates Supabase JWT tokens
- `src/lib/supabaseClient.ts` — Handles mock client when env vars not set

---

## Production Packaging

### Nebula & Syncthing Binaries

For production builds with `electron-builder`, include Nebula and Syncthing binaries:

**Update `electron/package.json`:**
```json
{
  "build": {
    "extraResources": [
      {
        "from": "bin/nebula",
        "to": "bin/nebula",
        "filter": ["**/*"]
      },
      {
        "from": "bin/syncthing",
        "to": "bin/syncthing",
        "filter": ["**/*"]
      }
    ]
  }
}
```

When packaged, binaries will be available at:
- macOS: `<app>/Contents/Resources/bin/nebula/nebula`
- Linux: `<app>/bin/nebula/nebula`
- Windows: `<app>/resources/bin/nebula/nebula.exe`

The Electron `agentController.ts` will find them automatically.

---

## Troubleshooting

### Issue: "Device registration failed" toast appears

**Causes:**
1. Cloud server not running or not reachable
2. Device info endpoint on agent not responding
3. Supabase service not available

**Fix:**
- Verify cloud server is running: `curl http://localhost:3000/health`
- Verify agent is running: `curl http://127.0.0.1:29999/v1/device`
- Check cloud server logs for device registration errors
- Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in cloud/.env

### Issue: Device not appearing in Supabase

**Cause:** Migration `002-fix-devices-fk.sql` not applied

**Fix:**
In Supabase SQL Editor:
```sql
ALTER TABLE IF EXISTS devices 
  DROP CONSTRAINT IF EXISTS devices_user_id_fkey;
```

### Issue: Nebula/Syncthing not starting

**Cause:** Binaries not found or config missing

**Fix:**
- For dev: Download binaries to `go-agent/bin/nebula/` and `go-agent/bin/syncthing/`
- For prod: Ensure `electron-builder` config includes `extraResources`
- Config files must exist (Nebula requires `nebula.yml`, Syncthing creates default config)

---

## Next Steps (Phase 2)

1. Implement folder/project creation and assignment
2. Add WebSocket event streaming for real-time sync status
3. Build Dashboard UI to show devices, projects, and sync progress
4. Implement Nebula and Syncthing configuration provisioning
5. Add metrics and monitoring

---

## Summary

Users can now:
✅ Download and run the Vidsync app  
✅ Sign up or log in with email/password  
✅ Device auto-registers to the cloud  
✅ Local Nebula + Syncthing services start in background (when available)  
✅ Ready for project folder assignment and sync (Phase 2)

