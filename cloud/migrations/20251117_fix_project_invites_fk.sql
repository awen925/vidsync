-- Migration: Fix project_invites foreign key constraint
-- Date: 2025-11-17
-- Purpose: Make created_by nullable and fix foreign key constraint
-- Issue: Foreign key constraint "project_invites_created_by_fkey" violates on insert
-- Root cause: created_by is NOT NULL but references users table that may not have the auth user yet
-- Solution: Make created_by nullable with SET NULL on delete

BEGIN;

-- Step 1: Drop the existing foreign key constraint (handles both old and new constraint names)
DO $$
BEGIN
  ALTER TABLE IF EXISTS project_invites DROP CONSTRAINT IF EXISTS project_invites_created_by_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if constraint doesn't exist
END $$;

-- Step 2: Make created_by nullable (allows NULL values)
-- This prevents NOT NULL constraint violations
ALTER TABLE IF EXISTS project_invites 
ALTER COLUMN created_by DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint with SET NULL on delete
-- This ensures that if a user is deleted, the created_by field is set to NULL
-- instead of cascading the delete to the invite record
ALTER TABLE IF EXISTS project_invites 
ADD CONSTRAINT project_invites_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Verify the column is nullable
COMMIT;
