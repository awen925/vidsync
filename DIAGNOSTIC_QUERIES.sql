-- ============================================================================
-- DIAGNOSTIC: Check current database schema
-- Run this in Supabase SQL Editor to diagnose the infinite recursion issue
-- ============================================================================

-- Step 1: List all views
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'VIEW'
ORDER BY table_name;

-- Step 2: List all base tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Step 3: Check if projects table has snapshot fields
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects'
ORDER BY ordinal_position;

-- Step 4: Check for RLS policies that might cause recursion
SELECT * FROM pg_policies;

-- Step 5: Try a simple count on projects table directly (no views)
SELECT COUNT(*) as total_projects FROM public.projects;

-- Step 6: Check if invited_projects_full view is causing the issue
-- Comment this out if it times out
-- SELECT COUNT(*) FROM public.invited_projects_full;
