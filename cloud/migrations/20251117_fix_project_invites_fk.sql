-- Migration: Fix project_invites foreign key constraint
-- Date: 2025-11-17
-- Purpose: Make created_by nullable and fix foreign key constraint
-- This migration updates the project_invites table to allow NULL values for created_by
-- and changes the constraint behavior from CASCADE to SET NULL on delete

BEGIN;

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE IF EXISTS project_invites 
DROP CONSTRAINT IF EXISTS project_invites_created_by_fkey;

-- Step 2: Make created_by nullable (allows NULL values)
ALTER TABLE IF EXISTS project_invites 
ALTER COLUMN created_by DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint with SET NULL on delete
-- This ensures that if a user is deleted, the created_by field is set to NULL
-- instead of cascading the delete to the invite record
ALTER TABLE IF EXISTS project_invites 
ADD CONSTRAINT project_invites_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Verify the changes
-- SELECT constraint_name, constraint_type, is_deferrable 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'project_invites' AND constraint_type = 'FOREIGN KEY';

COMMIT;
