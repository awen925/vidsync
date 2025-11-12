-- Migration: Fix devices table to work with Supabase Auth
-- This removes the foreign key constraint to the old users table
-- and allows devices to reference auth.users directly via UUID

-- Drop the old constraint if it exists
ALTER TABLE IF EXISTS devices 
  DROP CONSTRAINT IF EXISTS devices_user_id_fkey;

-- The table should still work with just the user_id UUID field
-- It will be validated at the application level
