# Vidsync Phase 1 Setup Guide

This guide walks you through setting up Vidsync Phase 1 for local development.

## 📋 Checklist

- [ ] Clone/download the repository
- [ ] Download Syncthing & Nebula binaries
- [ ] Setup Cloud backend (Node.js)
- [ ] Setup Go agent
- [ ] Setup Electron app
- [ ] Test local communication

## 🔧 Step 1: Download & Place Binaries

### Syncthing

**Linux:**
```bash
# Download latest
cd /tmp
wget https://github.com/syncthing/syncthing/releases/download/v1.27.0/syncthing-linux-amd64-v1.27.0.tar.gz
tar xzf syncthing-linux-amd64-v1.27.0.tar.gz

# Place in vidsync
mkdir -p vidsync/go-agent/bin/syncthing/linux
cp syncthing-linux-amd64-v1.27.0/syncthing vidsync/go-agent/bin/syncthing/linux/
chmod +x vidsync/go-agent/bin/syncthing/linux/syncthing
```

**macOS:**
```bash
cd /tmp
wget https://github.com/syncthing/syncthing/releases/download/v1.27.0/syncthing-macos-amd64-v1.27.0.zip
unzip syncthing-macos-amd64-v1.27.0.zip

mkdir -p vidsync/go-agent/bin/syncthing/darwin
cp syncthing-macos-amd64-v1.27.0/syncthing vidsync/go-agent/bin/syncthing/darwin/
chmod +x vidsync/go-agent/bin/syncthing/darwin/syncthing
```

**Windows:**
- Download from: https://github.com/syncthing/syncthing/releases/download/v1.27.0/syncthing-windows-amd64-v1.27.0.zip
- Extract `syncthing.exe` to: `vidsync\go-agent\bin\syncthing\windows\`

### Nebula (Optional for Phase 1)

**Linux:**
```bash
cd /tmp
wget https://github.com/slackhq/nebula/releases/download/v1.8.0/nebula-linux.zip
unzip nebula-linux.zip

mkdir -p vidsync/go-agent/bin/nebula/linux
cp nebula vidsync/go-agent/bin/nebula/linux/
chmod +x vidsync/go-agent/bin/nebula/linux/nebula
```

**macOS:**
```bash
cd /tmp
wget https://github.com/slackhq/nebula/releases/download/v1.8.0/nebula-darwin.zip
unzip nebula-darwin.zip

mkdir -p vidsync/go-agent/bin/nebula/darwin
cp nebula vidsync/go-agent/bin/nebula/darwin/
chmod +x vidsync/go-agent/bin/nebula/darwin/nebula
```

**Windows:**
- Download from: https://github.com/slackhq/nebula/releases/download/v1.8.0/nebula-windows.zip
- Extract `nebula.exe` to: `vidsync\go-agent\bin\nebula\windows\`

## 🚀 Step 2: Setup Cloud Backend

```bash
cd vidsync/cloud

# Install dependencies
npm install

# Create .env file (Phase 1: stubs work without Supabase)
cat > .env << EOF
PORT=3000
NODE_ENV=development
JWT_SECRET=dev-secret-key-change-in-production
EOF

# Start server
npm run dev
# Output: Listening on port 3000
```

Test the cloud backend:
```bash
curl http://localhost:3000/health
# Response: { "status": "ok", "timestamp": "..." }
```

## 🛠️ Step 3: Setup Go Agent

```bash
cd vidsync/go-agent

# Download Go modules
go mod download

# Build binary
go build -o vidsync-agent ./cmd/agent/main.go

# Create .env file
cat > .env << EOF
CLOUD_URL=http://localhost:3000/api
LOG_LEVEL=info
EOF

# Start agent
./vidsync-agent
# Output: 
# ╔════════════════════════════════════╗
# ║   Vidsync Agent                    ║
# ║   Listening on 127.0.0.1:29999     ║
# ╚════════════════════════════════════╝
```

Test the agent:
```bash
# In another terminal
curl http://127.0.0.1:29999/v1/status
# Response: { "status": "ok", "clients": 0 }
```

## 💻 Step 4: Setup Electron App

```bash
cd vidsync/electron

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
REACT_APP_CLOUD_URL=http://localhost:3000/api
REACT_APP_AGENT_URL=http://127.0.0.1:29999/v1
EOF

# Start development mode
npm start
# This will:
# 1. Start React dev server on :3000
# 2. Wait for server
# 3. Launch Electron app
# 4. Auto-reload on file changes
```

## ✅ Step 5: Test Local Flow

### 1. Verify All Services Running

```bash
# Terminal 1: Cloud Backend
cd vidsync/cloud && npm run dev

# Terminal 2: Go Agent
cd vidsync/go-agent && ./vidsync-agent

# Terminal 3: Electron App
cd vidsync/electron && npm start
```

### 2. Test in Electron App

**Auth Page:**
1. Click "Login"
2. Enter any email: `test@example.com`
3. Enter any password: `test123`
4. Click "Login"
5. Should redirect to Dashboard (Phase 1 uses stub auth)

**Dashboard:**
1. Should show "Agent Connected" (green dot)
2. Should display 0 projects (stub data)
3. Click "Create New Project"

**Create Project (local test):**
1. Enter name: "My Test Project"
2. Select a local folder
3. Click "Create"
4. Go back to dashboard
5. Project should appear in grid

**Settings:**
1. Change "Download Path"
2. Toggle "Auto Sync"
3. Change "Sync Mode"
4. Click "Save Settings"

## 🔧 Troubleshooting

### Agent Connection Error

**Problem:** "Agent Disconnected" (red dot)

**Solution:**
```bash
# 1. Check if agent is running
ps aux | grep vidsync-agent

# 2. Check port 29999
lsof -i :29999

# 3. Restart agent
cd vidsync/go-agent
./vidsync-agent

# 4. Check firewall
# macOS: System Preferences → Security & Privacy → Firewall
# Linux: sudo ufw allow 29999
# Windows: Windows Defender → Firewall → Allow app through firewall
```

### Cloud Backend Not Responding

**Problem:** Cannot reach `http://localhost:3000`

**Solution:**
```bash
# 1. Check if running
lsof -i :3000

# 2. Check logs
npm run dev  # Should show "Listening on port 3000"

# 3. Restart
npm run dev
```

### Electron App Blank Screen

**Problem:** White screen on startup

**Solution:**
```bash
# 1. Check React dev server is running
curl http://localhost:3000  # Should return HTML

# 2. Open DevTools
Press F12 or Cmd+Option+I

# 3. Check Console tab for errors

# 4. Rebuild
rm -rf node_modules
npm install
npm start
```

### Syncthing Binary Not Found

**Problem:** "Could not find syncthing binary"

**Solution:**
```bash
# 1. Verify binary exists
ls -la vidsync/go-agent/bin/syncthing/linux/syncthing

# 2. Make it executable
chmod +x vidsync/go-agent/bin/syncthing/linux/syncthing

# 3. Verify it runs
vidsync/go-agent/bin/syncthing/linux/syncthing -version
```

## 📝 Next Steps (Phase 2)

When ready for real backend:

1. **Create Supabase project** at https://supabase.com
2. **Get credentials:**
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - SUPABASE_ANON_KEY
3. **Add to `cloud/.env`**
4. **Run migrations** (when provided)
5. **Replace stub implementations** with real Supabase queries
6. **Test with real database**

## 🎯 Success Criteria

Phase 1 is working when:

✅ All three services start without errors
✅ Electron app shows "Agent Connected"
✅ Can login (stub auth)
✅ Can create local projects
✅ Can view project settings
✅ WebSocket events stream (check DevTools Console)
✅ No TypeScript/JavaScript errors

## 📚 Additional Help

- Full docs: See `../README.md`
- Go Agent: See `../go-agent/README.md`
- Cloud Backend: See `../cloud/README.md`
- Electron App: See `../electron/README.md`

---

Good luck! 🚀
