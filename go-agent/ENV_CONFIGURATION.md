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

### Supabase Configuration (Required for Snapshot Storage)

**Variables**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

#### SUPABASE_URL

- **Description**: Your Supabase project URL
- **Default**: Empty (must be configured for snapshot storage)
- **Format**: `https://[project-id].supabase.co`
- **Required**: Yes (for snapshot upload functionality)
- **Example**:
  ```bash
  export SUPABASE_URL=https://my-project.supabase.co
  ```

#### SUPABASE_ANON_KEY

- **Description**: Supabase public/anonymous key for storage operations
- **Default**: Empty (must be configured for snapshot storage)
- **Length**: ~40 characters, starts with `eyJ`
- **Required**: Yes (for snapshot upload functionality)
- **Security**: Safe to expose in client code (public key)
- **Example**:
  ```bash
  export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

#### SUPABASE_SERVICE_ROLE_KEY

- **Description**: Supabase service role key for admin operations
- **Default**: Empty
- **Length**: ~40 characters, starts with `eyJ`
- **Required**: No (optional for admin operations)
- **Security**: ⚠️ **KEEP SECRET** - Do not expose in client code
- **Example**:
  ```bash
  export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

#### How to Get Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Click **Settings** → **API**
4. Copy the values:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY`

#### Snapshot Storage Functionality

When Supabase credentials are configured, the agent:
- ✅ Compresses snapshots with gzip (reduces ~90% of size)
- ✅ Uploads directly to Supabase Storage (bypasses API size limits)
- ✅ Generates public URLs for snapshot access
- ✅ Updates projects with snapshot metadata

Without Supabase credentials:
- ❌ Snapshot upload fails with "Supabase credentials not configured"
- ❌ Project creation fails at snapshot generation step

---

## Configuration File (.env)

The `.env` file in the go-agent root directory provides default values that can be overridden by environment variables.

### Current .env

**Location**: `/home/fograin/work1/vidsync/go-agent/.env`

```env
CLOUD_URL=http://localhost:5000/api
LOG_LEVEL=info
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Template**: See `.env.example` for configuration template with comments

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
   - Supabase URL: Empty (snapshot storage disabled)
   - Supabase Anon Key: Empty (snapshot storage disabled)

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

### Issue: "Supabase credentials not configured"

**Symptom**:
```
[ERROR] [FileService] Non-retryable error, failing immediately: failed to upload to Supabase Storage: Supabase credentials not configured
```

**Cause**: `SUPABASE_URL` and/or `SUPABASE_ANON_KEY` environment variables not set

**Solution**:

1. Check if `.env` file exists:
   ```bash
   ls -la go-agent/.env
   ```

2. Verify Supabase credentials are in `.env`:
   ```bash
   grep SUPABASE go-agent/.env
   ```

3. If missing, copy from Supabase dashboard:
   - Go to https://app.supabase.com/project/[your-project-id]/settings/api
   - Copy "Project URL" and "anon public" key
   - Update `.env`:
     ```env
     SUPABASE_URL=https://my-project.supabase.co
     SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     ```

4. Restart the agent:
   ```bash
   pkill vidsync-agent
   sleep 2
   cd go-agent
   ./vidsync-agent
   ```

5. Check startup logs:
   ```bash
   ./vidsync-agent 2>&1 | grep -E "Supabase|Storage"
   ```

   Expected:
   ```
   [DEBUG] Supabase config - URL: https://my-project.supabase.co, AnonKey: eyJh...nkey
   [INFO] FileService configured with Supabase storage: https://my-project.supabase.co
   ```

### Issue: Snapshot upload fails with "Request Entity Too Large"

**Symptom**:
```
[ERROR] Failed to upload snapshot: Request Entity Too Large
```

**Cause**: Supabase credentials not configured, falling back to direct Cloud API upload

**Solution**: Configure Supabase credentials (see issue above)

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

### Supabase Environment

**Variables**:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Required for**:
- Snapshot storage (direct upload to Supabase Storage)
- Gzip compression (reduces snapshot size 90%)
- Bypassing Cloud API request size limits

**Setup Steps**:
1. Create Supabase project at https://supabase.com
2. Create storage bucket named `project-snapshots`
3. Set bucket policies to allow public read access
4. Get credentials from Project Settings → API
5. Add to `.env` in go-agent directory

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

| Variable | Default | Purpose | Required |
|----------|---------|---------|----------|
| `CLOUD_URL` | `http://localhost:5000/api` | Cloud API endpoint | ✅ Yes |
| `LOG_LEVEL` | `info` | Logging verbosity | ❌ No |
| `SUPABASE_URL` | Empty | Supabase project URL | ✅ Yes (for snapshots) |
| `SUPABASE_ANON_KEY` | Empty | Supabase public key | ✅ Yes (for snapshots) |
| `SUPABASE_SERVICE_ROLE_KEY` | Empty | Supabase admin key | ❌ No |

**Key Points**:
- ✅ Environment variables override .env file and defaults
- ✅ .env file in go-agent root loads automatically
- ✅ Changes require restart to take effect
- ✅ All configuration is optional (defaults work for local dev)
- ✅ Perfect for multi-environment deployments
- ✅ Supabase credentials enable snapshot compression and direct storage upload
