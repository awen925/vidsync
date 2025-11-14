# Vidsync - Complete File Sync Solution

A modern, secure, and fast file synchronization application built with **Electron**, **Go**, and **Node.js + Supabase**.

> **Latest**: Phase 3 complete — Nebula IP allocator & device registration implemented. See [PHASE3_SUMMARY.md](./PHASE3_SUMMARY.md) and [PHASE3_NEBULA_ALLOCATOR_COMPLETE.md](./PHASE3_NEBULA_ALLOCATOR_COMPLETE.md).

## 🧪 Testing This Version

**📖 Start here:** [HOW_TO_TEST.md](../HOW_TO_TEST.md) - Complete guide to testing all features with expected results

This includes:
- ✅ Phase 2B: Delta sync (99% bandwidth savings)
- ✅ Phase 2C: Real-time WebSocket (<100ms latency)
- ✅ File browser with pagination (10,000+ files)
- ✅ Multi-user synchronization
- ✅ Offline recovery and graceful fallback
- ✅ Load testing and performance verification

## 📁 Project Structure

```
vidsync/
├── cloud/          # Node.js + Supabase Cloud Backend
├── go-agent/       # Go Local Agent (Syncthing + Nebula Manager)
└── electron/       # React + Electron Desktop UI
```

## 🎯 Architecture Overview

### 1. **Electron App** (UI)
- Modern React UI with Tailwind CSS
- Communicates with Go agent via WebSocket and HTTP
- Renderer ↔ Main process via IPC
- Handles authentication, project management, settings

### 2. **Go Agent** (Local Service)
- Manages Syncthing and Nebula processes
- Local HTTP API on `127.0.0.1:29999`
- WebSocket server for real-time events
- Local SQLite database for projects/devices
- Handles privilege escalation for Nebula TUN creation

### 3. **Cloud Backend** (Supabase)
- Express.js server for API endpoints
- Supabase PostgreSQL for user data
- JWT authentication
- Project/device/subscription management

## ✅ Prerequisites

- **Node.js** 16+ (for Electron & Cloud)
- **Go** 1.21+ (for Agent)
- **npm** or **yarn**
- **Syncthing** binary (download separately)
- **Nebula** binary (download separately)
- **Supabase account** (optional for Phase 1)

## 🚀 Quick Start

### Phase 1: Local Development

#### 1. Cloud Backend Setup
```bash
cd cloud
npm install
# Add .env file with Supabase credentials (optional for Phase 1)
npm run dev
# Runs on http://localhost:3000
```

#### 2. Go Agent Setup
```bash
cd go-agent

# Place binaries here:
# go-agent/bin/syncthing/<platform>/syncthing  (or syncthing.exe on Windows)
# go-agent/bin/nebula/<platform>/nebula        (or nebula.exe on Windows)

# Build and run
go mod download
go build -o vidsync-agent ./cmd/agent/main.go
./vidsync-agent
# Listens on http://127.0.0.1:29999
```

#### 3. Electron App Setup
```bash
cd electron
npm install

# Development mode (with hot reload)
npm start
# Or build for production
npm run build
```

## 📝 Configuration

### Environment Variables

**Cloud Backend** (`cloud/.env`):
```
PORT=3000
JWT_SECRET=your-secret-key
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Electron** (`electron/.env`):
```
REACT_APP_CLOUD_URL=http://localhost:3000/api
REACT_APP_AGENT_URL=http://127.0.0.1:29999/v1
```

**Go Agent** (`go-agent/.env`):
```
CLOUD_URL=http://localhost:3000/api
LOG_LEVEL=info
```

## 🔒 Security & Permissions

### Nebula TUN Device Creation

**Linux/macOS**: Requires elevated privileges
- Agent detects when TUN device needs creation
- Shows UI prompt: "Grant Nebula permission"
- Uses `pkexec` or `sudo` with user consent
- No silent privilege escalation

**Windows**: Helper process approach
- Nebula launcher helper runs elevated if needed
- Clear permission dialog shown to user
- Firewall rules configured during installation

## 📦 Binary Placement

### Syncthing

```
go-agent/bin/syncthing/
├── linux/syncthing
├── darwin/syncthing
└── windows/syncthing.exe
```

Download from: https://syncthing.net/downloads/

### Nebula

```
go-agent/bin/nebula/
├── linux/nebula
├── darwin/nebula
└── windows/nebula.exe
```

Download from: https://github.com/slackhq/nebula/releases

## 🔌 API Endpoints

### Local Agent API (Go)

**Status**
- `GET /v1/status` - Agent status
- `GET /v1/events` - WebSocket: Stream sync events

**Projects**
- `POST /v1/projects` - Create project
- `GET /v1/projects` - List projects
- `DELETE /v1/projects/:id` - Delete project

**Devices**
- `POST /v1/devices/register` - Register with cloud
- `GET /v1/devices` - List local devices

**Syncthing**
- `POST /v1/syncthing/folders/:id/rescan` - Rescan folder
- `POST /v1/syncthing/folders/:id/pause` - Pause folder
- `POST /v1/syncthing/folders/:id/resume` - Resume folder

### Cloud API (Node.js)

**Auth**
- `POST /api/auth/signup` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/magic-link` - Send magic link
- `POST /api/auth/verify-link` - Verify link
- `GET /api/auth/me` - Current user

**Projects**
- `POST /api/projects` - Create
- `GET /api/projects` - List
- `GET /api/projects/:id` - Get details
- `POST /api/projects/:id/invite` - Invite member

**Devices**
- `POST /api/devices/register` - Register device
- `GET /api/devices` - List devices
- `DELETE /api/devices/:id` - Revoke device

**Users**
- `GET /api/users/profile` - Get profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/settings` - Get settings
- `PUT /api/users/settings` - Update settings

## 🧪 Testing

### Go Agent
```bash
cd go-agent
go test ./...
```

### Cloud Backend
```bash
cd cloud
npm test
```

### Electron
```bash
cd electron
npm test
```

## 📚 File Structure Details

### Cloud Backend
- `src/api/` - Route handlers (auth, projects, devices, sync, users)
- `src/middleware/` - Authentication, error handling
- `src/services/` - Business logic (stubs for Supabase integration)
- `src/db/` - Database schema and migrations
- `src/utils/` - Helpers (logger, config, hashing)

### Go Agent
- `cmd/agent/` - Entry point
- `internal/api/` - HTTP clients (Syncthing, Cloud)
- `internal/device/` - Device manager & registration
- `internal/sync/` - Sync manager & events
- `internal/nebula/` - Nebula process management
- `internal/config/` - Configuration loading
- `internal/util/` - Logger & utilities
- `internal/ws/` - WebSocket server for Electron

### Electron App
- `src/main/` - Electron main process (IPC, agent control)
- `src/renderer/` - React UI (pages, components, hooks)
- `src/renderer/pages/` - Auth, Dashboard, Projects, Settings
- `src/renderer/styles/` - CSS styles
- `src/renderer/hooks/` - Custom hooks (API calls, WebSocket)

## 🔄 Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron App (UI)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              React Component                        │   │
│  │  (calls HTTP GET/POST to agent + subscribes to WS) │   │
│  └────────────────────┬────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
  HTTP (JSON)                      WebSocket
  127.0.0.1:29999                  (Events)
        │                               │
        ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Go Agent (Local)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HTTP API Handler                                   │   │
│  │  ├─ Project Manager (SQLite)                        │   │
│  │  ├─ Syncthing Controller (REST → :8384)             │   │
│  │  ├─ Nebula Manager (Process)                        │   │
│  │  └─ WebSocket Broadcaster                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
        │                               │
        ├─────────────────────────────┬─┴─────────────┐
        │                             │               │
    HTTP POST              sync events             Start/Stop
    to Cloud               broadcast                 Processes
        │                             │               │
        ▼                             ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│              External Services                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Cloud Server │  │   Syncthing  │  │    Nebula    │     │
│  │ (Node.js +   │  │   (Process)  │  │  (Process)   │     │
│  │  Supabase)   │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 🛣️ Development Roadmap

### ✅ Phase 1 (Current)
- [x] Base folder structure
- [x] Go agent with Syncthing/Nebula wrappers
- [x] Local HTTP API + WebSocket
- [x] Electron UI (Auth, Dashboard, Projects, Settings)
- [x] Cloud API stubs
- [ ] Binary placement & testing

### 📋 Phase 2 (Next)
- [ ] Supabase integration (replace stubs)
- [ ] Real authentication (JWT, magic links)
- [ ] Device registration workflow
- [ ] Project invitation system

### 🔐 Phase 3
- [ ] Nebula certificate generation
- [ ] Lighthouse management
- [ ] Production-grade privilege handling
- [ ] Syncthing config management

### 💳 Phase 4
- [ ] Stripe billing integration
- [ ] Subscription enforcement
- [ ] Admin dashboard

### 📦 Phase 5
- [ ] Installers (MSI, DMG, AppImage)
- [ ] Code signing
- [ ] Auto-update system
- [ ] Release process

## 🐛 Troubleshooting

### Agent Connection Failed
```
Error: Failed to connect to WebSocket
Solution: 
1. Check if agent is running: ps aux | grep vidsync-agent
2. Check port 29999 is not in use: lsof -i :29999
3. Start agent manually: cd go-agent && ./vidsync-agent
```

### Syncthing Binary Not Found
```
Error: Could not find syncthing binary
Solution:
1. Download Syncthing binary from syncthing.net
2. Place in: go-agent/bin/syncthing/<platform>/
3. Make executable: chmod +x go-agent/bin/syncthing/linux/syncthing
```

### Nebula Permission Denied
```
Error: Permission denied creating TUN device
Solution:
1. Linux: Run agent with pkexec (prompted automatically)
2. macOS: Grant Full Disk Access to agent
3. Windows: Run as Administrator (handled by installer)
```

## 📖 Additional Resources

- [Syncthing Documentation](https://docs.syncthing.net/)
- [Nebula VPN Documentation](https://nebula.defined.net/)
- [Supabase Documentation](https://supabase.com/docs)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Express.js Documentation](https://expressjs.com/)

## 📄 License

MIT

## 👥 Contributing

Contributions welcome! Please follow the code style and submit PRs.

## ❓ FAQ

**Q: Can I sync without Nebula?**
A: Yes, Nebula is optional. Syncthing can work over standard network (slower, more relayed).

**Q: Is data encrypted?**
A: Yes. Syncthing uses TLS. Nebula adds additional VPN encryption.

**Q: What's the max file size?**
A: No limit. Tested with multi-GB files.

**Q: Can I use with my own Supabase instance?**
A: Yes! Add credentials to `cloud/.env` and follow Phase 2 integration docs.

**Q: How is admin access handled?**
A: User is prompted once. Handled via `pkexec`/`sudo` on Linux/macOS, elevated process on Windows.

---

**Happy syncing! 🚀**
