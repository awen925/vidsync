-- ============================================================================
-- CORRECTED MIGRATION EXECUTION ORDER
-- IMPORTANT: There's an infinite recursion bug in the database
-- ============================================================================

/*

⚠️  URGENT FIX NEEDED:

The Supabase database currently has problematic views that cause infinite
recursion errors. We need to fix this BEFORE running the cleanup migrations.

ERROR MESSAGE:
  "infinite recursion detected" when querying any table

ROOT CAUSE:
  Views created in 20251117_create_views.sql that join auth.users with public schema
  These views are interfering with PostgREST queries

SOLUTION:
  Drop the problematic views immediately, then run the planned migrations

*/

-- ============================================================================
-- STEP 1: RUN THIS IMMEDIATELY (FIX THE INFINITE RECURSION)
-- ============================================================================

File: 010_FIX_EMERGENCY_DROP_recursive_views.sql

What it does:
  - Drops all problematic views that join auth.users
  - Clears the recursion issue
  - Takes < 1 second
  - No data loss (views are just queries)

Run in Supabase SQL Editor:
  1. Copy content from: cloud/migrations/010_FIX_EMERGENCY_DROP_recursive_views.sql
  2. Paste into: Supabase SQL Editor
  3. Click: Run
  4. Verify: No errors

After this step:
  - ✅ Queries will work again
  - ✅ No timeout errors
  - ✅ Backend API will respond


-- ============================================================================
-- STEP 2: RUN CLEANUP MIGRATIONS (in order)
-- ============================================================================

Now run the planned migrations in this order:

1. 011_create_snapshots_bucket.sql
   - Creates storage bucket for file snapshots
   - Time: < 1 second

2. 012_cleanup_unused_tables.sql
   - Removes 13 unused tables
   - Removes remaining problematic views
   - Time: < 1 minute

3. 013_add_snapshot_fields_to_projects.sql
   - Adds snapshot_url and snapshot_updated_at fields
   - Creates index for performance
   - Time: < 1 minute


-- ============================================================================
-- EXECUTION SEQUENCE
-- ============================================================================

┌─────────────────────────────────────────────────────────────────┐
│ PRIORITY 1: Fix Infinite Recursion (MUST DO FIRST!)            │
├─────────────────────────────────────────────────────────────────┤
│ ✓ 010_FIX_EMERGENCY_DROP_recursive_views.sql                   │
│   (Run immediately to fix "infinite recursion" error)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PRIORITY 2: Create Storage Bucket                               │
├─────────────────────────────────────────────────────────────────┤
│ ✓ 011_create_snapshots_bucket.sql                               │
│   (Create bucket for file snapshots)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PRIORITY 3: Cleanup Database Schema                             │
├─────────────────────────────────────────────────────────────────┤
│ ✓ 012_cleanup_unused_tables.sql                                 │
│   (Remove 13 unused tables + remaining views)                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PRIORITY 4: Add New Fields                                      │
├─────────────────────────────────────────────────────────────────┤
│ ✓ 013_add_snapshot_fields_to_projects.sql                       │
│   (Add snapshot storage fields)                                 │
└─────────────────────────────────────────────────────────────────┘


-- ============================================================================
-- QUICK VERIFICATION (after each step)
-- ============================================================================

After Step 1 (Emergency fix):
  SELECT COUNT(*) FROM public.projects;
  → Should return a number (not timeout)

After Step 2 (Cleanup):
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  → Should return 10

After Step 3 (Add fields):
  SELECT snapshot_url, snapshot_updated_at FROM public.projects LIMIT 1;
  → Should show new columns (can be NULL)


-- ============================================================================
-- TIMELINE
-- ============================================================================

Phase 1 (Fix recursion):      1-2 seconds
Phase 2 (Create bucket):      < 1 second  
Phase 3 (Cleanup tables):     < 1 minute
Phase 4 (Add fields):         < 1 minute
─────────────────────────────────────────
TOTAL:                        ~3-4 minutes


-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

If something goes wrong after migration 010:
  1. Don't run migration 011, 012, or 013
  2. Restore database from backup
  3. Skip migration 010 next time
  4. Investigate the recursive view issue further

If something goes wrong after migration 011, 012, or 013:
  1. Restore database from backup
  2. Run only migration 010
  3. Then retry 011, 012, 013 carefully


-- ============================================================================
-- CURRENT ISSUE DETAILS
-- ============================================================================

When the frontend tries to fetch /api/projects/list/owned:

1. Frontend sends: GET /api/projects/list/owned
2. Backend tries: SELECT * FROM public.projects WHERE owner_id = ?
3. Supabase runs the query through PostgREST
4. PostgREST tries to apply RLS policies
5. RLS policies trigger the views to evaluate
6. Views have circular joins with auth.users
7. Result: "infinite recursion detected"
8. Frontend times out waiting for response (after 10 seconds)

Solution:
  Drop views → no RLS triggers → queries complete quickly


-- ============================================================================
-- AFTER MIGRATION
-- ============================================================================

Once all migrations complete:

✅ Infinite recursion fixed
✅ Database optimized (57% fewer tables)
✅ Backend can fetch projects quickly
✅ Frontend no longer times out
✅ API endpoints working normally
✅ Ready for production

*/
