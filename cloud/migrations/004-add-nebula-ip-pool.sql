-- Migration: Add Nebula IP pool and allocations, add nebula columns to user_devices
-- Date: 2025-11-12

BEGIN;

-- Add nebula-related columns to user_devices
ALTER TABLE IF EXISTS user_devices
ADD COLUMN IF NOT EXISTS nebula_ip inet;

ALTER TABLE IF EXISTS user_devices
ADD COLUMN IF NOT EXISTS is_lighthouse boolean DEFAULT false;

ALTER TABLE IF EXISTS user_devices
ADD COLUMN IF NOT EXISTS nebula_last_seen timestamptz;

-- Create pool of available Nebula IPs per project
CREATE TABLE IF NOT EXISTS nebula_ip_pool (
  id serial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ip inet NOT NULL UNIQUE,
  allocated_to_device_id uuid REFERENCES user_devices(id) DEFAULT NULL,
  allocated_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nebula_ip_pool_project_idx ON nebula_ip_pool(project_id);
CREATE INDEX IF NOT EXISTS nebula_ip_pool_allocated_idx ON nebula_ip_pool(allocated_to_device_id);

-- Audit table for allocations (history)
CREATE TABLE IF NOT EXISTS nebula_ip_allocations (
  id serial PRIMARY KEY,
  ip inet NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES user_devices(id),
  allocated_by uuid NULL,
  allocated_at timestamptz DEFAULT now(),
  released_at timestamptz DEFAULT NULL
);

-- Function: allocate_nebula_ip(project_id uuid, device_id uuid, allocated_by uuid)
-- Atomically selects an unallocated IP from nebula_ip_pool and marks it allocated.
CREATE OR REPLACE FUNCTION allocate_nebula_ip(p_project_id uuid, p_device_id uuid, p_allocated_by uuid)
RETURNS inet AS $$
DECLARE
  r RECORD;
BEGIN
  -- Try to get one free IP using SKIP LOCKED to avoid races
  SELECT id, ip
  INTO r
  FROM nebula_ip_pool
  WHERE project_id = p_project_id
    AND allocated_to_device_id IS NULL
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nebula_ip_pool_exhausted';
  END IF;

  -- Mark it allocated
  UPDATE nebula_ip_pool
  SET allocated_to_device_id = p_device_id,
      allocated_at = now()
  WHERE id = r.id;

  -- Persist allocation history
  INSERT INTO nebula_ip_allocations(ip, project_id, device_id, allocated_by, allocated_at)
  VALUES (r.ip, p_project_id, p_device_id, p_allocated_by, now());

  -- Also record on user_devices
  UPDATE user_devices
  SET nebula_ip = r.ip,
      nebula_last_seen = now()
  WHERE id = p_device_id;

  RETURN r.ip;
END;
$$ LANGUAGE plpgsql;

-- Release helper
CREATE OR REPLACE FUNCTION release_nebula_ip_by_device(p_device_id uuid)
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT id, ip, project_id INTO r FROM nebula_ip_pool WHERE allocated_to_device_id = p_device_id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
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

  -- Clear device field
  UPDATE user_devices
  SET nebula_ip = NULL
  WHERE id = p_device_id;

  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMIT;
