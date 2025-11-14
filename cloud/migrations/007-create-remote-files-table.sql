-- Migration: Create remote_files table for storing file metadata from remote projects
-- Purpose: Allow invitees to see files from owner's shared folder with sync status
-- Date: 2025-11-14
-- Phase: Remote File List Implementation - Phase 1

BEGIN;

-- Create remote_files table to store metadata about files in shared projects
CREATE TABLE IF NOT EXISTS remote_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,                    -- e.g., "folder/subfolder/file.txt"
  name TEXT NOT NULL,                    -- e.g., "file.txt"
  size BIGINT,                           -- File size in bytes
  is_directory BOOLEAN DEFAULT false,    -- TRUE for folders, FALSE for files
  mime_type TEXT,                        -- e.g., "video/mp4", "application/json"
  owner_id UUID NOT NULL REFERENCES auth.users(id),  -- User who owns this file
  file_hash TEXT,                        -- SHA256 hash for deduplication
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  modified_at TIMESTAMP WITH TIME ZONE,  -- Last modification time from source
  deleted_by UUID REFERENCES auth.users(id),  -- User who deleted this (soft delete)
  deleted_at TIMESTAMP WITH TIME ZONE,   -- When this file was deleted
  
  -- Unique constraint: one row per project per path
  UNIQUE(project_id, path),
  
  -- Constraint: deleted_by and deleted_at must be set together
  CHECK (deleted_by IS NULL OR deleted_at IS NOT NULL)
);

-- Index for fast lookup by project + path prefix (folder navigation)
CREATE INDEX IF NOT EXISTS idx_remote_files_project_path 
  ON remote_files(project_id, path);

-- Index for finding files by project (all files in a project)
CREATE INDEX IF NOT EXISTS idx_remote_files_project_id 
  ON remote_files(project_id);

-- Index for finding files by owner
CREATE INDEX IF NOT EXISTS idx_remote_files_owner_id 
  ON remote_files(owner_id);

-- Index for soft-deleted files (filtering them out)
CREATE INDEX IF NOT EXISTS idx_remote_files_deleted 
  ON remote_files(project_id, deleted_at) 
  WHERE deleted_by IS NOT NULL;

-- Create file_synced_devices table to track which devices have synced which files
CREATE TABLE IF NOT EXISTS file_synced_devices (
  file_id UUID NOT NULL REFERENCES remote_files(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_bytes BIGINT DEFAULT 0,         -- Bytes synced (useful for progress)
  
  PRIMARY KEY (file_id, device_id)
);

-- Index for finding synced files by device
CREATE INDEX IF NOT EXISTS idx_file_synced_devices_device_id 
  ON file_synced_devices(device_id);

-- Create trigger to update modified_at on remote_files
CREATE OR REPLACE FUNCTION update_remote_files_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_by IS NOT NULL AND OLD.deleted_by IS NULL THEN
    -- When soft-deleting, set deleted_at if not already set
    IF NEW.deleted_at IS NULL THEN
      NEW.deleted_at = NOW();
    END IF;
  END IF;
  NEW.modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER remote_files_modified_at_trigger
  BEFORE UPDATE ON remote_files
  FOR EACH ROW
  EXECUTE FUNCTION update_remote_files_modified_at();

-- Create trigger for file_synced_devices
CREATE OR REPLACE FUNCTION update_file_synced_devices_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.synced_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER file_synced_devices_timestamp_trigger
  BEFORE UPDATE ON file_synced_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_file_synced_devices_timestamp();

-- Enable RLS on remote_files
ALTER TABLE remote_files ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view files in projects they own or are members of
CREATE POLICY "Users can view remote files in accessible projects" ON remote_files
  FOR SELECT USING (
    project_id IN (
      -- Projects owned by user
      SELECT id FROM projects WHERE owner_id = auth.uid()
      UNION
      -- Projects where user is an accepted member
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  );

-- RLS Policy: Only file owner can update/delete their files
CREATE POLICY "File owners can update their files" ON remote_files
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "File owners can delete their files" ON remote_files
  FOR DELETE USING (owner_id = auth.uid());

-- Enable RLS on file_synced_devices
ALTER TABLE file_synced_devices ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view sync status for files in accessible projects
CREATE POLICY "Users can view file sync status" ON file_synced_devices
  FOR SELECT USING (
    file_id IN (
      SELECT id FROM remote_files WHERE
      project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
        UNION
        SELECT project_id FROM project_members 
        WHERE user_id = auth.uid() AND status = 'accepted'
      )
    )
  );

COMMIT;
