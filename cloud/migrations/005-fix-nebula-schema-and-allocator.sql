-- Migration: Fix Nebula schema FK issues and implement safe allocator functions
-- Date: 2025-11-13
-- Purpose: Remove problematic FK constraints from 004, ensure columns exist on devices table,
--          and provide robust allocator functions that work across different schema variants

BEGIN;

-- Step 1: Fix FK constraint on nebula_ip_pool.allocated_to_device_id if it exists
-- (Previous migration 004 created it but it may fail if user_devices doesn't exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'nebula_ip_pool' AND column_name = 'allocated_to_device_id'
  ) THEN
    ALTER TABLE nebula_ip_pool DROP CONSTRAINT IF EXISTS nebula_ip_pool_allocated_to_device_id_fkey;
    RAISE NOTICE 'Dropped problematic FK constraint on nebula_ip_pool.allocated_to_device_id';
  END IF;
END$$;

-- Step 2: Fix FK constraint on nebula_ip_allocations.device_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'nebula_ip_allocations' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE nebula_ip_allocations DROP CONSTRAINT IF EXISTS nebula_ip_allocations_device_id_fkey;
    RAISE NOTICE 'Dropped problematic FK constraint on nebula_ip_allocations.device_id';
  END IF;
END$$;

-- Step 3: Ensure nebula columns exist on the devices table
-- Detect whether table is called user_devices or devices and add columns
DO $$
DECLARE
  _tbl text := NULL;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_devices'
  ) THEN
    _tbl := 'user_devices';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'devices'
  ) THEN
    _tbl := 'devices';
  END IF;

  IF _tbl IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS nebula_ip inet', _tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_lighthouse boolean DEFAULT false', _tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS nebula_last_seen timestamptz', _tbl);
    RAISE NOTICE 'Added nebula columns to table %s', _tbl;
  ELSE
    RAISE NOTICE 'No devices table (user_devices or devices) found; device columns unchanged';
  END IF;
END$$;

-- Step 4: Drop old allocator functions if they exist (from 004) and recreate safer versions
DROP FUNCTION IF EXISTS allocate_nebula_ip(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS release_nebula_ip_by_device(uuid) CASCADE;

-- Allocator function: Safe, uses dynamic SQL to detect device table
CREATE OR REPLACE FUNCTION allocate_nebula_ip(p_project_id uuid, p_device_id uuid, p_allocated_by uuid)
RETURNS inet AS $$
DECLARE
  r RECORD;
  _dev_tbl text := NULL;
  _sql text;
BEGIN
  -- Transaction-level atomicity: lock one unallocated IP for this project
  SELECT id, ip
  INTO r
  FROM nebula_ip_pool
  WHERE project_id = p_project_id
    AND allocated_to_device_id IS NULL
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nebula_ip_pool_exhausted: No free IPs available for project %', p_project_id;
  END IF;

  -- Mark it allocated
  UPDATE nebula_ip_pool
  SET allocated_to_device_id = p_device_id,
      allocated_at = now()
  WHERE id = r.id;

  -- Persist allocation history
  INSERT INTO nebula_ip_allocations(ip, project_id, device_id, allocated_by, allocated_at)
  VALUES (r.ip, p_project_id, p_device_id, p_allocated_by, now());

  -- Update device record if devices table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_devices') THEN
    _dev_tbl := 'user_devices';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') THEN
    _dev_tbl := 'devices';
  END IF;

  IF _dev_tbl IS NOT NULL THEN
    _sql := format('UPDATE %I SET nebula_ip = $1, nebula_last_seen = now() WHERE id = $2', _dev_tbl);
    EXECUTE _sql USING r.ip, p_device_id;
  END IF;

  RETURN r.ip;
END;
$$ LANGUAGE plpgsql;

-- Release function: Safe, uses dynamic SQL
CREATE OR REPLACE FUNCTION release_nebula_ip_by_device(p_device_id uuid)
RETURNS void AS $$
DECLARE
  r RECORD;
  _dev_tbl text := NULL;
  _sql text;
BEGIN
  -- Get the allocated IP for this device (with lock)
  SELECT id, ip, project_id
  INTO r
  FROM nebula_ip_pool
  WHERE allocated_to_device_id = p_device_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE NOTICE 'Device % has no allocated Nebula IP', p_device_id;
    RETURN;
  END IF;

  -- Mark pool row free
  UPDATE nebula_ip_pool
  SET allocated_to_device_id = NULL,
      allocated_at = NULL
  WHERE id = r.id;

  -- Update allocations history
  UPDATE nebula_ip_allocations
  SET released_at = now()
  WHERE ip = r.ip AND device_id = p_device_id AND released_at IS NULL;

  -- Clear device field if devices table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_devices') THEN
    _dev_tbl := 'user_devices';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'devices') THEN
    _dev_tbl := 'devices';
  END IF;

  IF _dev_tbl IS NOT NULL THEN
    _sql := format('UPDATE %I SET nebula_ip = NULL, nebula_last_seen = now() WHERE id = $1', _dev_tbl);
    EXECUTE _sql USING p_device_id;
  END IF;

  RAISE NOTICE 'Released Nebula IP %s from device %s', r.ip, p_device_id;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Grant execute permissions on functions (for cloud service account)
GRANT EXECUTE ON FUNCTION allocate_nebula_ip(uuid, uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION release_nebula_ip_by_device(uuid) TO PUBLIC;

COMMIT;
