-- ============================================================================
-- EMERGENCY FIX: Drop recursive views causing infinite recursion error
-- Run this IMMEDIATELY before other migrations
-- ============================================================================
-- 
-- ISSUE:
-- When querying any table in public schema, Supabase returns:
-- "infinite recursion detected"
-- 
-- CAUSE:
-- Views created in 20251117_create_views.sql that join with auth.users
-- These views are causing recursion in PostgREST queries
-- 
-- SOLUTION:
-- Drop all problematic views immediately
-- 
-- ============================================================================

BEGIN;

-- Drop the recursive views that cause infinite recursion
DROP VIEW IF EXISTS public.user_profiles CASCADE;
DROP VIEW IF EXISTS public.owned_projects_full CASCADE;
DROP VIEW IF EXISTS public.project_invites_with_creator CASCADE;
DROP VIEW IF EXISTS public.project_members_with_user CASCADE;
DROP VIEW IF EXISTS public.projects_with_owner CASCADE;

-- These views are safe and don't cause recursion - keep only this one
-- (invited_projects_full is cleaned up in migration 012 anyway)
DROP VIEW IF EXISTS public.invited_projects_full CASCADE;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- Run these after the migration to verify the fix worked
-- ============================================================================

-- Check that views are dropped
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_type = 'VIEW';

-- Should return 0 rows (no views)

-- Test that queries work now
-- SELECT COUNT(*) FROM public.projects;
-- SELECT COUNT(*) FROM public.devices;
-- SELECT COUNT(*) FROM public.project_members;
