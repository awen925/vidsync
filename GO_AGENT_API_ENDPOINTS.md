# Go Agent API Endpoints - Complete Reference

## Base URL
```
http://127.0.0.1:5001/api/v1
```

> **⚠️ Important**: Use `127.0.0.1` instead of `localhost` for reliable IPv4 connections.

---

## Health Check

### Health Status
- **Endpoint**: `GET /api/v1/health`
- **Status**: ✅ **200 OK**
- **Response**:
  ```json
  {
    "status": "ok"
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/health
  ```

---

## Project Management Endpoints

### 1. Create Project
- **Endpoint**: `POST /api/v1/projects`
- **Status**: ✅ Working (returns 500 if Syncthing not available)
- **Request Body**:
  ```json
  {
    "name": "my-project",
    "path": "/path/to/project",
    "description": "Project description"
  }
  ```
- **Response**:
  ```json
  {
    "id": "project-id",
    "name": "my-project",
    "path": "/path/to/project",
    "status": "initialized"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects \
    -H "Content-Type: application/json" \
    -d '{"name":"my-project","path":"/path/to/project"}'
  ```

### 2. Create Project With Snapshot
- **Endpoint**: `POST /api/v1/projects/with-snapshot`
- **Status**: ✅ Working (returns 500 if Cloud API not available)
- **Request Body**:
  ```json
  {
    "name": "my-project",
    "path": "/path/to/project",
    "generateSnapshot": true
  }
  ```
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "status": "snapshot-generation-started"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects/with-snapshot \
    -H "Content-Type: application/json" \
    -d '{"name":"my-project","path":"/path/to/project","generateSnapshot":true}'
  ```

### 3. Get Project
- **Endpoint**: `GET /api/v1/projects/{projectId}`
- **Status**: ✅ Working
- **Path Parameters**:
  - `projectId`: The ID of the project
- **Response**:
  ```json
  {
    "id": "project-id",
    "name": "my-project",
    "path": "/path/to/project",
    "status": "active"
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/projects/project-123
  ```

### 4. Get Project Status
- **Endpoint**: `GET /api/v1/projects/{projectId}/status`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "status": "syncing",
    "filesCount": 250,
    "totalSize": "1.5GB",
    "lastSyncTime": "2025-11-20T14:00:00Z"
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/projects/project-123/status
  ```

### 5. Delete Project
- **Endpoint**: `DELETE /api/v1/projects/{projectId}`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "message": "Project deleted successfully"
  }
  ```
- **Example**:
  ```bash
  curl -X DELETE http://127.0.0.1:5001/api/v1/projects/project-123
  ```

---

## Project Device Management

### 1. Add Device to Project
- **Endpoint**: `POST /api/v1/projects/{projectId}/devices`
- **Status**: ✅ Working
- **Path Parameters**:
  - `projectId`: The ID of the project
- **Request Body**:
  ```json
  {
    "deviceId": "device-uuid",
    "deviceName": "laptop"
  }
  ```
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "deviceId": "device-uuid",
    "status": "added"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects/project-123/devices \
    -H "Content-Type: application/json" \
    -d '{"deviceId":"device-uuid","deviceName":"laptop"}'
  ```

### 2. Remove Device from Project
- **Endpoint**: `DELETE /api/v1/projects/{projectId}/devices/{deviceId}`
- **Status**: ✅ Working
- **Path Parameters**:
  - `projectId`: The ID of the project
  - `deviceId`: The ID of the device
- **Response**:
  ```json
  {
    "message": "Device removed from project"
  }
  ```
- **Example**:
  ```bash
  curl -X DELETE http://127.0.0.1:5001/api/v1/projects/project-123/devices/device-uuid
  ```

---

## Synchronization Control

### 1. Start Sync
- **Endpoint**: `POST /api/v1/projects/{projectId}/sync/start`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "status": "syncing",
    "message": "Sync started"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects/project-123/sync/start \
    -H "Content-Type: application/json" -d '{}'
  ```

### 2. Pause Sync
- **Endpoint**: `POST /api/v1/projects/{projectId}/sync/pause`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "status": "paused",
    "message": "Sync paused"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects/project-123/sync/pause \
    -H "Content-Type: application/json" -d '{}'
  ```

### 3. Resume Sync
- **Endpoint**: `POST /api/v1/projects/{projectId}/sync/resume`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "status": "syncing",
    "message": "Sync resumed"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects/project-123/sync/resume \
    -H "Content-Type: application/json" -d '{}'
  ```

### 4. Stop Sync
- **Endpoint**: `POST /api/v1/projects/{projectId}/sync/stop`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "status": "stopped",
    "message": "Sync stopped"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects/project-123/sync/stop \
    -H "Content-Type: application/json" -d '{}'
  ```

### 5. Get Sync Status
- **Endpoint**: `GET /api/v1/projects/{projectId}/sync/status`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "status": "syncing",
    "filesCount": 250,
    "bytesTransferred": 1073741824,
    "totalBytes": 1610612736,
    "progress": 66.7,
    "eta": "2m 30s"
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/projects/project-123/sync/status
  ```

---

## File Management

### 1. Get Files (List)
- **Endpoint**: `GET /api/v1/projects/{projectId}/files`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "files": [
      {
        "path": "file.txt",
        "size": 1024,
        "modified": "2025-11-20T14:00:00Z"
      }
    ]
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/projects/project-123/files
  ```

### 2. Get File Tree (Hierarchical)
- **Endpoint**: `GET /api/v1/projects/{projectId}/files-tree`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "tree": {
      "name": "project-root",
      "type": "directory",
      "children": [
        {
          "name": "folder1",
          "type": "directory",
          "children": []
        },
        {
          "name": "file.txt",
          "type": "file",
          "size": 1024
        }
      ]
    }
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/projects/project-123/files-tree
  ```

### 3. Generate Snapshot
- **Endpoint**: `POST /api/v1/projects/{projectId}/snapshot`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "snapshotId": "snapshot-uuid",
    "status": "generating",
    "startTime": "2025-11-20T14:00:00Z"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/projects/project-123/snapshot \
    -H "Content-Type: application/json" -d '{}'
  ```

---

## Snapshot Progress Tracking

### 1. Get Snapshot Progress
- **Endpoint**: `GET /api/v1/projects/{projectId}/progress`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "projectId": "project-id",
    "progress": {
      "step": 3,
      "totalSteps": 6,
      "currentStep": "Generating file tree",
      "filesProcessed": 150,
      "totalFiles": 500,
      "percentComplete": 50
    }
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/projects/project-123/progress
  ```

### 2. Subscribe to Snapshot Progress (Server-Sent Events)
- **Endpoint**: `GET /api/v1/projects/{projectId}/progress/stream`
- **Status**: ✅ Working (SSE streaming)
- **Content-Type**: `text/event-stream`
- **Response Format**:
  ```
  data: {"step":1,"currentStep":"Creating project","percentComplete":0}
  data: {"step":2,"currentStep":"Scanning files","percentComplete":20}
  data: {"step":3,"currentStep":"Generating tree","percentComplete":50}
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/projects/project-123/progress/stream
  ```
- **JavaScript Client**:
  ```javascript
  const eventSource = new EventSource('http://127.0.0.1:5001/api/v1/projects/project-123/progress/stream');
  eventSource.onmessage = (event) => {
    console.log(JSON.parse(event.data));
  };
  ```

---

## Device Management

### 1. Sync Device
- **Endpoint**: `POST /api/v1/devices/sync`
- **Status**: ✅ Working
- **Request Body**:
  ```json
  {
    "deviceId": "device-uuid"
  }
  ```
- **Response**:
  ```json
  {
    "deviceId": "device-uuid",
    "status": "synced"
  }
  ```
- **Example**:
  ```bash
  curl -X POST http://127.0.0.1:5001/api/v1/devices/sync \
    -H "Content-Type: application/json" \
    -d '{"deviceId":"device-uuid"}'
  ```

### 2. Get Device Status
- **Endpoint**: `GET /api/v1/devices/{deviceId}/status`
- **Status**: ✅ Working
- **Response**:
  ```json
  {
    "deviceId": "device-uuid",
    "name": "laptop",
    "status": "online",
    "lastSeen": "2025-11-20T14:00:00Z",
    "projects": [
      {
        "projectId": "project-123",
        "syncStatus": "up-to-date"
      }
    ]
  }
  ```
- **Example**:
  ```bash
  curl http://127.0.0.1:5001/api/v1/devices/device-uuid/status
  ```

---

## Quick Test Script

Save as `test-endpoints.sh`:

```bash
#!/bin/bash

BASE_URL="http://127.0.0.1:5001/api/v1"

echo "Testing Go Agent API Endpoints"
echo "================================"
echo ""

# Test health
echo "1. Testing Health:"
curl -s "$BASE_URL/health" | jq '.'
echo ""

# Test create project
echo "2. Creating test project:"
curl -s -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-project"}' | jq '.'
echo ""

# Replace PROJECT_ID with actual ID from above
PROJECT_ID="test-123"

echo "3. Getting project status:"
curl -s "$BASE_URL/projects/$PROJECT_ID/status" | jq '.'
echo ""

echo "4. Listing files:"
curl -s "$BASE_URL/projects/$PROJECT_ID/files" | jq '.'
echo ""
```

Run:
```bash
chmod +x test-endpoints.sh
./test-endpoints.sh
```

---

## API Status Summary

| Endpoint Category | Status | Notes |
|---|---|---|
| Health Check | ✅ 200 OK | Always responds |
| Project Management | ✅ Working | Requires Syncthing for full functionality |
| Device Management | ✅ Working | Requires Cloud API for persistence |
| Sync Control | ✅ Working | Requires Syncthing for actual sync |
| File Management | ✅ Working | Requires Syncthing filesystem |
| Snapshot Progress | ✅ Working | SSE streaming available |

---

## Troubleshooting

### Getting 404 Errors

**Issue**: All endpoints return 404

**Solutions**:
1. Use `127.0.0.1` instead of `localhost`
2. Verify server is running: `ps aux | grep vidsync-agent`
3. Check port is listening: `lsof -i :5001`
4. Verify URL format: `http://127.0.0.1:5001/api/v1/...`

### Getting 500 Errors

**Issue**: Endpoints return 500 Internal Server Error

**Causes**:
- Syncthing not running (check: `lsof -i :8384`)
- Cloud API not running (check: `lsof -i :5000`)
- Missing environment variables

**Solution**:
```bash
# Check what's running
ps aux | grep -E "syncthing|vidsync|node"

# Check logs
tail -f /home/fograin/.vidsync/agent.log
```

### Connection Refused

**Issue**: `curl: (7) Failed to connect to localhost port 5001`

**Solutions**:
1. Start the Go agent:
   ```bash
   cd /home/fograin/work1/vidsync/go-agent
   ./vidsync-agent
   ```
2. Rebuild if code changed:
   ```bash
   cd go-agent
   make build
   ```

---

## Environment Configuration

Set these to customize Go Agent behavior:

```bash
# Override agent binary path
export VIDSYNC_AGENT_PATH=/custom/path/to/vidsync-agent

# Enable debug logging
export VIDSYNC_DEBUG=1

# Set Cloud API URL
export CLOUD_URL=http://localhost:5000/api

# Set Syncthing URL
export SYNCTHING_URL=http://localhost:8384

# Set API port
export API_PORT=5001
```

---

## Related Files

- **Routes Definition**: `/go-agent/internal/handlers/routes.go`
- **Project Handler**: `/go-agent/internal/handlers/project.go`
- **Sync Handler**: `/go-agent/internal/handlers/sync.go`
- **File Handler**: `/go-agent/internal/handlers/file.go`
- **Progress Handler**: `/go-agent/internal/handlers/progress.go`
- **Device Handler**: `/go-agent/internal/handlers/device.go`
