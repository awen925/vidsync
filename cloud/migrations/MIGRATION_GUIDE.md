-- ============================================================================
-- MIGRATION EXECUTION GUIDE
-- Database Cleanup - 3 Step Process
-- Date: November 18, 2025
-- ============================================================================

/*

OVERVIEW:
This guide shows how to safely clean up the Supabase database by:
1. Removing unused tables (not referenced in backend code)
2. Consolidating duplicate tables (multiple sync state tables)
3. Adding new fields for snapshot storage

TOTAL IMPACT:
- Tables removed: 13
- Tables kept: 10 (production-ready)
- Views removed: 5
- Views kept: 1
- New storage bucket: project-snapshots

RISK LEVEL: LOW
- Only removes unused tables
- No data loss (unused tables are empty)
- Can be rolled back if needed
- Run in development first!

EXECUTION TIME: < 1 minute (if no data)

*/

-- ============================================================================
-- STEP 0: BACKUP (REQUIRED)
-- ============================================================================

-- Before running migrations:
-- 1. Export Supabase database: Supabase Dashboard → Settings → Database → Backups
-- 2. Or: pg_dump postgresql://user:password@host:5432/database > backup.sql
-- 3. Store backup in safe location

-- WARNING: This guide assumes you have a backup!


-- ============================================================================
-- STEP 1: EXECUTE CLEANUP MIGRATION
-- File: 012_cleanup_unused_tables.sql
-- ============================================================================

/*
Drops 13 unused tables and 5 unused views:

TABLES REMOVED:
✓ remote_files
✓ file_transfers
✓ transfer_events
✓ file_synced_devices
✓ optimized_file_index
✓ file_sync_checkpoints
✓ nebula_ip_allocations
✓ nebula_ip_pool
✓ pairing_invites
✓ conflicts
✓ project_file_snapshots
✓ project_sync_state
✓ project_sync_checkpoints

VIEWS REMOVED:
✓ project_invites_with_creator
✓ projects_with_owner
✓ project_members_with_user
✓ owned_projects_full
✓ user_profiles

KEEP:
✓ invited_projects_full (used in GET /projects/list/invited)
✓ All 10 core tables (used in backend)
*/

-- Run in Supabase SQL Editor:
-- Copy content of: migrations/012_cleanup_unused_tables.sql
-- Click "Run"


-- ============================================================================
-- STEP 2: EXECUTE SNAPSHOT FIELDS MIGRATION
-- File: 013_add_snapshot_fields_to_projects.sql
-- ============================================================================

/*
Adds columns to projects table:
- snapshot_url TEXT
- snapshot_updated_at TIMESTAMP WITH TIME ZONE

These fields store references to JSON snapshots in Supabase Storage.
Backend will populate these automatically.
*/

-- Run in Supabase SQL Editor:
-- Copy content of: migrations/013_add_snapshot_fields_to_projects.sql
-- Click "Run"


-- ============================================================================
-- STEP 3: CREATE STORAGE BUCKET (ONE-TIME)
-- ============================================================================

/*
Create storage bucket for file snapshots:

In Supabase Dashboard:
1. Navigate to: Storage → Buckets
2. Click: "New Bucket"
3. Name: "project-snapshots"
4. Make Public: YES (for RLS-protected URLs)
5. Click: "Create"

RLS Policy (already in migrations/011_create_snapshots_bucket.sql):
- Only authenticated users can view
- Only project members can access their project's snapshots
*/


-- ============================================================================
-- STEP 4: VERIFY CLEANUP
-- ============================================================================

-- Run these queries to verify tables were removed:

-- Check remaining tables:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Expected result (10 tables):
-- ✓ audit_logs
-- ✓ devices
-- ✓ magic_link_tokens
-- ✓ project_devices
-- ✓ project_invites
-- ✓ project_members
-- ✓ project_snapshots
-- ✓ projects
-- ✓ sync_events
-- ✓ user_settings

-- Check remaining views:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'VIEW'
ORDER BY table_name;

-- Expected result (1 view):
-- ✓ invited_projects_full


-- ============================================================================
-- STEP 5: VERIFY NEW FIELDS
-- ============================================================================

-- Check that snapshot fields were added:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects'
ORDER BY ordinal_position;

-- Expected new columns:
-- ✓ snapshot_url (text)
-- ✓ snapshot_updated_at (timestamp with time zone)


-- ============================================================================
-- STEP 6: UPDATE BACKEND CODE (IF NEEDED)
-- ============================================================================

/*
The backend code already handles these changes:

✓ POST /api/projects
  - Auto-creates Syncthing folder
  - Auto-generates initial snapshot
  - Stores snapshot_url + snapshot_updated_at

✓ POST /api/projects/join
  - Auto-adds device to Syncthing folder
  - Auto-generates snapshot
  - Updates snapshot_url + snapshot_updated_at

✓ GET /api/projects/:id/files-list
  - Loads snapshot from snapshot_url
  - Returns paginated files from JSON

✓ DELETE /api/projects/:id
  - Deletes Syncthing folder
  - Deletes snapshots from storage
  - Cleans up database records

No code changes needed!
*/


-- ============================================================================
-- STEP 7: MONITOR AFTER MIGRATION
-- ============================================================================

/*
After migration is complete:

1. Check application still works:
   ✓ Users can create projects
   ✓ Users can invite members
   ✓ Members can join with token
   ✓ Files sync correctly
   ✓ Snapshots are generated
   ✓ Projects can be deleted

2. Monitor logs for errors:
   - Check backend logs for any migration-related errors
   - Verify API endpoints return expected responses
   - Test with real Syncthing instance

3. Check database size:
   SELECT pg_size_pretty(pg_database_size('postgres'));
   - Should be noticeably smaller after cleanup

4. Check storage usage:
   - Supabase Dashboard → Storage → project-snapshots
   - Verify snapshots are being created and stored
*/


-- ============================================================================
-- ROLLBACK PROCEDURE (IF NEEDED)
-- ============================================================================

/*
If something goes wrong, rollback by:

1. Restore from backup:
   - Supabase Dashboard → Settings → Database → Backups
   - Click "Restore" on previous backup
   - Takes ~5-10 minutes

2. Or manually via SQL:
   - Restore backup file: psql database < backup.sql
   - Verify tables are restored: SELECT * FROM information_schema.tables

3. Debug and fix issues, then retry migration
*/


-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

/*
After migration, consult:

1. SCHEMA_REFERENCE.sql
   - Details of all remaining tables
   - Usage in backend code
   - Storage bucket info

2. Backend code:
   - cloud/src/api/projects/routes.ts (main endpoints)
   - cloud/src/services/fileMetadataService.ts (snapshot management)
   - cloud/src/services/syncthingService.ts (Syncthing integration)

3. Frontend code:
   - Uses existing endpoints (no changes needed)
   - Snapshots loaded automatically when fetching file lists

*/


-- ============================================================================
-- SUMMARY
-- ============================================================================

/*

BEFORE MIGRATION:
- 23 tables (many unused/duplicate)
- 5 views (some informational only)
- Database potentially bloated
- Confusing schema

AFTER MIGRATION:
- 10 core tables (production-ready)
- 1 essential view
- 1 storage bucket for snapshots
- Clean, focused schema
- Better performance

TIME TO EXECUTE: < 5 minutes
RISK: LOW (only removes unused)
ROLLBACK: YES (if needed)
RESULT: Production-ready database ✓

*/
