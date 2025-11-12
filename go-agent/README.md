# Vidsync Go Agent - Local Sync Daemon

A lightweight Go service that manages file synchronization using Syncthing and Nebula VPN, providing a WebSocket API for the Electron frontend.

## 📋 Features

- ✅ Start/stop Syncthing and Nebula processes
- ✅ Local SQLite database for projects and devices
- ✅ HTTP API for project/device management
- ✅ WebSocket server for real-time event streaming
- ✅ Syncthing REST API wrapper
- ✅ Cloud integration client
- ✅ Automatic privilege elevation for Nebula TUN device
- ✅ Structured logging

## 📦 Prerequisites

- Go 1.21+
- Syncthing binary
- Nebula binary (optional)
- SQLite3 development libraries

## 🚀 Installation & Setup

### 1. Download Binaries

#### Syncthing
```bash
# Linux
wget https://github.com/syncthing/syncthing/releases/download/v1.27.0/syncthing-linux-amd64-v1.27.0.tar.gz
tar xzf syncthing-linux-amd64-v1.27.0.tar.gz
mkdir -p go-agent/bin/syncthing/linux
cp syncthing-linux-amd64-v1.27.0/syncthing go-agent/bin/syncthing/linux/
chmod +x go-agent/bin/syncthing/linux/syncthing

# macOS
wget https://github.com/syncthing/syncthing/releases/download/v1.27.0/syncthing-macos-amd64-v1.27.0.zip
unzip syncthing-macos-amd64-v1.27.0.zip
mkdir -p go-agent/bin/syncthing/darwin
cp syncthing-macos-amd64-v1.27.0/syncthing go-agent/bin/syncthing/darwin/
chmod +x go-agent/bin/syncthing/darwin/syncthing

# Windows
# Download from https://github.com/syncthing/syncthing/releases/download/v1.27.0/syncthing-windows-amd64-v1.27.0.zip
# Extract to: go-agent\bin\syncthing\windows\syncthing.exe
```

#### Nebula
```bash
# Linux
wget https://github.com/slackhq/nebula/releases/download/v1.8.0/nebula-linux.zip
unzip nebula-linux.zip
mkdir -p go-agent/bin/nebula/linux
cp nebula go-agent/bin/nebula/linux/
chmod +x go-agent/bin/nebula/linux/nebula

# macOS
wget https://github.com/slackhq/nebula/releases/download/v1.8.0/nebula-darwin.zip
unzip nebula-darwin.zip
mkdir -p go-agent/bin/nebula/darwin
cp nebula go-agent/bin/nebula/darwin/
chmod +x go-agent/bin/nebula/darwin/nebula

# Windows
# Download from https://github.com/slackhq/nebula/releases/download/v1.8.0/nebula-windows.zip
# Extract to: go-agent\bin\nebula\windows\nebula.exe
```

### 2. Build Agent

```bash
cd go-agent
go mod download
go build -o vidsync-agent ./cmd/agent/main.go
```

### 3. Configure

Create `go-agent/.env`:
```env
CLOUD_URL=http://localhost:3000/api
LOG_LEVEL=info
```

Create `~/.vidsync/nebula.yml` (if using Nebula):
```yaml
pki:
  ca: /path/to/ca.crt
  cert: /path/to/host.crt
  key: /path/to/host.key

static_host_map:
  "1": ["127.0.0.1:4242"]

lighthouse:
  am_lighthouse: false
  interval: 60
  hosts:
    - "1"

listen:
  host: 0.0.0.0
  port: 4242

punchy:
  punch: true
  respond: true
  delay: 1s

tun:
  disabled: false
  dev: nebula
  drop_local_broadcast: false
  drop_multicast: false
  tx_queue: 500
  mtu: 1300

logging:
  level: info
  format: json

firewall:
  conntrack:
    tcp_timeout: 12m
    udp_timeout: 3m
    default_timeout: 10m

  outbound:
    - port: any
      proto: any
      host: any

  inbound:
    - port: any
      proto: any
      host: any
```

### 4. Run

```bash
./vidsync-agent

# Output:
# ╔════════════════════════════════════╗
# ║   Vidsync Agent                    ║
# ║   Listening on 127.0.0.1:29999     ║
# ╚════════════════════════════════════╝
```

## 📡 API Reference

### Status

**GET /v1/status**
```bash
curl http://127.0.0.1:29999/v1/status
```

Response:
```json
{
  "status": "ok",
  "device_id": "abc123...",
  "clients": 1
}
```

### Projects

**Create Project**
```bash
POST /v1/projects
Content-Type: application/json

{
  "id": "proj-1",
  "name": "My Project",
  "path": "/home/user/projects/my-project",
  "auto_sync": true
}
```

**List Projects**
```bash
GET /v1/projects
```

Response:
```json
{
  "projects": [
    {
      "id": "proj-1",
      "name": "My Project",
      "path": "/home/user/projects/my-project",
      "autoSync": true
    }
  ]
}
```

**Delete Project**
```bash
DELETE /v1/projects/{id}
```

### Devices

**Register Device**
```bash
POST /v1/devices/register
Content-Type: application/json

{
  "cloud_token": "token123..."
}
```

### Syncthing

**Rescan Folder**
```bash
POST /v1/syncthing/folders/{folderid}/rescan
```

**Pause Folder**
```bash
POST /v1/syncthing/folders/{folderid}/pause
```

**Resume Folder**
```bash
POST /v1/syncthing/folders/{folderid}/resume
```

### WebSocket Events

**Connect**
```bash
ws://127.0.0.1:29999/v1/events
```

**Event Types**

- `fileUpdate` - File was updated
- `scanStart` - Started scanning folder
- `scanComplete` - Finished scanning
- `paused` - Sync paused
- `error` - Sync error
- `conflict` - File conflict
- `deviceConnected` - Device connected
- `deviceDisconnected` - Device disconnected

**Example Event**
```json
{
  "projectId": "proj-1",
  "type": "fileUpdate",
  "path": "/home/user/projects/my-project/document.txt",
  "message": "File synced successfully",
  "timestamp": "2024-11-11T10:30:00Z"
}
```

## 🔐 Security Notes

### Nebula Privilege Escalation

On **Linux/macOS**, creating a TUN device requires elevated privileges:

1. Agent detects if TUN creation is needed
2. Returns HTTP response with `action: "elevate"`
3. Electron shows UI prompt: "Grant Nebula permission"
4. User approves → Agent attempts `pkexec` or `sudo`
5. Agent restarts Nebula with elevated privileges

**Never silently escalates — always prompts user first.**

### File Permissions

- Agent data: `~/.vidsync/` (0700)
- API keys/tokens: 0600 (read/write owner only)
- Device certificate: 0600

## 📂 Database Schema

### devices table
```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT,
  platform TEXT,
  token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### projects table
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  auto_sync BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### sync_events table
```sql
CREATE TABLE sync_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT,
  message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

## 🧪 Testing

```bash
cd go-agent
go test ./...
go test -v -race ./...
```

## 🐛 Debugging

Enable debug logging:
```bash
LOG_LEVEL=debug ./vidsync-agent
```

Check Syncthing status:
```bash
curl http://localhost:8384/rest/system/status?apikey=YOUR_API_KEY
```

Monitor WebSocket connections:
```bash
wscat -c ws://127.0.0.1:29999/v1/events
```

## 📝 Configuration File Locations

- **Agent Data**: `~/.vidsync/`
- **Syncthing Config**: `~/.vidsync/syncthing/`
- **Nebula Config**: `~/.vidsync/nebula.yml`
- **Device Info**: `~/.vidsync/device.db`
- **Sync DB**: `~/.vidsync/sync.db`

## 🚦 Troubleshooting

### Port 29999 Already in Use
```bash
# Find process using port
lsof -i :29999
# Kill it
kill -9 <PID>
```

### Syncthing Binary Not Found
```bash
# Verify binary exists
ls -la go-agent/bin/syncthing/linux/syncthing
# Make executable
chmod +x go-agent/bin/syncthing/linux/syncthing
```

### Nebula Permission Denied
```bash
# Try with pkexec
sudo pkexec go-agent/bin/nebula/linux/nebula -config ~/.vidsync/nebula.yml
```

### WebSocket Connection Timeout
```bash
# Check firewall
sudo ufw allow 29999/tcp
# Verify agent is running
curl http://127.0.0.1:29999/v1/status
```

## 📚 Resources

- [Syncthing REST API](https://docs.syncthing.net/rest/)
- [Nebula VPN](https://nebula.defined.net/)
- [Gorilla WebSocket](https://github.com/gorilla/websocket)

---

**Built with ❤️ for Vidsync**
