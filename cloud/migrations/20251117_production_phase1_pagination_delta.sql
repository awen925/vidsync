-- Phase 1: Production-Ready File Sync (Pagination + Delta Sync)
-- Implements pagination and delta sync for efficient file listing and synchronization
-- Target: 10k+ files, sub-100ms response times, 95% bandwidth savings on changes

BEGIN;

-- ============================================================================
-- TABLE: optimized_file_index
-- Purpose: Fast file listing with pagination support
-- Key: Hash-based change detection for delta sync
-- ============================================================================

CREATE TABLE IF NOT EXISTS optimized_file_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  
  -- File identification
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  
  -- File metadata
  file_size BIGINT NOT NULL DEFAULT 0,
  file_hash VARCHAR(64) NOT NULL, -- SHA-256 of file content
  mime_type VARCHAR(255),
  
  -- Timestamps for delta sync
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When last synced to backend
  
  -- Ownership & permissions
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  UNIQUE(project_id, device_id, file_path)
);

-- Indexes for performance
CREATE INDEX idx_optimized_file_index_project_id_modified 
  ON optimized_file_index(project_id, modified_at DESC);
CREATE INDEX idx_optimized_file_index_project_id_synced 
  ON optimized_file_index(project_id, synced_at DESC);
CREATE INDEX idx_optimized_file_index_device_id 
  ON optimized_file_index(device_id);
CREATE INDEX idx_optimized_file_index_hash 
  ON optimized_file_index(file_hash);
CREATE INDEX idx_optimized_file_index_created_at 
  ON optimized_file_index(created_at DESC);

-- ============================================================================
-- TABLE: file_sync_checkpoints
-- Purpose: Track which files each device has already synced
-- Enables efficient delta sync by tracking "last sync time per device"
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  
  -- Last sync timestamp for this device
  last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Cursor for pagination (last file ID seen)
  last_cursor UUID,
  
  -- Stats for monitoring
  total_files_synced INTEGER DEFAULT 0,
  total_bytes_synced BIGINT DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(project_id, device_id)
);

CREATE INDEX idx_file_sync_checkpoints_project_device 
  ON file_sync_checkpoints(project_id, device_id);
CREATE INDEX idx_file_sync_checkpoints_project_id 
  ON file_sync_checkpoints(project_id);

-- ============================================================================
-- TABLE: project_snapshots
-- Purpose: Cached tree snapshots for fast listing (compressed representation)
-- Avoids repeated JSON aggregation queries
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Snapshot metadata
  snapshot_version INTEGER NOT NULL DEFAULT 1, -- Increment on changes
  total_files INTEGER NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  root_hash VARCHAR(64), -- Hash of entire tree for quick comparison
  
  -- Cached snapshot data (compressed JSON)
  file_tree JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Lifecycle
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  invalidated_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(project_id)
);

CREATE INDEX idx_project_snapshots_project_id 
  ON project_snapshots(project_id);
CREATE INDEX idx_project_snapshots_updated_at 
  ON project_snapshots(updated_at DESC);

-- ============================================================================
-- TABLE: file_transfers
-- Purpose: Track file download/sync requests between users
-- Enables progress tracking and resumable transfers
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Transfer participants
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  
  -- File information
  file_path TEXT NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  file_size BIGINT NOT NULL,
  
  -- Transfer state
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  bytes_transferred BIGINT DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  
  -- Lifecycle
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- TTL: Auto-cleanup old transfers after 30 days
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days'
);

CREATE INDEX idx_file_transfers_project_id 
  ON file_transfers(project_id);
CREATE INDEX idx_file_transfers_requester_id 
  ON file_transfers(requester_id);
CREATE INDEX idx_file_transfers_status 
  ON file_transfers(status);
CREATE INDEX idx_file_transfers_created_at 
  ON file_transfers(created_at DESC);
CREATE INDEX idx_file_transfers_expires_at 
  ON file_transfers(expires_at);

-- ============================================================================
-- TABLE: transfer_events
-- Purpose: Real-time progress tracking without polluting file_transfers table
-- Auto-cleanup: Events deleted after 24 hours
-- ============================================================================

CREATE TABLE IF NOT EXISTS transfer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES file_transfers(id) ON DELETE CASCADE,
  
  -- Event details
  event_type VARCHAR(50) NOT NULL, -- started, progress, paused, resumed, completed, failed
  event_data JSONB DEFAULT '{}'::jsonb, -- {percent, speed_mbps, eta_seconds, etc}
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- TTL: Auto-cleanup after 24 hours
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours'
);

CREATE INDEX idx_transfer_events_transfer_id 
  ON transfer_events(transfer_id);
CREATE INDEX idx_transfer_events_created_at 
  ON transfer_events(created_at DESC);
CREATE INDEX idx_transfer_events_expires_at 
  ON transfer_events(expires_at);

-- ============================================================================
-- FUNCTION: update_optimized_file_index_modified_at
-- Purpose: Auto-update modified_at when file_hash changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_optimized_file_index_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.file_hash IS DISTINCT FROM OLD.file_hash THEN
    NEW.modified_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_optimized_file_index_modified_at 
  ON optimized_file_index;
CREATE TRIGGER trigger_optimized_file_index_modified_at
  BEFORE UPDATE ON optimized_file_index
  FOR EACH ROW
  EXECUTE FUNCTION update_optimized_file_index_modified_at();

-- ============================================================================
-- FUNCTION: invalidate_project_snapshot
-- Purpose: Invalidate snapshot when files change (called by file_index updates)
-- ============================================================================

CREATE OR REPLACE FUNCTION invalidate_project_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE project_snapshots
  SET invalidated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE project_id = NEW.project_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_invalidate_project_snapshot 
  ON optimized_file_index;
CREATE TRIGGER trigger_invalidate_project_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON optimized_file_index
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_project_snapshot();

-- ============================================================================
-- COMMENTS: Document the schema for future developers
-- ============================================================================

COMMENT ON TABLE optimized_file_index IS 
'Fast file listing with pagination and delta sync support. '
'file_hash enables change detection. modified_at used for delta queries. '
'synced_at tracks when file was last sent to backend.';

COMMENT ON TABLE file_sync_checkpoints IS 
'Per-device sync state tracking. Enables efficient delta sync by remembering '
'last_sync_at timestamp. Cursor enables pagination resume.';

COMMENT ON TABLE project_snapshots IS 
'Cached file tree snapshots for sub-100ms listing responses. '
'Invalidated when files change via trigger. Stores compressed JSON.';

COMMENT ON TABLE file_transfers IS 
'File transfer requests. Tracks progress and enables resumable downloads. '
'Auto-cleanup via expires_at (30 days).';

COMMENT ON TABLE transfer_events IS 
'Real-time progress events for UI updates. Separate from transfers table '
'to avoid bloat. Auto-cleanup via expires_at (24 hours).';

COMMIT;
