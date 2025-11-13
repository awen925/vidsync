-- Migration: Remove custom users table foreign key constraints
-- Reason: We use Supabase auth.users directly, not a custom users table
-- Date: 2025-11-12

BEGIN;

-- Drop FK constraint from project_members.user_id
ALTER TABLE IF EXISTS project_members
DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;

-- Drop FK constraint from project_members.invited_by
ALTER TABLE IF EXISTS project_members
DROP CONSTRAINT IF EXISTS project_members_invited_by_fkey;

-- Drop FK constraint from projects.owner_id
ALTER TABLE IF EXISTS projects
DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;

COMMIT;
