# Cloud API Configuration - Quick Fix Summary

## Problem

❌ Go Agent was calling Cloud API at **`http://localhost:3000/api`** (wrong port)

```
[ERROR] Failed to create project in cloud: 
Post "http://localhost:3000/api/projects": dial tcp connection refused
```

## Solution

✅ Updated Go Agent to call Cloud API at **`http://localhost:5000/api`** (correct port)

### Changes Made

| File | Change |
|------|--------|
| `go-agent/internal/config/config.go` | `3000` → `5000` |
| `go-agent/.env` | `3000` → `5000` |
| `go-agent/vidsync-agent` (binary) | Rebuilt with correct URL |

### Environment Variables Now Available

```bash
# Override Cloud URL without recompiling
export CLOUD_URL=http://cloud.example.com:5000/api
./vidsync-agent

# Set log level
export LOG_LEVEL=debug
./vidsync-agent
```

## Verification

```bash
# Check configuration
grep CLOUD_URL go-agent/.env
# Output: CLOUD_URL=http://localhost:5000/api

# Check service is running
curl http://127.0.0.1:5001/api/v1/health
# Output: {"status":"ok"}
```

## Service URLs (All Environments)

| Service | URL |
|---------|-----|
| Electron | `http://localhost:3001` |
| Cloud API | `http://localhost:5000/api` |
| Go Agent | `http://127.0.0.1:5001/api/v1` |
| Syncthing | `http://localhost:8384` |

## Configuration Priority

1. **Environment Variables** (highest) `export CLOUD_URL=...`
2. **.env file** `go-agent/.env`
3. **Hardcoded defaults** (lowest) `http://localhost:5000/api`

---

**Status**: ✅ Complete - Project creation should now work correctly
