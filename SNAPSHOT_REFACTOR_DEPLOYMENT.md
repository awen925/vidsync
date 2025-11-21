# Snapshot Upload Refactor - Deployment Guide

## Summary of Changes
The snapshot upload architecture has been refactored to eliminate duplicate compression and centralize storage operations. Go-Agent now compresses snapshots once and sends them to Cloud API, which handles storage upload and metadata updates atomically.

## Key Changes

### Go-Agent Changes
- **No longer needs Supabase credentials** (SUPABASE_URL, SUPABASE_ANON_KEY)
- Sends compressed snapshots directly to Cloud API instead of Supabase Storage
- Simpler, more secure architecture

### Cloud API Changes
- Snapshot endpoint now accepts multipart file uploads
- Receives pre-compressed gzip files (not uncompressed JSON)
- Handles both storage upload and metadata update in single atomic operation

## Deployment Order (IMPORTANT)

### Step 1: Deploy Updated Cloud API
```bash
cd cloud
npm install  # Installs new multer dependency
npm run build
# Deploy new dist/ to production
```

**Why First?**
- The new endpoint accepts different format (multipart instead of JSON)
- Old Go-Agent cannot call new endpoint
- New Go-Agent cannot call old endpoint either
- So update Cloud API first to prepare for new clients

### Step 2: Deploy Updated Go-Agent
```bash
cd go-agent
go build -o vidsync-agent ./cmd/agent/main.go
# Deploy new binary to all devices
```

**Result:**
- Go-Agent will use new multipart upload format
- Can successfully communicate with updated Cloud API
- No longer requires Supabase credentials

## Environment Variable Changes

### Go-Agent - REMOVE (No Longer Needed)
```bash
# Delete these - they're now unused:
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

### Go-Agent - KEEP (Still Required)
```bash
# These are still required:
CLOUD_URL=https://your-cloud-api.com
CLOUD_KEY=your-api-key
```

### Cloud API - NO CHANGE
```bash
# Continue using existing Supabase credentials:
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

## Verification Steps

After deployment, verify the refactored system works:

### 1. Check Cloud API is Running
```bash
curl https://your-cloud-api.com/health
# Should return 200 OK with status: ok
```

### 2. Trigger Snapshot Generation
- Open Electron app
- Create a new file sync
- Wait for snapshot to complete

### 3. Verify in Supabase Dashboard
- Navigate to Storage → project-snapshots bucket
- Should see snapshot files: `projectId/snapshot_*.json.gz`
- Files should be gzip format (not plain JSON)

### 4. Check Project Metadata Updated
- Query projects table
- Verify snapshot_url is populated
- Verify snapshot_updated_at is recent
- Verify snapshot_file_count is correct

### 5. Check Logs
**Cloud API logs:**
```
[Snapshot:projectId] POST /snapshot received from Go agent
[Snapshot:projectId] ✅ User authorized as owner
[Snapshot:projectId] Uploading gzip file to Supabase Storage...
[Snapshot:projectId] ✅ Uploaded to storage: projectId/snapshot_*.json.gz
[Snapshot:projectId] ✅ Project metadata updated in database
[Snapshot:projectId] ✅ Snapshot upload complete
```

**Go-Agent logs:**
```
[FileService] Compressed: XXXX → YYYY bytes (%.1f%)
[FileService] Uploading compressed snapshot to Cloud API...
[FileService] Snapshot stored at: https://...
[FileService] Cloud API automatically updated project metadata
```

## Rollback Plan

If issues occur, can rollback to previous version by:

1. **Deploy old Cloud API** (with compression logic restored)
2. **Deploy old Go-Agent** (with Supabase upload logic)
3. Restore SUPABASE_URL and SUPABASE_ANON_KEY env vars to Go-Agent

However, this refactor is **low-risk** because:
- No database schema changes
- No data format changes (still gzip-compressed JSON)
- Storage location unchanged
- URL format unchanged

## Monitoring

### Metrics to Watch
- Snapshot upload time (should be similar or faster)
- Cloud API response time for POST /projects/:projectId/snapshot
- Error rate for snapshot uploads
- File size of stored snapshots (8-15% of original)

### Alerts to Set
- Cloud API snapshot endpoint errors increasing
- Supabase Storage upload failures
- Multipart request size exceeding limits (500MB)

## Benefits of This Refactor

1. **Simplified Go-Agent** - No Supabase credentials needed
2. **No Duplicate Compression** - Saves CPU on both sides
3. **Atomic Operations** - Upload and metadata update together
4. **Centralized Storage** - Cloud API is single source of truth
5. **Better Security** - Go-Agent doesn't touch Supabase directly
6. **Easier Maintenance** - One less API client to manage

## File Sizes & Compression

Typical snapshot compression ratios:
- 10,000 files: ~500KB → ~40KB (8% original size)
- 50,000 files: ~2.5MB → ~200KB (8% original size)
- 100,000 files: ~5MB → ~400KB (8% original size)

**Note:** Exact ratio depends on:
- Number of files
- File paths (longer paths = less compression)
- JSON metadata structure
- File diversity

## Support & Troubleshooting

### Snapshot not appearing in Supabase Storage
1. Check Cloud API logs for "Storage upload failed"
2. Verify SUPABASE_URL and SUPABASE_ANON_KEY in Cloud API env
3. Verify Supabase Storage bucket "project-snapshots" exists
4. Check Supabase Storage permissions

### Go-Agent fails to upload snapshot
1. Check Go-Agent logs for error details
2. Verify CLOUD_URL and CLOUD_KEY in Go-Agent env
3. Verify Cloud API is accessible from Go-Agent machine
4. Check network connectivity/firewall

### Project metadata not updating
1. Check Cloud API logs for "Failed to update project metadata"
2. Verify Cloud API can reach Supabase
3. Check project table constraints
4. Verify user has permission to update project

## Questions?

See ARCHITECTURE_REFACTOR_SNAPSHOT.md for detailed technical information about the refactoring.
