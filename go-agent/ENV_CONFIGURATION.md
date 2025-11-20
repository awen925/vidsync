# Go Agent Environment Configuration

## Overview

The Go Agent supports environment variable configuration for all key services. This allows you to run multiple instances with different configurations without recompiling.

---

## Environment Variables

### Cloud API Configuration

**Variable**: `CLOUD_URL`

- **Description**: URL of the Cloud API service
- **Default**: `http://localhost:5000/api`
- **Format**: `http://host:port/api` or `http://host:port`
- **Example**:
  ```bash
  export CLOUD_URL=http://localhost:5000/api
  export CLOUD_URL=http://cloud.example.com:5000/api
  export CLOUD_URL=https://api.vidsync.cloud
  ```

### Logging Configuration

**Variable**: `LOG_LEVEL`

- **Description**: Set the logging verbosity level
- **Default**: `info`
- **Valid Values**: 
  - `debug` - Detailed information for diagnosing problems
  - `info` - General informational messages
  - `warn` - Warning messages for potentially harmful situations
  - `error` - Error messages
- **Example**:
  ```bash
  export LOG_LEVEL=debug
  export LOG_LEVEL=info
  export LOG_LEVEL=warn
  export LOG_LEVEL=error
  ```

---

## Configuration File (.env)

The `.env` file in the go-agent root directory provides default values that can be overridden by environment variables.

### Current .env

**Location**: `/home/fograin/work1/vidsync/go-agent/.env`

```env
CLOUD_URL=http://localhost:5000/api
LOG_LEVEL=info
```

### Using .env File

```bash
# The .env file is loaded automatically on startup
cd go-agent
./vidsync-agent

# Or explicitly specify with godotenv
export $(cat .env | xargs)
./vidsync-agent
```

---

## Priority Order (Highest to Lowest)

1. **Command-line Environment Variables** (highest priority)
   ```bash
   export CLOUD_URL=http://custom:5000/api
   ./vidsync-agent  # Uses custom URL
   ```

2. **.env File**
   ```env
   CLOUD_URL=http://localhost:5000/api
   ```

3. **Hardcoded Defaults** (lowest priority)
   - Cloud URL: `http://localhost:5000/api`
   - Log Level: `info`

---

## Quick Start Examples

### Local Development

```bash
# Use default configuration (Cloud API on localhost:5000)
cd go-agent
./vidsync-agent
```

### Remote Cloud API

```bash
# Connect to remote Cloud API
export CLOUD_URL=http://api.example.com:5000/api
cd go-agent
./vidsync-agent
```

### Debug Mode

```bash
# Enable detailed logging
export LOG_LEVEL=debug
cd go-agent
./vidsync-agent
```

### Multiple Instances

```bash
# Terminal 1: Development instance (localhost:5000)
export CLOUD_URL=http://localhost:5000/api
export LOG_LEVEL=debug
cd go-agent
./vidsync-agent

# Terminal 2: Staging instance (staging:5000)
export CLOUD_URL=http://staging:5000/api
export LOG_LEVEL=info
cd go-agent
./vidsync-agent
```

---

## Configuration Verification

To verify your configuration is loaded correctly, check the startup logs:

```bash
./vidsync-agent 2>&1 | grep -E "Cloud|Config|initialized"
```

Expected output:
```
[2025-11-20 07:09:15] [INFO] [agent] Starting Vidsync Agent
[2025-11-20 07:09:15] [INFO] [agent] HTTP API server started on :5001
[ProjectService] Creating project WITH snapshot generation:
```

---

## Troubleshooting

### Issue: "Failed to create project in cloud"

**Symptom**:
```
[ERROR] [agent] Failed to create project in cloud: Post "http://localhost:3000/api/projects": 
dial tcp 127.0.0.1:3000: connect: connection refused
```

**Cause**: Go agent is using wrong Cloud URL (localhost:3000 instead of localhost:5000)

**Solution**:
```bash
# Check current .env
cat go-agent/.env

# Should show:
# CLOUD_URL=http://localhost:5000/api

# If not, update .env and rebuild
make clean && make build

# Or set environment variable
export CLOUD_URL=http://localhost:5000/api
./vidsync-agent
```

### Issue: "Connection refused" on startup

**Symptom**:
```
dial tcp 127.0.0.1:5000: connect: connection refused
```

**Cause**: Cloud API server is not running

**Solution**:
```bash
# Check if Cloud API is running
ps aux | grep -E "node|cloud" | grep -v grep

# Start Cloud API if not running
cd cloud
npm run start

# Then start Go agent
cd ../go-agent
./vidsync-agent
```

### Issue: Changes not taking effect

**Symptom**: Changed `.env` file but Go agent still using old values

**Cause**: Environment variables are loaded at startup from `.env` file

**Solution**:
```bash
# Kill old process
pkill vidsync-agent

# Wait for clean shutdown
sleep 2

# Verify old process is gone
ps aux | grep vidsync-agent

# Start fresh
cd go-agent
./vidsync-agent
```

---

## Configuration in Code

The configuration is defined in `/go-agent/internal/config/config.go`:

```go
// Load environment variables with defaults
CloudURL: getEnv("CLOUD_URL", "http://localhost:5000/api"),

// Used when accessing Cloud API
cloudClient := api.NewCloudClient(cfg.CloudURL, cfg.CloudKey)
```

---

## Related Services Configuration

### Cloud API Environment

**Location**: `/home/fograin/work1/vidsync/cloud/.env`

```env
PORT=5000
DATABASE_URL=...
```

### Electron Environment

**Location**: `/home/fograin/work1/vidsync/electron/.env`

```env
REACT_APP_CLOUD_URL=http://localhost:5000/api
REACT_APP_AGENT_URL=http://127.0.0.1:5001/api/v1
```

---

## Production Deployment

### Docker Example

```dockerfile
FROM golang:1.22

WORKDIR /app
COPY go-agent .

# Build
RUN make build

# Set environment for production
ENV CLOUD_URL=https://api.vidsync.cloud
ENV LOG_LEVEL=warn

EXPOSE 5001

CMD ["./vidsync-agent"]
```

### Kubernetes ConfigMap Example

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vidsync-agent-config
data:
  CLOUD_URL: "http://cloud-api:5000/api"
  LOG_LEVEL: "info"

---
apiVersion: v1
kind: Pod
metadata:
  name: vidsync-agent
spec:
  containers:
  - name: agent
    image: vidsync-agent:latest
    envFrom:
    - configMapRef:
        name: vidsync-agent-config
```

---

## Summary

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLOUD_URL` | `http://localhost:5000/api` | Cloud API endpoint |
| `LOG_LEVEL` | `info` | Logging verbosity |

**Key Points**:
- ✅ Environment variables override .env file and defaults
- ✅ .env file in go-agent root loads automatically
- ✅ Changes require restart to take effect
- ✅ All configuration is optional (defaults work for local dev)
- ✅ Perfect for multi-environment deployments
