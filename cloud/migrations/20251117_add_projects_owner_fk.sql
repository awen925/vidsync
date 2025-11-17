-- Migration: Add foreign key constraint to projects.owner_id
-- Date: 2025-11-17
-- Purpose: Link projects to auth.users table for proper relationship queries
-- Issue: Supabase PostgREST can't find relationship between 'projects' and 'owner_id' without FK
-- Solution: Add foreign key constraint from projects.owner_id to auth.users(id)

BEGIN;

-- Step 1: Drop existing constraint if it exists (in case of previous migration attempts)
DO $$
BEGIN
  ALTER TABLE IF EXISTS projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if constraint doesn't exist
END $$;

-- Step 2: Add foreign key constraint linking owner_id to auth.users
-- ON DELETE CASCADE ensures that if a user is deleted, their projects are also deleted
ALTER TABLE IF EXISTS projects 
ADD CONSTRAINT projects_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;
