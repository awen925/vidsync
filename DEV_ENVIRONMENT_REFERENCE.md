# Development Environment Port & Binary Reference

## Port Configuration

| Service | Port | URL | Environment Variable | Default |
|---------|------|-----|----------------------|---------|
| **Electron (Renderer)** | 3001 | http://localhost:3001 | PORT | 3001 |
| **Cloud API (Backend)** | 5000 | http://localhost:5000/api | CLOUD_URL | http://localhost:5000/api |
| **Go Agent** | 5001 | http://localhost:5001/api/v1 | (hardcoded) | http://localhost:5001/api/v1 |
| **Syncthing** | 8384 | http://localhost:8384 | (dynamic) | Varies |
| **Syncthing WebSocket** | 29999 | ws://127.0.0.1:29999/v1/events | (hardcoded) | ws://127.0.0.1:29999/v1/events |

---

## Go Binary Name in Development

### Binary Name: **`vidsync-agent`** (NOT `agent`)

**File:** `/home/fograin/work1/vidsync/go-agent/vidsync-agent` (13MB)

### Binary Discovery Order (in agentController.ts)

Electron looks for the binary in this order:

1. **Environment Variable Override**
   ```bash
   export VIDSYNC_AGENT_PATH=/path/to/vidsync-agent
   npm run dev
   ```

2. **Packaged App Resources** (production only)
   ```
   {resourcesPath}/bin/vidsync-agent
   ```

3. **Development Locations** (checked in order)
   ```
   ../../go-agent/vidsync-agent              (from dist/main)
   ./go-agent/vidsync-agent                  (current directory)
   ./bin/vidsync-agent
   ./electron/bin/vidsync-agent
   ```

4. **Fallback to Resources**
   ```
   {resourcesPath}/bin/vidsync-agent
   ```

5. **PATH Lookup**
   ```
   vidsync-agent  (anywhere in system PATH)
   ```

---

## Debug Checklist

### ✅ Check 1: Verify Services Are Running

```bash
# Check if Go Agent is listening on 5001
curl http://localhost:5001/api/v1/health
# Expected: 200 OK

# Check if Cloud API is listening on 5000
curl http://localhost:5000/api/health
# Expected: 200 OK or error (but port must be open)

# Check if Electron is listening on 3001
curl http://localhost:3001
# Expected: 200 OK or HTML response
```

### ✅ Check 2: Verify Binary Name

```bash
# List what binaries exist in go-agent folder
ls -lh /home/fograin/work1/vidsync/go-agent/ | grep agent

# Output should show:
# -rwxr-xr-x  1 fograin fograin  13M Nov 20 ... vidsync-agent
#
# NOT:
# -rwxr-xr-x  1 fograin fograin  13M Nov 20 ... agent
```

### ✅ Check 3: Verify Binary Path Resolution

Add debug output to see which binary is being used:

```bash
# Check if binary is executable
file /home/fograin/work1/vidsync/go-agent/vidsync-agent
# Output: ELF 64-bit LSB executable

# Verify permissions
ls -l /home/fograin/work1/vidsync/go-agent/vidsync-agent
# Output: -rwxr-xr-x  (executable bit set)
```

### ✅ Check 4: Process Status

```bash
# Check if Go Agent is running
ps aux | grep vidsync-agent

# Check if process is listening on port 5001
lsof -i :5001

# Check if process is listening on port 5000 (Cloud)
lsof -i :5000

# Check if process is listening on port 3001 (Electron)
lsof -i :3001
```

---

## Common Issues & Solutions

### Issue 1: Binary Not Found (404 Error)

**Symptoms:**
```
[GoAgent] POST /projects/with-snapshot
[GoAgent] 404 - Unknown error
```

**Diagnosis:**
```bash
# Check binary exists
ls -lh /home/fograin/work1/vidsync/go-agent/vidsync-agent

# Check if it's actually running on 5001
curl http://localhost:5001/api/v1/health
```

**Solution:**
```bash
# Rebuild the binary
cd go-agent
make clean
make build

# Verify it was built
ls -lh vidsync-agent

# Kill old process
pkill vidsync-agent

# Restart app
npm run dev
```

### Issue 2: Wrong Binary Name (e.g., `agent` instead of `vidsync-agent`)

**Symptoms:**
```
Binary not found during startup
Electron can't start Go agent
```

**Diagnosis:**
```bash
ls /home/fograin/work1/vidsync/go-agent/
# Check what's there - if you see "agent", it's wrong
```

**Solution:**
```bash
cd go-agent

# If you have old "agent" binary, rename or delete it
rm -f agent

# Rebuild with correct name
make build

# Verify correct name
ls -lh vidsync-agent
```

### Issue 3: Port Already in Use

**Symptoms:**
```
[GoAgent] Failed to listen on :5001
[Cloud] Failed to listen on :5000
[Electron] Port 3001 in use
```

**Solution:**
```bash
# Find what's using port 5001
lsof -i :5001

# Kill the process
kill -9 <PID>

# Or use a different port
export PORT=5002
npm run dev
```

---

## Development Workflow

### Full Clean Restart

```bash
#!/bin/bash
set -e

echo "🛑 Killing all services..."
pkill vidsync-agent || true
pkill -f "node.*cloud" || true
pkill -f "Electron" || true
sleep 2

echo "🔨 Building Go Agent..."
cd go-agent
make clean
make build
echo "✓ Go Agent built: $(ls -lh vidsync-agent | awk '{print $5, $NF}')"

echo "📦 Building Electron..."
cd ../electron
npm run build-main
echo "✓ Electron main built"

echo "🚀 Starting services..."
# Start Cloud API in background
cd ../cloud
npm run start &
CLOUD_PID=$!
sleep 2

# Start Electron
cd ../electron
npm run dev &
ELECTRON_PID=$!

echo "✅ All services started"
echo "   Cloud:    http://localhost:5000"
echo "   Go Agent: http://localhost:5001"
echo "   Electron: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"
wait
```

### Quick Start (Assuming Services Already Built)

```bash
# Just restart services (they'll find binaries)
cd electron
npm run dev
```

---

## Verification Commands

Run these to confirm everything is configured correctly:

```bash
# 1. Check binary name and location
echo "Binary name: $(basename $(which vidsync-agent) 2>/dev/null || echo 'NOT FOUND')"
echo "Binary path: $(which vidsync-agent 2>/dev/null || echo /home/fograin/work1/vidsync/go-agent/vidsync-agent)"

# 2. Check all ports
echo "Port 5001 (Go Agent):"
curl -s http://localhost:5001/api/v1/health && echo " ✓ RESPONDING" || echo " ✗ NOT RESPONDING"

echo "Port 5000 (Cloud):"
curl -s http://localhost:5000/api/health && echo " ✓ RESPONDING" || echo " ✗ NOT RESPONDING"

echo "Port 3001 (Electron):"
curl -s http://localhost:3001 >/dev/null && echo " ✓ RESPONDING" || echo " ✗ NOT RESPONDING"

# 3. Check processes
echo ""
echo "Running processes:"
ps aux | grep -E "vidsync-agent|node.*cloud|Electron" | grep -v grep
```

---

## Environment Variables Reference

```bash
# Override Go Agent location (if in non-standard location)
export VIDSYNC_AGENT_PATH=/custom/path/to/vidsync-agent

# Override Cloud API URL
export CLOUD_URL=http://localhost:5000/api

# Enable debug logging
export VIDSYNC_DEBUG=1

# Change Electron port
export PORT=3002

# Set NODE_ENV
export NODE_ENV=development
```

---

## Summary for Your Issue

**Your specific problem:**

1. **Binary Name**: ✅ It's `vidsync-agent` (not `agent`)
   - Location: `/home/fograin/work1/vidsync/go-agent/vidsync-agent`
   - Size: 13MB
   - Already built and working

2. **Ports in Development**:
   - Electron UI: `http://localhost:3001`
   - Cloud API: `http://localhost:5000/api`
   - Go Agent: `http://localhost:5001/api/v1`
   - Syncthing WebSocket: `ws://127.0.0.1:29999/v1/events`

3. **Verification**: If you still get 404 on Go endpoints:
   ```bash
   # Check Go Agent is running
   curl http://localhost:5001/api/v1/health
   
   # If 404, kill and rebuild
   pkill vidsync-agent
   cd go-agent && make build
   
   # Restart
   npm run dev
   ```

The binary name is correct. If still getting 404, it's likely:
- Old process still running → Kill it first
- Binary not rebuilt since code changes → Run `make build`
- Different binary in PATH → Use full path or set `VIDSYNC_AGENT_PATH`
