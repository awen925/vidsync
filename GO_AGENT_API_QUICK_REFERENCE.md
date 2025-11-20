# Go Agent API - Quick Reference

## All Endpoints (Quick View)

### Health Check
```
GET    /api/v1/health
```

### Projects
```
POST   /api/v1/projects
POST   /api/v1/projects/with-snapshot
GET    /api/v1/projects/{projectId}
GET    /api/v1/projects/{projectId}/status
DELETE /api/v1/projects/{projectId}
```

### Project Devices
```
POST   /api/v1/projects/{projectId}/devices
DELETE /api/v1/projects/{projectId}/devices/{deviceId}
```

### Sync Control
```
POST   /api/v1/projects/{projectId}/sync/start
POST   /api/v1/projects/{projectId}/sync/pause
POST   /api/v1/projects/{projectId}/sync/resume
POST   /api/v1/projects/{projectId}/sync/stop
GET    /api/v1/projects/{projectId}/sync/status
```

### File Management
```
GET    /api/v1/projects/{projectId}/files
GET    /api/v1/projects/{projectId}/files-tree
POST   /api/v1/projects/{projectId}/snapshot
```

### Progress Tracking
```
GET    /api/v1/projects/{projectId}/progress
GET    /api/v1/projects/{projectId}/progress/stream  (SSE)
```

### Devices
```
POST   /api/v1/devices/sync
GET    /api/v1/devices/{deviceId}/status
```

---

## Test Commands

```bash
# Health check
curl http://127.0.0.1:5001/api/v1/health

# Create project
curl -X POST http://127.0.0.1:5001/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project"}'

# Get project status
curl http://127.0.0.1:5001/api/v1/projects/PROJECT_ID/status

# Start sync
curl -X POST http://127.0.0.1:5001/api/v1/projects/PROJECT_ID/sync/start \
  -H "Content-Type: application/json" -d '{}'

# Watch progress (real-time SSE)
curl http://127.0.0.1:5001/api/v1/projects/PROJECT_ID/progress/stream
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | ✅ Success |
| 404 | ❌ Resource not found or endpoint not found |
| 500 | ❌ Server error (usually missing dependencies) |

---

## Key Points

- **Base URL**: `http://127.0.0.1:5001/api/v1`
- **Use `127.0.0.1`** not `localhost` for IPv4
- **All endpoints registered** ✅ (added health endpoint)
- **20 endpoints total** available
- **Real-time progress** via SSE streaming
- **No 404s anymore** - all routes working

---

## Issue Fixed

**Problem**: All endpoints returned 404 despite code being correct

**Root Cause**: 
1. `go.mod` was set to `go 1.21` but using `go 1.22`
2. Go 1.22 has different HTTP routing semantics
3. Health endpoint was not registered

**Solution Applied**:
1. ✅ Updated `go.mod` to `go 1.22`
2. ✅ Added `/health` endpoint registration
3. ✅ Rebuilt binary
4. ✅ All endpoints now return appropriate responses

---

## Next Steps

If you're still getting errors:

1. **Verify server is running**:
   ```bash
   ps aux | grep vidsync-agent
   lsof -i :5001
   ```

2. **Test endpoint**:
   ```bash
   curl http://127.0.0.1:5001/api/v1/health
   # Should return: {"status":"ok"}
   ```

3. **Check dependencies**:
   ```bash
   lsof -i :8384    # Syncthing
   lsof -i :5000    # Cloud API
   ```

4. **View logs**:
   ```bash
   ps aux | grep vidsync-agent
   # Logs are output to terminal
   ```
