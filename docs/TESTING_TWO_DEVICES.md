# Testing Phase 1 Between Two Devices

## 🎯 Overview

This guide explains how to test the Syncthing-first file sharing architecture between two actual devices using the current app implementation.

---

## 📋 Prerequisites

Before testing, ensure you have:

### Device Setup
- ✅ 2 physical devices (laptops, desktops, or VMs)
- ✅ Same network or able to connect via Nebula
- ✅ Electron app built and running on both

### Software Requirements
- ✅ Syncthing installed on both devices (https://syncthing.net/)
- ✅ Nebula configured (for mesh networking)
- ✅ Backend server running (port 5000)
- ✅ Supabase project with Phase 1 migration executed

### Database Setup
- ✅ 3 Phase 1 tables created in Supabase
- ✅ Sample project created in `projects` table
- ✅ Test users created in `auth.users`
- ✅ Project members added in `project_members` table

---

## 🚀 Step-by-Step Testing Process

### STEP 1: Prepare Two Devices

**Device A (Owner):**
```bash
# Build the app
cd /home/fograin/work1/vidsync
npm run build

# Start Syncthing
syncthing

# Start backend (if not running)
cd cloud
npm start
```

**Device B (Member):**
```bash
# Same as Device A
npm run build
syncthing
# Backend should be same cloud instance
```

### STEP 2: Create Test Project (Device A - Owner)

**In Electron App on Device A:**
1. Open "Your Projects" page
2. Click "Create New Project"
3. Fill in:
   - **Name:** "Test Sync Project"
   - **Description:** "Testing Phase 1 between devices"
   - **Local Path:** Select a folder to sync (e.g., ~/synced_files)
   - **Auto Sync:** Toggle ON
4. Click "Create"

**In Supabase Console:**
Verify the project was created:
```sql
SELECT id, name, owner_id FROM projects WHERE name = 'Test Sync Project' LIMIT 1;
```

### STEP 3: Set Up Syncthing Folder (Device A)

**On Device A:**
1. In Syncthing Web UI (http://localhost:8384):
   - Go to "Add Folder"
   - Set path to the same folder selected above
   - Set folder ID to your project_id (from Supabase)
   - Label it "Test Sync Project"
   - Click "Save"

2. Syncthing will start monitoring this folder

### STEP 4: Generate Invite Code (Device A)

**In Electron App on Device A (Project Detail Page):**
1. Click "Generate Invite Token" button
2. Copy the token (e.g., `abc123def456`)
3. Share this token to Device B

**What happens in background:**
```
User clicks "Generate Invite Token"
  ↓
POST /pairings endpoint called
  ↓
Token stored in project_invites table
  ↓
Token returned to UI
```

### STEP 5: Join Project (Device B - Member)

**In Electron App on Device B:**
1. Go to "Invited Projects" page
2. Paste the invite token
3. Click "Join Project"

**Database verification:**
```sql
SELECT user_id, project_id, status FROM project_members WHERE status = 'accepted';
```

### STEP 6: View Files List (Device B)

**In Electron App on Device B (Project Detail Page):**
1. Files section shows paginated list
2. Click "Sync This Project"
3. Choose folders to sync (or sync all)

**What happens:**
```
GET /api/projects/:projectId/files-list
  ↓
Backend queries project_file_snapshots
  ↓
Returns 500 files + hasMore flag
  ↓
React component renders table
```

### STEP 7: Populate Files (Device A)

**On Device A:**
1. Add files to the synced folder (~/synced_files)
2. Examples:
   - Create `documents/report.pdf`
   - Create `images/photo.jpg`
   - Create `videos/clip.mp4`
   - Total: various sizes and types

3. Syncthing automatically detects changes

### STEP 8: Refresh Snapshot (Device A)

**In Electron App on Device A (Project Detail Page):**
1. Click "Refresh Snapshot" button
2. Backend scans the folder
3. Updates `project_file_snapshots` table

**Database verification:**
```sql
SELECT COUNT(*) as file_count FROM project_file_snapshots 
WHERE project_id = 'your-project-id';
```

### STEP 9: Verify Files Appear (Device B)

**In Electron App on Device B (Project Detail Page):**
1. Files section auto-refreshes
2. Shows all files from Device A
3. Displays: file_path, size, modified_at, type
4. Pagination works (500 per page)

### STEP 10: Test Pagination

**Scenario: Project has 10,000+ files**

In Device B's file list:
```
Page 1 (0-499): Shows files, hasMore=true
Page 2 (500-999): Loads next set
Page 3 (1000-1499): Continues
...
Last page: hasMore=false
```

**Performance check:**
- Each page load should take <500ms
- No UI lag or freezing
- Smooth scrolling through pages

---

## 🧪 Test Scenarios

### Scenario A: Basic File Sync

**Setup:**
- Device A: Owner with 100 files in project folder
- Device B: Member who just joined

**Test:**
1. Device B opens project
2. Files list appears with all 100 files ✓
3. Click "Sync This Project"
4. Syncthing starts P2P transfer
5. Progress bar shows download
6. Files appear on Device B local disk ✓

**Expected Result:** All 100 files downloaded via P2P (no cloud bandwidth)

### Scenario B: Add Files After Join

**Setup:**
- Device A & B already syncing project
- Member viewing file list

**Test:**
1. Device A user adds 50 new files to folder
2. Device A clicks "Refresh Snapshot"
3. Device B's file list auto-updates (or click refresh)
4. New files appear in list ✓
5. Member can click to sync the new files

**Expected Result:** New files appear without manual refresh on Device B

### Scenario C: Access Control

**Setup:**
- 3 different user accounts

**Test:**
1. User C (non-member) tries to access project
2. Gets 403 "Access Denied" ✓
3. Only Owner (A) and Member (B) can see files

**Expected Result:** Non-members cannot view project files

### Scenario D: Pagination at Scale

**Setup:**
- Project with 50,000 files (simulate if needed)

**Test:**
1. Device B opens project files
2. Page 1 loads in <500ms
3. Click "Next Page"
4. Page 2 loads in <500ms
5. Jump to page 50
6. Still fast <500ms ✓

**Expected Result:** Pagination remains fast at any scale

### Scenario E: Snapshot Metadata

**Setup:**
- Project with 1,000 files

**Test:**
1. Device B calls snapshot-metadata API
2. Returns:
   - snapshot_version: 5
   - total_files: 1000
   - total_size: 5GB
   - root_hash: abc123...
3. Metadata accurate ✓

**Expected Result:** Metadata queries return correct data

### Scenario F: Owner Refresh Only

**Setup:**
- Device A (owner) and Device B (member)

**Test:**
1. Device B tries to click "Refresh Snapshot"
   - Button should NOT appear for members ✓
2. Only Device A sees the button
3. Device A can refresh, Device B cannot

**Expected Result:** Only owners can refresh snapshots

---

## 🔍 How to Debug Issues

### Issue: Files don't appear on Device B

**Check:**
```sql
-- Verify files in database
SELECT file_path, size, modified_at FROM project_file_snapshots 
WHERE project_id = 'your-project-id' 
LIMIT 5;

-- Check sync state
SELECT snapshot_version, total_files, last_snapshot_at 
FROM project_sync_state 
WHERE project_id = 'your-project-id';
```

**Troubleshoot:**
1. Did Device A click "Refresh Snapshot"? (required to populate DB)
2. Is Device B a member? Check `project_members` table
3. Is JWT token valid? Check app logs for auth errors
4. Is backend running? Check port 5000

### Issue: Pagination slow at 10k files

**Check:**
1. Are indexes created?
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'project_file_snapshots';
   ```

2. Test query directly:
   ```sql
   -- Should be <100ms
   EXPLAIN ANALYZE SELECT * FROM project_file_snapshots 
   WHERE project_id = 'your-id' 
   ORDER BY file_path 
   LIMIT 500;
   ```

3. Check database CPU/memory
4. Try pagination with smaller limit (100 instead of 500)

### Issue: Sync not starting

**Check:**
1. Is Syncthing running on both devices?
2. Are devices paired in Syncthing?
3. Check app logs for sync-start API call
4. Verify project folder exists on both devices

### Issue: "Access Denied" errors

**Check:**
```sql
-- Verify user is a member
SELECT * FROM project_members 
WHERE user_id = 'your-user-id' 
AND project_id = 'your-project-id';

-- Status should be 'accepted'
-- Not 'invited' or 'rejected'
```

---

## 📊 Monitoring & Observability

### Browser DevTools (Device B)

**Network Tab:**
```
GET /api/projects/abc-123/files-list?limit=500&offset=0
  Status: 200
  Time: 150ms
  Size: 2.5MB (500 files data)
```

**Console Tab:**
```javascript
// Check for errors
console.log('Files loaded:', files.length);
console.log('Pagination:', pagination);
```

**Application Tab:**
```
localStorage:
  auth_token: "eyJ0eXAi..."
  user_id: "user-123"
  project_id: "project-abc"
```

### Database Monitoring

**Check query performance:**
```sql
-- Enable query logging
SET log_min_duration_statement = 100; -- Log queries > 100ms

-- View recent queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
WHERE query LIKE '%project_file_snapshots%' 
ORDER BY mean_time DESC;
```

### Application Logs

**Backend:**
```bash
# Check Express logs for API calls
tail -f backend.log | grep "files-list"

# Should see:
# [INFO] GET /api/projects/abc-123/files-list - 200 - 145ms
```

**Frontend:**
```javascript
// In ProjectFilesPage.tsx console
console.log('Fetching files from:', offset, 'to', offset + limit);
console.log('Response time:', Date.now() - startTime, 'ms');
console.log('Files received:', files.length);
```

---

## ✅ Success Criteria for Phase 1 Testing

Your Phase 1 implementation is working correctly when:

- ✅ Device A (owner) can create a project and add files
- ✅ Device A can generate an invite code for Device B
- ✅ Device B can join project using invite code
- ✅ Device B sees paginated file list (500 per page)
- ✅ Device B can trigger Syncthing sync
- ✅ Files transfer via P2P (not through cloud)
- ✅ Device A can refresh snapshot to add new files
- ✅ Device B sees new files after refresh
- ✅ Non-members get "Access Denied"
- ✅ Pagination is fast (<500ms)
- ✅ Component renders without errors
- ✅ All Material-UI elements display correctly

---

## 📝 Testing Checklist

Create a test log as you go:

```
Date: 2024-11-17
Tester: Your Name
Device A: MacBook Pro (owner)
Device B: Ubuntu Laptop (member)

TESTS:
[ ] Step 1: Devices prepared ✓
[ ] Step 2: Project created ✓
[ ] Step 3: Syncthing folder setup ✓
[ ] Step 4: Invite code generated ✓
[ ] Step 5: Device B joined ✓
[ ] Step 6: Files list visible ✓
[ ] Step 7: Test files added ✓
[ ] Step 8: Snapshot refreshed ✓
[ ] Step 9: New files appeared ✓
[ ] Step 10: Pagination works ✓

SCENARIO TESTS:
[ ] Scenario A: Basic sync ✓
[ ] Scenario B: Add files after join ✓
[ ] Scenario C: Access control ✓
[ ] Scenario D: Pagination at scale ✓
[ ] Scenario E: Metadata ✓
[ ] Scenario F: Owner refresh only ✓

ISSUES FOUND:
- (none so far)

NOTES:
- Transfer speed was excellent (100MB/s P2P)
- UI responsive even with 5000 files
```

---

## 🎯 Next Steps After Testing

### If Testing is Successful ✅

1. **Code Review**
   - Have team review implementation
   - Check for security issues
   - Verify best practices followed

2. **Performance Testing**
   - Test with 100k+ files
   - Measure database size
   - Check CPU/memory usage under load

3. **Security Audit**
   - Verify JWT tokens working
   - Check permission boundaries
   - Test for injection vulnerabilities

4. **Staging Deployment**
   - Deploy to staging environment
   - Test with real users
   - Collect feedback

5. **Production Rollout**
   - Plan gradual rollout
   - Set up monitoring
   - Prepare rollback plan

### If Issues Found ❌

1. **Identify Root Cause**
   - Is it database? API? React? Network?
   - Use debugging guide above

2. **Fix the Issue**
   - Update code
   - Test fix locally
   - Verify all tests still pass

3. **Document the Fix**
   - Update TESTING_PHASE1.md
   - Add to troubleshooting section
   - Note for future reference

4. **Re-test**
   - Repeat full test cycle
   - Verify fix didn't break anything else

---

## 🚀 What Comes After Phase 1

Once Phase 1 testing is complete and working:

### Phase 2: Selective Sync
- Users choose which folders to sync
- Partial project downloads
- Bandwidth optimization

### Phase 3: Bandwidth Management
- Per-project speed limits
- Time-based scheduling
- Priority queues

### Phase 4: Advanced Features
- Mobile app support
- Offline sync queue
- Advanced scheduling

### Phase 5: Enterprise
- User quotas
- Audit logging
- Advanced permissions

**But Phase 1 is fully functional without any of these!**

---

## 📞 Support

### Getting Help

1. **Check troubleshooting section** (above)
2. **Review TESTING_PHASE1.md** for test scenarios
3. **Check PHASE1_QUICK_REFERENCE.md** for API details
4. **Review source code comments** for implementation details

### Reporting Bugs

Include:
- Device OS (macOS, Linux, Windows)
- Number of files in project
- Error message from console
- Steps to reproduce
- Screenshots if applicable

---

## 📚 Reference Files

- **PHASE1_QUICK_REFERENCE.md** - API endpoints
- **ARCHITECTURE_SYNCTHING.md** - Design decisions
- **IMPLEMENTATION_PHASE1_STEPS.md** - Implementation details
- **TESTING_PHASE1.md** - Test scenarios
- **test-phase1-endpoints.sh** - Automated tests

---

**Testing Guide Complete!** 🎉

You now have everything needed to test Phase 1 between two devices.

Start with the prerequisites, follow the steps, run the scenarios, and enjoy seeing your Syncthing-first architecture in action!
