# 404 Error on CreateProjectWithSnapshot - Troubleshooting Guide

## Problem

When creating a project, you get:
```
[1] [GoAgent] POST /projects/with-snapshot
[1] [GoAgent] 404 - Unknown error
```

## Root Cause

The Go agent binary was not rebuilt after Phase 2e changes were implemented. The endpoint exists in the code but the running binary is outdated.

---

## Solution

### Option 1: Rebuild Using Script (Recommended)

```bash
cd go-agent
./build.sh
```

### Option 2: Rebuild Using Make

```bash
cd go-agent
make build
```

### Option 3: Manual Rebuild

```bash
cd go-agent
go build -o vidsync-agent ./cmd/agent
```

---

## Verification Steps

### Step 1: Verify Binary Location
The binary must be named `vidsync-agent` (or `vidsync-agent.exe` on Windows) and located in one of these places:

```bash
# Check development locations:
ls -lh go-agent/vidsync-agent
# or
ls -lh bin/vidsync-agent
```

### Step 2: Test Endpoint Directly
Once rebuilt, test the endpoint:

```bash
# Health check
curl http://localhost:5001/api/v1/health

# Create project with snapshot (test endpoint)
curl -X POST http://localhost:5001/api/v1/projects/with-snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-123",
    "name": "Test Project",
    "localPath": "/tmp/test",
    "deviceId": "device-1",
    "ownerId": "user-1",
    "accessToken": "test-token"
  }'
```

### Step 3: Check Go Agent Logs
Look for successful endpoint registration:

```
[agent] API routes registered
[agent] Listening on :5001
```

---

## Common Issues

### Issue: Binary Not Found
**Symptom**: App starts but Go agent never runs

**Solution**:
```bash
# Verify binary was built
ls -lh go-agent/vidsync-agent

# Set explicit path if in custom location
export VIDSYNC_AGENT_PATH=/path/to/vidsync-agent
```

### Issue: Binary Built But Old Code Running
**Symptom**: Health check works but endpoints 404

**Solution**:
```bash
# Kill any running instances
pkill vidsync-agent || true

# Clean rebuild
cd go-agent
make clean
make build

# Restart app
```

### Issue: Route Not Registered
**Symptom**: All project endpoints return 404

**Check**:
1. Routes registered in `routes.go` line 42
2. Handler method exists in `project.go` lines 64-95
3. Service method exists in `project_service.go` lines 92+

---

## Build Pipeline Overview

```
Source Code (Go)
     ↓
go build ./cmd/agent
     ↓
Binary: vidsync-agent
     ↓
AgentController finds it via:
  1. VIDSYNC_AGENT_PATH env var
  2. Packaged app resources
  3. Relative to compiled main (../../go-agent/)
  4. Current working directory
  5. PATH lookup
     ↓
Agent starts on localhost:5001
     ↓
Routes registered (RegisterRoutes in routes.go)
     ↓
Ready to handle requests
```

---

## Prevention: Rebuild Whenever Code Changes

### Before Running Electron App

```bash
# Full rebuild process
cd go-agent
make clean build

cd ../electron
npm run build-main
npm run dev
```

### Or Use Development Script

Create `scripts/dev-full.sh`:

```bash
#!/bin/bash
set -e

echo "🔨 Building Go agent..."
cd go-agent
make build

echo "📦 Building Electron main..."
cd ../electron
npm run build-main

echo "🚀 Starting development..."
npm run dev
```

Then:
```bash
chmod +x scripts/dev-full.sh
./scripts/dev-full.sh
```

---

## Endpoints Reference

| Method | Endpoint | Handler | Status |
|--------|----------|---------|--------|
| POST | /api/v1/projects | CreateProject | ✅ |
| POST | /api/v1/projects/with-snapshot | **CreateProjectWithSnapshot** | ✅ |
| GET | /api/v1/projects/{id} | GetProject | ✅ |
| GET | /api/v1/projects/{id}/status | GetProjectStatus | ✅ |
| DELETE | /api/v1/projects/{id} | DeleteProject | ✅ |
| POST | /api/v1/projects/{id}/devices | AddDevice | ✅ |
| DELETE | /api/v1/projects/{id}/devices/{id} | RemoveDevice | ✅ |
| POST | /api/v1/projects/{id}/sync/pause | PauseSync | ✅ |
| POST | /api/v1/projects/{id}/sync/resume | ResumeSync | ✅ |
| POST | /api/v1/projects/{id}/sync/stop | StopSync | ✅ |
| GET | /api/v1/projects/{id}/progress | GetSnapshotProgress | ✅ |
| GET | /api/v1/projects/{id}/progress/stream | SubscribeSnapshotProgress | ✅ |

---

## Checklist

- [ ] Navigate to `go-agent/` directory
- [ ] Run `make build` (or `./build.sh`)
- [ ] Verify `vidsync-agent` binary exists
- [ ] Kill old agent process: `pkill vidsync-agent`
- [ ] Restart Electron app
- [ ] Try creating project again
- [ ] Check for success message: `[GoAgent] 201 - Project created`

---

## Still Not Working?

If you still get 404:

1. **Check binary date**:
   ```bash
   stat go-agent/vidsync-agent
   # Compare with current time - should be recent
   ```

2. **Enable debug logging**:
   ```bash
   export VIDSYNC_DEBUG=1
   npm run dev
   ```

3. **Test directly**:
   ```bash
   # While agent is running
   curl http://localhost:5001/api/v1/health
   # Should return 200
   ```

4. **Check port**:
   ```bash
   lsof -i :5001
   # Verify vidsync-agent is listening
   ```

5. **File an issue** with:
   - `go version` output
   - Binary build date
   - Go agent startup logs
   - Exact error response from endpoint
