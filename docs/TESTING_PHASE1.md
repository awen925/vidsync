# Phase 1 Testing Guide

## 🧪 Overview

This document covers testing Phase 1 functionality with real data and Syncthing integration.

---

## 📊 Test Scenarios

### Scenario 1: Basic Pagination (No Syncthing)

**Goal:** Verify file listing works with large datasets

#### Setup
```bash
# 1. Execute migration (see IMPLEMENTATION_PHASE1_STEPS.md)
# 2. Populate test data
```

#### SQL: Insert test files
```sql
-- Insert 10,543 test files into project_file_snapshots
INSERT INTO project_file_snapshots (project_id, file_path, is_directory, file_hash, size, modified_at)
SELECT
  'test-project-id' as project_id,
  'documents/file_' || generate_series(1, 10543) || '.pdf' as file_path,
  false as is_directory,
  encode(sha256((random()::text)::bytea), 'hex') as file_hash,
  (random() * 100 * 1024 * 1024)::bigint as size,  -- 0-100 MB each
  now() - interval '1 day' * random() as modified_at
ON CONFLICT DO NOTHING;

-- Update sync state
INSERT INTO project_sync_state (project_id, snapshot_version, total_files, total_size, root_hash)
VALUES ('test-project-id', 1, 10543, 500000000000, 'root-hash')
ON CONFLICT (project_id) DO UPDATE SET
  total_files = 10543,
  total_size = 500000000000;
```

#### Test 1a: First page
```bash
curl -X GET "http://localhost:3000/projects/test-project-id/files?limit=500&offset=0" \
  -H "Authorization: Bearer YOUR_JWT" \
  | jq '.pagination'
```

**Expected:**
```json
{
  "total": 10543,
  "limit": 500,
  "offset": 0,
  "hasMore": true
}
```

**Verify:**
- ✅ Returns exactly 500 files
- ✅ `hasMore` is `true` (since 10543 > 500)
- ✅ Response time < 500ms

#### Test 1b: Middle page
```bash
curl -X GET "http://localhost:3000/projects/test-project-id/files?limit=500&offset=5000" \
  -H "Authorization: Bearer YOUR_JWT" \
  | jq '.pagination'
```

**Expected:**
```json
{
  "total": 10543,
  "limit": 500,
  "offset": 5000,
  "hasMore": true
}
```

**Verify:**
- ✅ Returns files 5000-5499
- ✅ `hasMore` is `true` (since 5500 < 10543)
- ✅ Response time < 500ms

#### Test 1c: Last page
```bash
curl -X GET "http://localhost:3000/projects/test-project-id/files?limit=500&offset=10000" \
  -H "Authorization: Bearer YOUR_JWT" \
  | jq '.pagination'
```

**Expected:**
```json
{
  "total": 10543,
  "limit": 500,
  "offset": 10000,
  "hasMore": false
}
```

**Verify:**
- ✅ Returns files 10000-10542 (only 543 files)
- ✅ `hasMore` is `false` (since 10500 >= 10543)
- ✅ Response time < 500ms

#### Test 1d: Empty page (past end)
```bash
curl -X GET "http://localhost:3000/projects/test-project-id/files?limit=500&offset=11000" \
  -H "Authorization: Bearer YOUR_JWT" \
  | jq '.pagination'
```

**Expected:**
```json
{
  "total": 10543,
  "limit": 500,
  "offset": 11000,
  "hasMore": false
}
```

**Verify:**
- ✅ Returns empty array
- ✅ `hasMore` is `false`
- ✅ Response time < 500ms

---

### Scenario 2: Access Control

**Goal:** Verify only members can see files

#### Setup
```sql
-- Create test project
INSERT INTO projects (id, name, owner_id, created_at, updated_at)
VALUES ('access-test-id', 'Access Test', 'owner-user-id', now(), now());

-- Add owner to members
INSERT INTO project_members (project_id, user_id, status, created_at)
VALUES ('access-test-id', 'owner-user-id', 'accepted', now());

-- Add invited member
INSERT INTO project_members (project_id, user_id, status, created_at)
VALUES ('access-test-id', 'invited-user-id', 'invited', now());

-- Add random user (not a member)
INSERT INTO project_members (project_id, user_id, status, created_at)
VALUES ('access-test-id', 'random-user-id', 'rejected', now());
```

#### Test 2a: Owner can access
```bash
curl -X GET "http://localhost:3000/projects/access-test-id/files" \
  -H "Authorization: Bearer OWNER_JWT"
```

**Expected:** 200 OK (files list)

#### Test 2b: Invited member can access
```bash
curl -X GET "http://localhost:3000/projects/access-test-id/files" \
  -H "Authorization: Bearer INVITED_JWT"
```

**Expected:** 200 OK (files list)

#### Test 2c: Non-member cannot access
```bash
curl -X GET "http://localhost:3000/projects/access-test-id/files" \
  -H "Authorization: Bearer RANDOM_JWT"
```

**Expected:** 403 Forbidden

**Verify:**
- ✅ Owner can access
- ✅ Invited member can access
- ✅ Non-member gets 403
- ✅ Wrong JWT gets 401

---

### Scenario 3: Snapshot Metadata

**Goal:** Verify snapshot version tracking works

#### Test 3a: Get current snapshot
```bash
curl -X GET "http://localhost:3000/projects/test-project-id/snapshot-metadata" \
  -H "Authorization: Bearer YOUR_JWT" \
  | jq '.'
```

**Expected:**
```json
{
  "snapshot_version": 1,
  "last_snapshot_at": "2024-11-17T11:05:30Z",
  "total_files": 10543,
  "total_size": 500000000000,
  "root_hash": "abc123..."
}
```

**Verify:**
- ✅ `snapshot_version` is integer
- ✅ `total_files` matches actual count (10543)
- ✅ `total_size` sum is reasonable
- ✅ `root_hash` is 64 characters (SHA-256 hex)

---

### Scenario 4: Refresh Snapshot (Owner Only)

**Goal:** Verify only owner can refresh

#### Test 4a: Owner refreshes
```bash
curl -X PUT "http://localhost:3000/projects/access-test-id/refresh-snapshot" \
  -H "Authorization: Bearer OWNER_JWT"
```

**Expected:** 200 OK with `{ "success": true }`

#### Test 4b: Member tries to refresh
```bash
curl -X PUT "http://localhost:3000/projects/access-test-id/refresh-snapshot" \
  -H "Authorization: Bearer INVITED_JWT"
```

**Expected:** 403 Forbidden

**Verify:**
- ✅ Only owner can refresh
- ✅ Member gets 403
- ✅ Non-member gets 403

---

### Scenario 5: Syncthing Integration

**Goal:** Verify sync can be triggered

#### Setup
```bash
# Make sure Syncthing is running
curl http://localhost:8384/rest/system/status \
  -H "X-API-Key: YOUR_API_KEY"
```

**Expected:** 200 OK with system status

#### Test 5a: Get Syncthing device ID
```bash
DEVICE_ID=$(curl http://localhost:8384/rest/system/status \
  -H "X-API-Key: YOUR_API_KEY" | jq -r '.myID')

echo "Device ID: $DEVICE_ID"
```

#### Test 5b: Trigger sync start
```bash
curl -X POST "http://localhost:3000/projects/test-project-id/sync-start" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\": \"$DEVICE_ID\"}"
```

**Expected:** 200 OK with success message

**Verify:**
- ✅ Returns success
- ✅ Check Syncthing UI - folder should appear
- ✅ Files start syncing

---

### Scenario 6: Database Performance

**Goal:** Verify queries are fast enough

#### Test 6a: Measure pagination query
```bash
# Run 100 times and measure
for i in {1..100}; do
  time curl -X GET "http://localhost:3000/projects/test-project-id/files?limit=500&offset=$((RANDOM % 10000))" \
    -H "Authorization: Bearer YOUR_JWT" > /dev/null
done
```

**Expected:**
- ✅ Average response time < 500ms
- ✅ Max response time < 1000ms
- ✅ No timeout errors

#### Test 6b: Check database load
```sql
-- While test is running, check in another terminal:
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
WHERE query LIKE '%project_file_snapshots%'
ORDER BY calls DESC;
```

**Expected:**
- ✅ CPU < 10% during pagination
- ✅ No connection pool exhaustion
- ✅ Disk I/O minimal (queries should be cache-hit)

---

### Scenario 7: Sorting

**Goal:** Verify file list can be sorted

#### Test 7a: Sort by name (default)
```bash
curl -X GET "http://localhost:3000/projects/test-project-id/files?sort=name" \
  -H "Authorization: Bearer YOUR_JWT" \
  | jq '.files | map(.file_path) | first'
```

**Expected:** Returns files in alphabetical order

#### Test 7b: Sort by size (if implemented)
```bash
curl -X GET "http://localhost:3000/projects/test-project-id/files?sort=size" \
  -H "Authorization: Bearer YOUR_JWT" \
  | jq '.files | map(.size) | first'
```

**Expected:** Returns files sorted by size

---

### Scenario 8: UI Component

**Goal:** Verify React component renders correctly

#### Test 8a: Manual UI test

1. Open app
2. Go to "Your Projects"
3. Click on a test project
4. Verify:
   - ✅ File list table loads
   - ✅ Shows first 500 files
   - ✅ Pagination controls visible
   - ✅ "Sync This Project" button visible
   - ✅ No TypeScript errors in console

#### Test 8b: Test pagination in UI

1. Scroll to bottom
2. Click "Next Page"
3. Verify:
   - ✅ New files load
   - ✅ Page counter updates
   - ✅ No jumpy UI
   - ✅ Loading state shows briefly

---

## 📋 Automated Test Suite

Create `cloud/tests/phase1.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../src/app';
import { supabase } from '../src/supabaseClient';

describe('Phase 1: Pagination & Snapshots', () => {
  const testProjectId = 'phase1-test-project';
  const ownerUserId = 'owner-user-id';
  const memberUserId = 'member-user-id';
  let ownerToken: string;
  let memberToken: string;

  beforeAll(async () => {
    // Setup test data
    await supabase.from('projects').insert({
      id: testProjectId,
      name: 'Phase 1 Test',
      owner_id: ownerUserId,
    });

    await supabase.from('project_members').insert([
      { project_id: testProjectId, user_id: ownerUserId, status: 'accepted' },
      { project_id: testProjectId, user_id: memberUserId, status: 'accepted' },
    ]);

    // Generate 10,543 test files
    const files = Array.from({ length: 10543 }, (_, i) => ({
      project_id: testProjectId,
      file_path: `documents/file_${i + 1}.pdf`,
      is_directory: false,
      file_hash: 'abc123',
      size: 1024 * 1024,
      modified_at: new Date().toISOString(),
    }));

    await supabase.from('project_file_snapshots').insert(files);

    // Get JWT tokens
    ownerToken = 'mock-owner-token';
    memberToken = 'mock-member-token';
  });

  afterAll(async () => {
    // Cleanup
    await supabase.from('project_file_snapshots').delete().eq('project_id', testProjectId);
    await supabase.from('project_members').delete().eq('project_id', testProjectId);
    await supabase.from('projects').delete().eq('id', testProjectId);
  });

  describe('GET /projects/:projectId/files', () => {
    it('returns first 500 files', async () => {
      const res = await request(app)
        .get(`/projects/${testProjectId}/files?limit=500&offset=0`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.files).toHaveLength(500);
      expect(res.body.pagination.total).toBe(10543);
      expect(res.body.pagination.hasMore).toBe(true);
    });

    it('returns middle page', async () => {
      const res = await request(app)
        .get(`/projects/${testProjectId}/files?limit=500&offset=5000`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.files).toHaveLength(500);
      expect(res.body.pagination.hasMore).toBe(true);
    });

    it('returns last page', async () => {
      const res = await request(app)
        .get(`/projects/${testProjectId}/files?limit=500&offset=10000`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.files.length).toBeLessThan(500);
      expect(res.body.pagination.hasMore).toBe(false);
    });

    it('denies non-members', async () => {
      const res = await request(app)
        .get(`/projects/${testProjectId}/files`)
        .set('Authorization', `Bearer invalid-token`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /projects/:projectId/snapshot-metadata', () => {
    it('returns snapshot metadata', async () => {
      const res = await request(app)
        .get(`/projects/${testProjectId}/snapshot-metadata`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('snapshot_version');
      expect(res.body).toHaveProperty('total_files');
      expect(res.body).toHaveProperty('total_size');
    });
  });

  describe('PUT /projects/:projectId/refresh-snapshot', () => {
    it('allows owner to refresh', async () => {
      const res = await request(app)
        .put(`/projects/${testProjectId}/refresh-snapshot`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('denies non-owner', async () => {
      const res = await request(app)
        .put(`/projects/${testProjectId}/refresh-snapshot`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
    });
  });
});
```

#### Run tests
```bash
cd cloud
npm test -- phase1.test.ts
```

---

## ✅ Pre-Production Checklist

Before going live, verify:

- [ ] All 4 endpoints implemented
- [ ] All scenarios pass (1-8)
- [ ] Automated tests pass
- [ ] Response time < 500ms for 10k files
- [ ] Database size reasonable
- [ ] React component renders without errors
- [ ] Syncthing integration works
- [ ] Access control working (owner/member/non-member)
- [ ] No TypeScript errors in codebase
- [ ] No console warnings or errors in app

---

## 🚀 Performance Benchmarks

Expected metrics after implementation:

| Metric | Target | Actual |
|--------|--------|--------|
| GET /files (500 rows) | < 500ms | TBD |
| GET /snapshot-metadata | < 200ms | TBD |
| DB size (10k files) | < 10 MB | TBD |
| CPU during pagination | < 5% | TBD |
| Memory usage | < 100 MB | TBD |

**Fill in "Actual" after testing.**

---

## 🐛 Debugging

### Issue: Pagination returns wrong count
```sql
-- Check actual row count
SELECT COUNT(*) FROM project_file_snapshots WHERE project_id = 'test-project-id';

-- Check snapshot metadata
SELECT * FROM project_sync_state WHERE project_id = 'test-project-id';
```

### Issue: Access denied on valid member
```sql
-- Verify member record
SELECT * FROM project_members 
WHERE project_id = 'test-project-id' AND user_id = 'member-user-id';

-- Status should be 'accepted' or 'invited'
```

### Issue: Slow response time
```sql
-- Check indexes
\d project_file_snapshots

-- Analyze query plan
EXPLAIN ANALYZE SELECT * FROM project_file_snapshots 
WHERE project_id = 'test-project-id' LIMIT 500;
```

---

## ✨ You're Done!

When all tests pass, Phase 1 is complete! 🎉

Next: Phase 2 (Selective sync), Phase 3 (Bandwidth limits), etc.
