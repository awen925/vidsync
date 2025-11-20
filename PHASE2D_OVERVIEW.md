# Phase 2d: Overview & Status

## Phase 2d: Cloud API Integration & Electron UI Updates

### Current Status: PLANNING ⏳

Phase 2d bridges the gap between the Go service's snapshot generation and the end-user experience by:
1. Creating the Cloud API endpoint to receive and store snapshots
2. Updating Electron UI to use the Go service instead of direct cloud API calls
3. Adding progress tracking and polling
4. Implementing error recovery with retry logic

### What Phase 2d Enables

```
BEFORE Phase 2d (Phase 2c):
├─ Go service generates snapshots ✅
└─ BUT: No endpoint to receive them ❌

AFTER Phase 2d:
├─ Go service generates snapshots ✅
├─ Cloud API receives snapshots ✅
├─ Snapshots stored in Supabase ✅
├─ Electron UI uses Go service ✅
├─ File tree displayed in UI ✅
└─ Complete end-to-end working ✅
```

## Phase 2d Architecture

```
ELECTRON UI
├─ User creates project
├─ Show "Creating project..." dialog
├─ Call goAgentClient.createProjectWithSnapshot()
│
└─ Poll GET /projects/{id} every 1s
   ├─ Check: snapshot_url != null?
   ├─ If yes: Display file tree
   └─ If no: Continue polling (timeout 5 min)

GO SERVICE (Port 5001)
├─ CreateProjectWithSnapshot handler
├─ Return immediately with projectId
│
└─ Background goroutine:
   ├─ Wait for Syncthing scan
   ├─ Browse files
   ├─ Generate JSON snapshot
   │
   └─ POST to Cloud API: /projects/{id}/snapshot
      ├─ Send: { projectId, files[], fileCount, ... }
      └─ Retry: 3 attempts with 1s, 2s, 4s backoff

CLOUD API (Node.js)
├─ Receive snapshot JSON
├─ Validate & authenticate
├─ Compress with gzip
├─ Upload to Supabase Storage
│  └─ Path: projects/{projectId}/snapshot_{timestamp}.json.gz
│  └─ Generate public URL
│
└─ Update database:
   ├─ snapshot_url = URL
   ├─ snapshot_updated_at = now
   ├─ snapshot_file_count = count
   └─ snapshot_total_size = size

Supabase Storage
└─ Bucket: project-snapshots (public)
   └─ projects/{projectId}/snapshot_{timestamp}.json.gz
```

## Key Components

### 1. Cloud API Endpoint ⏳

**Endpoint:** `POST /projects/{projectId}/snapshot`

**What It Does:**
```
Input: Raw snapshot JSON from Go service
  ├─ Validate project ownership
  ├─ Parse JSON
  ├─ Compress (gzip)
  ├─ Generate storage path
  ├─ Upload to bucket
  ├─ Get public URL
  ├─ Update database
  └─ Return URL
Output: { ok: true, snapshotUrl, snapshotSize, uploadedAt }
```

**File:** `/cloud/src/routes/projects.ts` (new handler)

### 2. Database Schema Update ⏳

**New Columns on `projects` table:**
```sql
snapshot_url TEXT                      -- Public URL to snapshot
snapshot_updated_at TIMESTAMP          -- When snapshot was last updated
snapshot_file_count INTEGER            -- Number of files in snapshot
snapshot_total_size BIGINT             -- Total bytes in files
```

**Migration File:** `/cloud/migrations/003-add-snapshot-columns.sql`

### 3. Electron UI Update ⏳

**File:** `/electron/src/renderer/pages/Projects/YourProjectsPage.tsx`

**Changes:**
- Remove direct `cloudAPI.post('/projects', ...)` calls
- Call `goAgentClient.createProjectWithSnapshot()` instead
- Add polling for snapshot completion
- Display file tree when snapshot ready

### 4. Retry Logic ⏳

**Location:** `/go-agent/internal/services/file_service.go`

**Strategy:**
```
Attempt 1: Upload snapshot
├─ If success: Done!
└─ If fails: Wait 1s

Attempt 2: Retry upload
├─ If success: Done!
└─ If fails: Wait 2s

Attempt 3: Retry upload
├─ If success: Done!
└─ If fails: Give up (log warning)

Result: Project works either way
- If upload succeeds: snapshot_url available
- If upload fails: Project still functions, files sync
```

## Implementation Roadmap

### Phase 2d-1: Cloud API Setup (High Priority)

**Tasks:**
- [ ] Create `/projects/:projectId/snapshot` endpoint
- [ ] Implement gzip compression
- [ ] Upload to Supabase Storage bucket
- [ ] Generate public URLs
- [ ] Handle errors and edge cases
- [ ] Test endpoint thoroughly

**Estimated Time:** 2 hours

### Phase 2d-2: Database Schema (High Priority)

**Tasks:**
- [ ] Write migration SQL
- [ ] Add snapshot columns to schema
- [ ] Create indexes for queries
- [ ] Test migration

**Estimated Time:** 30 minutes

### Phase 2d-3: Electron UI Update (High Priority)

**Tasks:**
- [ ] Add GoAgentClient method for status polling
- [ ] Update YourProjectsPage.handleCreateProject()
- [ ] Replace direct cloud API calls with Go service
- [ ] Add progress polling
- [ ] Display file tree when ready
- [ ] Test UI flow

**Estimated Time:** 2 hours

### Phase 2d-4: Retry Logic (Medium Priority)

**Tasks:**
- [ ] Implement retry wrapper function
- [ ] Add exponential backoff
- [ ] Determine retryable vs. non-retryable errors
- [ ] Update GenerateSnapshot to use retry
- [ ] Test retry behavior

**Estimated Time:** 1 hour

### Phase 2d-5: Testing & Polish (High Priority)

**Tasks:**
- [ ] Unit tests for Cloud API endpoint
- [ ] Unit tests for Electron UI
- [ ] Integration tests for full flow
- [ ] Error scenario testing
- [ ] Performance testing
- [ ] Documentation

**Estimated Time:** 2-3 hours

## Success Criteria

- ✅ Cloud API endpoint receives and stores snapshots
- ✅ Snapshots compressed and uploaded to Supabase Storage
- ✅ Database metadata updated with snapshot info
- ✅ Electron UI uses Go service for project creation
- ✅ UI polls for snapshot completion
- ✅ File tree displays when snapshot available
- ✅ Retry logic handles transient failures
- ✅ All error cases handled gracefully
- ✅ No regressions in existing functionality

## Risk Mitigation

### Risk: Storage Upload Fails
**Mitigation:**
- Implement retry logic with exponential backoff
- Fall back to skipping snapshot (project still works)
- Log failures for debugging
- Monitor storage quota

### Risk: Database Update Fails
**Mitigation:**
- Snapshot already in storage
- Don't fail if metadata update fails
- Can query storage directly if needed
- Eventually consistent approach

### Risk: Polling Timeout
**Mitigation:**
- Default timeout: 5 minutes (generous)
- Can manually refresh in UI
- Project works even without snapshot URL
- File tree loads when available

### Risk: UI Breaks During Transition
**Mitigation:**
- Keep old endpoint working as fallback
- Gradual migration of calls
- Comprehensive testing before deployment
- Can roll back if issues found

## Deployment Strategy

### Pre-Deployment Checklist

- [ ] All code reviewed
- [ ] All tests passing
- [ ] Performance tested
- [ ] Error scenarios tested
- [ ] Database migration tested
- [ ] Rollback plan documented

### Deployment Steps

1. **Database Migration**
   - Run migration to add columns
   - Verify migration successful

2. **Cloud API Deployment**
   - Deploy new endpoint
   - Verify endpoint accessible
   - Test with sample snapshot

3. **Electron Update**
   - Update GoAgentClient
   - Update YourProjectsPage
   - Build and test

4. **Go Service Update** (if changes needed)
   - Update retry logic
   - Rebuild and test

5. **Monitoring**
   - Watch error logs
   - Monitor storage usage
   - Verify project creation works

### Rollback Plan

If issues found:
1. Disable snapshot endpoint (remove route)
2. Revert Electron to old flow (direct cloud API)
3. Projects still work without snapshots
4. Can re-enable after fixes

## Testing Checklist

### Unit Tests

**Cloud API:**
- [ ] Valid snapshot upload → 200 OK
- [ ] Invalid JSON → 400 Bad Request
- [ ] Missing auth → 401 Unauthorized
- [ ] Not project owner → 403 Forbidden
- [ ] Storage failure → 500 with error message
- [ ] Large snapshot → handles correctly
- [ ] Special characters in filename → encoded correctly

**Electron UI:**
- [ ] createProjectWithSnapshot called correctly
- [ ] Polling starts immediately
- [ ] Status updates displayed
- [ ] File tree rendered when snapshot ready
- [ ] Error dialog on failure
- [ ] Dialog closes on success

### Integration Tests

- [ ] Create project → Syncthing creates folder → Snapshot generated → Stored
- [ ] Verify snapshot file in Supabase Storage bucket
- [ ] Verify database metadata correct
- [ ] Verify public URL accessible
- [ ] File tree renders correctly
- [ ] Concurrent creations don't conflict

### Edge Cases

- [ ] Very large files (100GB+)
- [ ] Deep directory nesting (1000+ levels)
- [ ] Special characters in filenames/paths
- [ ] File permission errors
- [ ] Network timeout mid-upload
- [ ] Storage quota exceeded
- [ ] Simultaneous project creations

## Phase 2d vs Phase 2c

### Phase 2c Delivered
- ✅ Async event ordering
- ✅ Syncthing folder creation
- ✅ File browsing capability
- ✅ Snapshot JSON generation
- ✅ Go service orchestration
- ✅ Background processing

### Phase 2d Will Deliver
- ⏳ Cloud API endpoint for snapshots
- ⏳ Supabase Storage integration
- ⏳ Electron UI using Go service
- ⏳ Progress polling mechanism
- ⏳ Retry logic for resilience
- ⏳ Complete end-to-end working flow

### After Phase 2d
- ✅ Users can create projects via UI
- ✅ Snapshots auto-generated
- ✅ File tree displayed in UI
- ✅ Full system working end-to-end

## Timeline

| Task | Time | Start | End |
|------|------|-------|-----|
| Cloud API | 2h | Day 1 | Day 1 +2h |
| Database | 0.5h | Day 1 | Day 1 +2.5h |
| Electron UI | 2h | Day 1 | Day 1 +4.5h |
| Retry Logic | 1h | Day 1 | Day 1 +5.5h |
| Testing | 2-3h | Day 2 | Day 2 +2-3h |
| **Total** | **7-10h** | | |

## Next Steps

### To Start Phase 2d:

1. **Review Planning Documents**
   - Read PHASE2D_IMPLEMENTATION_PLAN.md (overview)
   - Read PHASE2D_TASK_BREAKDOWN.md (detailed code)

2. **Start with Cloud API**
   - Create `/projects/:projectId/snapshot` endpoint
   - Implement gzip compression
   - Test with curl

3. **Then Database**
   - Write migration
   - Test migration on test database

4. **Then Electron UI**
   - Update goAgentClient
   - Update YourProjectsPage
   - Test complete flow

5. **Finally Polish**
   - Add retry logic
   - Comprehensive testing
   - Error handling

## Questions & Decisions

### Q1: Should snapshot URL be public?
**Decision:** Yes, public
- Snapshots don't contain sensitive data
- Easier to implement
- Can be made private later if needed

### Q2: Should we wait for snapshot before returning to user?
**Decision:** No, return immediately
- Non-blocking is better for UX
- Project works without snapshot
- UI can show "snapshot pending" state
- Complete with polling

### Q3: What if snapshot upload fails?
**Decision:** Log warning, don't fail
- Project is already created
- Files are already syncing
- Snapshot is optional feature
- Can retry manually later

### Q4: How long to poll for snapshot?
**Decision:** 5 minutes max
- Generous timeout (most complete in <1 min)
- User can manually refresh
- Prevents infinite polling
- Project works without snapshot

---

## Documentation Files

Created during Phase 2d Planning:

1. **PHASE2D_IMPLEMENTATION_PLAN.md** (350+ lines)
   - Overview of Phase 2d objectives
   - Task definitions
   - Architecture updates
   - Success criteria

2. **PHASE2D_TASK_BREAKDOWN.md** (400+ lines)
   - Detailed implementation for each task
   - Code examples and templates
   - Database migration scripts
   - Testing checklist

3. **PHASE2D_OVERVIEW.md** (this file)
   - High-level status
   - Roadmap and timeline
   - Risk mitigation
   - Deployment strategy

---

## Related Documents

- `PHASE2C_COMPLETE.md` - Phase 2c completion summary
- `PHASE2C_CODE_REFERENCE.md` - Detailed Phase 2c code
- `PHASE2C_ARCHITECTURE_DIAGRAMS.md` - Flow diagrams
- `PHASE2B_COMPLETE.md` - Phase 2b summary
- `API_ENDPOINT_ANALYSIS.md` - Original endpoint audit

