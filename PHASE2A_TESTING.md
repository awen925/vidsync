# Quick Start: Testing Phase 2a Integration

## Prerequisites
- Go service running on localhost:5001
- Syncthing running on localhost:8384
- Electron main process started

## Test Flow

### 1. Simple Health Check
```bash
# Test if Go service is running
curl http://localhost:5001/api/v1/health

# Expected: 200 OK (once we add health endpoint)
```

### 2. Test Project Operations

**Create Project:**
```bash
curl -X POST http://localhost:5001/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "test-project-1",
    "name": "Test Project",
    "localPath": "/tmp/test-sync",
    "deviceId": "syncthing-device-id",
    "ownerId": "user-123",
    "accessToken": "YOUR_TOKEN"
  }'
```

**Get Project:**
```bash
curl http://localhost:5001/api/v1/projects/test-project-1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test Sync Operations

**Start Sync:**
```bash
curl -X POST http://localhost:5001/api/v1/projects/test-project-1/sync/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"localPath": "/tmp/test-sync"}'
```

**Get Sync Status:**
```bash
curl http://localhost:5001/api/v1/projects/test-project-1/sync/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Pause Sync:**
```bash
curl -X POST http://localhost:5001/api/v1/projects/test-project-1/sync/pause \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Resume Sync:**
```bash
curl -X POST http://localhost:5001/api/v1/projects/test-project-1/sync/resume \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Stop Sync:**
```bash
curl -X POST http://localhost:5001/api/v1/projects/test-project-1/sync/stop \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Test Device Operations

**Add Device:**
```bash
curl -X POST http://localhost:5001/api/v1/projects/test-project-1/devices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"deviceId": "other-device-id"}'
```

**Remove Device:**
```bash
curl -X DELETE http://localhost:5001/api/v1/projects/test-project-1/devices/other-device-id \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Device Status:**
```bash
curl http://localhost:5001/api/v1/devices/syncthing-device-id/status
```

### 5. Test File Operations

**Get Files:**
```bash
curl http://localhost:5001/api/v1/projects/test-project-1/files \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get File Tree:**
```bash
curl http://localhost:5001/api/v1/projects/test-project-1/files-tree \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Generate Snapshot:**
```bash
curl -X POST http://localhost:5001/api/v1/projects/test-project-1/snapshot \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Debugging

### Check Go Service Logs
```bash
# If running in terminal
cd /home/fograin/work1/vidsync/go-agent
./agent

# Look for:
# [ProjectService] Creating project: test-project-1
# [SyncService] Starting sync for project: test-project-1
```

### Check Electron Main Process Logs
```bash
# In Electron dev tools console
# IPC messages are logged via goAgentClient
```

### Check Syncthing Logs
```bash
# Check if folders are being created
curl http://localhost:8384/rest/config/folders \
  -H "X-API-Key: YOUR_SYNCTHING_API_KEY"
```

## Common Issues

| Issue | Solution |
|-------|----------|
| `connection refused` on 5001 | Go service not running: `cd go-agent && ./agent` |
| `404 Not Found` | Endpoint doesn't exist yet or routing issue |
| `401 Unauthorized` | Missing or invalid Bearer token |
| `Syncthing error` | Check if Syncthing running on :8384 with correct API key |
| `Device not found` | Syncthing device ID may be different, check via status endpoint |

## Next Steps After Testing

1. ✅ Verify all 15 endpoints respond correctly
2. ⏳ Update cloud endpoints to delegate to Go service  
3. ⏳ Implement file operations (actual file listing)
4. ⏳ Test end-to-end from Electron UI

