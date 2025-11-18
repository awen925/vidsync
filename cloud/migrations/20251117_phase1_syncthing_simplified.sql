-- Phase 1: Syncthing-First Architecture (Simplified)
-- Focus: Metadata snapshots only, P2P transfers via Syncthing
-- Scale: 10k users × 5 projects × 10k files × 10TB per project
-- Database load: Minimal (only metadata, no file events)

BEGIN;

-- ============================================================================
-- TABLE: project_file_snapshots
-- Purpose: Store directory structure + metadata for invited members
-- Key insight: This replaces storing every file event - just metadata cache
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_file_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,        -- Relative path from project root
  is_directory BOOLEAN NOT NULL DEFAULT FALSE,
  file_hash VARCHAR(64),          -- SHA-256 of file (for UX / verify sync)
  size BIGINT,                    -- File size in bytes
  modified_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata for pagination
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Composite unique key: one entry per file per project
  UNIQUE(project_id, file_path)
);

-- Index for fast listing by project
CREATE INDEX idx_project_file_snapshots_project_id 
  ON project_file_snapshots(project_id);

-- Index for pagination (by file_path)
CREATE INDEX idx_project_file_snapshots_project_path 
  ON project_file_snapshots(project_id, file_path);

-- Index for directory listing (is_directory + file_path)
CREATE INDEX idx_project_file_snapshots_directory 
  ON project_file_snapshots(project_id, is_directory, file_path);

-- Index for modified date (useful for knowing what changed)
CREATE INDEX idx_project_file_snapshots_modified 
  ON project_file_snapshots(project_id, modified_at DESC);

-- ============================================================================
-- TABLE: project_sync_state
-- Purpose: Track sync metadata per project (last snapshot update, version)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_sync_state (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Snapshot version (increment on each update)
  snapshot_version INTEGER DEFAULT 0,
  
  -- When was snapshot last updated
  last_snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Total files in current snapshot
  total_files INTEGER DEFAULT 0,
  
  -- Total size of all files (in bytes)
  total_size BIGINT DEFAULT 0,
  
  -- Root hash of entire tree (for quick comparison)
  root_hash VARCHAR(64),
  
  -- Lifecycle
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_sync_state_updated 
  ON project_sync_state(updated_at DESC);

-- ============================================================================
-- TABLE: project_sync_checkpoints (optional - for delta sync)
-- Purpose: Track per-device sync state (when did this device last sync?)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,        -- Device identifier (from Syncthing)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Last time this device synced (for delta queries)
  last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Version of snapshot that device has
  synced_snapshot_version INTEGER DEFAULT 0,
  
  -- Lifecycle
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(project_id, device_id, user_id)
);

CREATE INDEX idx_project_sync_checkpoints_project_device 
  ON project_sync_checkpoints(project_id, device_id);

CREATE INDEX idx_project_sync_checkpoints_user 
  ON project_sync_checkpoints(user_id);

-- ============================================================================
-- FUNCTION: update_project_file_snapshots_timestamp
-- Purpose: Auto-update updated_at when file metadata changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_project_file_snapshots_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_file_snapshots_timestamp 
  ON project_file_snapshots;
CREATE TRIGGER trigger_project_file_snapshots_timestamp
  BEFORE UPDATE ON project_file_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_project_file_snapshots_timestamp();

-- ============================================================================
-- FUNCTION: update_project_sync_state_timestamp
-- Purpose: Auto-update project_sync_state when snapshots change
-- ============================================================================

CREATE OR REPLACE FUNCTION update_project_sync_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE project_sync_state
  SET updated_at = CURRENT_TIMESTAMP,
      snapshot_version = snapshot_version + 1
  WHERE project_id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_sync_state_timestamp 
  ON project_file_snapshots;
CREATE TRIGGER trigger_project_sync_state_timestamp
  AFTER INSERT OR UPDATE OR DELETE ON project_file_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_project_sync_state_timestamp();

-- ============================================================================
-- COMMENTS: Document for future developers
-- ============================================================================

COMMENT ON TABLE project_file_snapshots IS 
'Stores directory structure + file metadata (not file events). '
'This is the UX layer - invited members see this to browse files. '
'Syncthing handles actual file transfers and sync. '
'Updated periodically (e.g., every 1-5 minutes) or on manual refresh. '
'Much lighter than storing every file change event.';

COMMENT ON TABLE project_sync_state IS 
'Metadata about current snapshot state. Used to detect changes quickly '
'and track snapshot versions for delta sync capability.';

COMMENT ON TABLE project_sync_checkpoints IS 
'Optional: Track per-device sync state if you want delta sync. '
'Useful for mobile/sporadic devices to only get changes since last sync.';

COMMIT;
