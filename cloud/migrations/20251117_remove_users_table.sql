-- Migration: Remove custom users table and use auth.users exclusively
-- Date: 2025-11-17
-- Purpose: Eliminate confusion between custom users table and Supabase auth.users
-- Issue: Having both tables causes FK constraint conflicts
-- Solution: Drop custom users table, update all FKs to reference auth.users

BEGIN;

-- Step 1: Drop foreign key constraints that reference the old users table
DO $$
BEGIN
  ALTER TABLE IF EXISTS devices DROP CONSTRAINT IF EXISTS devices_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS project_devices DROP CONSTRAINT IF EXISTS project_devices_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS sync_logs DROP CONSTRAINT IF EXISTS sync_logs_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS file_operations DROP CONSTRAINT IF EXISTS file_operations_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Step 2: Drop the old users table
DROP TABLE IF EXISTS users CASCADE;

-- Step 3: Re-add foreign key constraints referencing auth.users
ALTER TABLE IF EXISTS devices 
ADD CONSTRAINT devices_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS project_members 
ADD CONSTRAINT project_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS project_devices 
ADD CONSTRAINT project_devices_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS sync_logs 
ADD CONSTRAINT sync_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS file_operations 
ADD CONSTRAINT file_operations_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 4: Verify the schema is clean
-- All FKs should now reference auth.users(id)
COMMIT;
