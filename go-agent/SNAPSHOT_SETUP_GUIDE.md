# Snapshot Storage Setup Guide

Complete guide for configuring Supabase snapshot storage in Vidsync Go Agent.

## Overview

The Go Agent automatically generates and uploads project snapshots (compressed file listings) to Supabase Storage:

- 📦 **Compression**: gzip reduces snapshot size by 90% (3.2MB → 260KB)
- 📤 **Direct Upload**: Bypasses Cloud API size limits
- 🔗 **Public URLs**: Generates shareable snapshot links
- ⚡ **No Size Limits**: Handles large projects efficiently

## Prerequisites

- ✅ Supabase account (free tier available at https://supabase.com)
- ✅ Go Agent binary built and ready
- ✅ Cloud API running on localhost:5000

## Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Click **New Project**
4. Fill in:
   - **Name**: `vidsync` (or your choice)
   - **Database Password**: Generate strong password
   - **Region**: Choose closest to your location
5. Click **Create new project** and wait for database setup (2-3 minutes)

## Step 2: Create Storage Bucket

1. In Supabase dashboard, go to **Storage** (left sidebar)
2. Click **Create a new bucket**
3. Fill in:
   - **Name**: `project-snapshots` (required - agent uses this name)
   - **Visibility**: **Public** (allows agents to read snapshots)
4. Click **Create bucket**

⚠️ **Important**: Bucket MUST be named `project-snapshots` and set to **Public**

## Step 3: Get API Credentials

1. Go to **Settings** → **API** (left sidebar)
2. Under **Project API keys**, find:
   - **Project URL** (looks like: `https://abcdef123456.supabase.co`)
   - **anon public** (looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
   - **service_role secret** (for admin operations)

3. Copy these values - you'll need them next

## Step 4: Configure Go Agent

### Option A: Using .env File (Recommended)

1. Edit `go-agent/.env`:
   ```bash
   nano go-agent/.env
   ```

2. Add/update these lines:
   ```env
   CLOUD_URL=http://localhost:5000/api
   LOG_LEVEL=info
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. Replace with your actual values from Step 3

4. Save and close (Ctrl+X, then Y, then Enter)

### Option B: Using Environment Variables

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
./vidsync-agent
```

## Step 5: Verify Configuration

1. Start the agent:
   ```bash
   cd go-agent
   ./vidsync-agent
   ```

2. Look for these log messages (indicating success):
   ```
   [DEBUG] Supabase config - URL: https://your-project.supabase.co, AnonKey: eyJh...nkey
   [INFO] FileService configured with Supabase storage: https://your-project.supabase.co
   ```

3. If you see errors:
   ```
   [WARN] SUPABASE_URL not set
   [WARN] SUPABASE_ANON_KEY not set
   ```
   → Go back to Step 4 and verify your `.env` file

## Step 6: Test Snapshot Upload

1. Create a test project via Cloud API:
   ```bash
   curl -X POST http://localhost:5000/api/projects \
     -H "Content-Type: application/json" \
     -d '{
       "name": "test-project",
       "path": "/tmp/test-project",
       "auto_sync": true
     }'
   ```

2. Go Agent will:
   - Generate project snapshot (list of all files)
   - Compress with gzip
   - Upload to Supabase Storage
   - Generate public URL

3. Check logs for:
   ```
   [DEBUG] Compressing snapshot for storage...
   [INFO] Compressed: 3244222 → 260146 bytes (8.0%)
   [DEBUG] Uploading compressed snapshot to Supabase Storage...
   [INFO] Compressed: ... bytes 
   [DEBUG] File uploaded to storage successfully
   [DEBUG] Updating project snapshot_url in database...
   [INFO] Project snapshot_url updated successfully
   ```

4. Verify in Supabase dashboard → Storage → project-snapshots bucket
   - Should see new file like: `project_<id>_snapshot.json.gz`

## Troubleshooting

### Error: "Supabase credentials not configured"

**Cause**: `.env` file missing or empty

**Fix**:
```bash
# Verify .env exists
cat go-agent/.env

# Should show:
# SUPABASE_URL=https://...
# SUPABASE_ANON_KEY=eyJ...

# If missing, copy from .env.example
cp go-agent/.env.example go-agent/.env
nano go-agent/.env  # Add your credentials

# Restart agent
pkill vidsync-agent
sleep 2
cd go-agent
./vidsync-agent
```

### Error: "Request Entity Too Large"

**Cause**: Supabase credentials not configured, agent trying Cloud API fallback

**Fix**: See "Supabase credentials not configured" above

### Error: "Bucket not found: project-snapshots"

**Cause**: Storage bucket not created or wrong name

**Fix**:
1. Go to Supabase dashboard → Storage
2. Verify bucket named exactly `project-snapshots` exists
3. Set bucket visibility to **Public**
4. Restart agent

### Snapshots uploading but no public URL

**Cause**: Bucket is private instead of public

**Fix**:
1. Go to Supabase dashboard → Storage
2. Click `project-snapshots` bucket
3. In bucket settings, set **Visibility** to **Public**
4. Restart agent

### Large snapshot fails during compression

**Cause**: Out of memory during gzip compression

**Fix**:
- Ensure agent has at least 2GB RAM available
- Reduce snapshot size by excluding large files in Syncthing settings
- Check system memory: `free -h`

## Performance Notes

### Compression Ratio

Typical compression results:
- Small projects (< 100MB): 5-8% of original
- Medium projects (100MB-1GB): 8-12% of original
- Large projects (> 1GB): 12-15% of original

### Upload Speed

Network performance determines upload speed:
- 100 Mbps connection: ~260KB compressed snapshot ≈ 20ms upload
- 10 Mbps connection: ~260KB compressed snapshot ≈ 200ms upload

### Storage Costs

Supabase Storage (free tier):
- 1GB total storage included
- Typical snapshots: 200KB-500KB each
- Can store ~2,000-5,000 snapshots within free tier

## Security Considerations

### Public vs Private Credentials

- **SUPABASE_ANON_KEY**: Safe to expose (read-only storage access)
  - Used by agents for reading snapshots
  - Can be included in frontend code
  
- **SUPABASE_SERVICE_ROLE_KEY**: ⚠️ Keep SECRET
  - Used for admin operations
  - Should only be on trusted servers
  - Never commit to version control

### Bucket Security

- Set bucket to **Public** for agents to read snapshots
- Snapshots contain file paths and metadata (not file contents)
- No sensitive data in snapshots (only file structure)

## Next Steps

✅ Snapshots now automatically upload to Supabase Storage
✅ Projects can be of any size (90% compression)
✅ Public URLs available for snapshot sharing

## Reference

- **Supabase Docs**: https://supabase.com/docs
- **Storage API**: https://supabase.com/docs/guides/storage
- **Gzip Compression**: http://www.gzip.org/

## Getting Help

If issues persist:

1. Check logs with debug level:
   ```bash
   LOG_LEVEL=debug ./vidsync-agent
   ```

2. Verify credentials in Supabase:
   - https://app.supabase.com/project/[your-project-id]/settings/api

3. Test Supabase connection:
   ```bash
   curl -H "Authorization: Bearer YOUR_ANON_KEY" \
     https://your-project.supabase.co/storage/v1/object/list/project-snapshots
   ```

4. Check agent logs:
   ```bash
   ./vidsync-agent 2>&1 | grep -E "Supabase|snapshot|Storage"
   ```
