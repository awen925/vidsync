-- Migration 008: Create project_events table for delta-first sync
-- Purpose: Append-only log for tracking file changes per project
-- Enables: Phase 2B delta sync, offline recovery, event-based architecture

-- Create project_events table (append-only delta log)
CREATE TABLE IF NOT EXISTS project_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,                           -- Monotonic sequence number per project
  change JSONB NOT NULL,                         -- {path, op, hash, mtime, size}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(project_id, seq)
);

-- Index for efficient delta pulling (since_seq queries)
CREATE INDEX IF NOT EXISTS idx_project_events_project_seq ON project_events(project_id, seq);
CREATE INDEX IF NOT EXISTS idx_project_events_project_created ON project_events(project_id, created_at);

-- Sequence generator for event ordering (per-project monotonic counter)
CREATE SEQUENCE IF NOT EXISTS project_events_seq;

-- Add version field to remote_files for optimistic locking
ALTER TABLE remote_files ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;
ALTER TABLE remote_files ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMP WITH TIME ZONE;

-- Trigger to update version on file content change
CREATE OR REPLACE FUNCTION increment_remote_files_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment version if hash (content) changed
  IF OLD.file_hash IS DISTINCT FROM NEW.file_hash THEN
    NEW.version = OLD.version + 1;
    NEW.last_scanned_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS remote_files_version_trigger ON remote_files;

CREATE TRIGGER remote_files_version_trigger
  BEFORE UPDATE ON remote_files
  FOR EACH ROW
  EXECUTE FUNCTION increment_remote_files_version();

-- Add column to track last sequence number synced (for client-side bookmarking)
ALTER TABLE file_synced_devices ADD COLUMN IF NOT EXISTS last_synced_seq BIGINT DEFAULT 0;

-- RLS Policy for project_events (can only view events for your projects)
ALTER TABLE project_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_events_view_policy ON project_events
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = auth.uid()
      OR id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY project_events_insert_policy ON project_events
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = auth.uid()
    )
  );
