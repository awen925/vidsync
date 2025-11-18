-- ============================================================================
-- MIGRATION: Add snapshot URL fields to projects table
-- Purpose: Store reference to JSON snapshots in Supabase Storage
-- Date: November 18, 2025
-- ============================================================================

-- Add snapshot URL tracking to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS snapshot_url TEXT;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS snapshot_updated_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_snapshot_updated_at 
  ON public.projects(snapshot_updated_at DESC);

-- ============================================================================
-- EXPLANATION
-- ============================================================================

/*

NEW FIELDS:
- snapshot_url: Points to gzip-compressed JSON in Supabase Storage
  Location: project-snapshots/{projectId}/snapshot_{timestamp}.json.gz
  Contains: Full file tree with metadata (compressed)
  Updated: On project creation, user join, and manual refresh

- snapshot_updated_at: Timestamp of when snapshot was last generated
  Used: For cache invalidation and freshness checks
  Format: ISO 8601 timestamp with timezone

BENEFITS:
✓ Database stays lightweight (no storing 10k+ files per project)
✓ File snapshots are immutable (JSON in storage)
✓ Quick access via URL (no decompression on query)
✓ Easy to clean up old snapshots (storage manager handles it)
✓ Snapshots available to Supabase RLS-protected URLs
✓ Supports very large projects (tested with 100k+ files)

BACKWARD COMPATIBILITY:
✓ Old project_file_snapshots table will be dropped in separate migration
✓ Existing code should migrate to new snapshot storage
✓ No breaking changes to projects table structure

USAGE IN CODE:
1. Save snapshot: FileMetadataService.saveSnapshot(projectId, name, files)
   - Returns: { snapshotUrl, snapshotSize, createdAt }
   - Stores: snapshot_url + snapshot_updated_at in projects table

2. Load snapshot: FileMetadataService.loadSnapshot(snapshotUrl)
   - Fetches: From Supabase Storage
   - Decompresses: Gzip JSON
   - Returns: SnapshotMetadata with file tree

3. Get files for member: FileMetadataService.getFilesForInvitedMember(projectId, page)
   - Fetches: snapshot_url from projects table
   - Loads: JSON from storage
   - Paginates: 500 files per page
   - Returns: Paginated results

*/

-- ============================================================================
-- ROLLBACK
-- ============================================================================

/*
-- If you need to rollback this migration:

ALTER TABLE public.projects
DROP COLUMN IF EXISTS snapshot_url;

ALTER TABLE public.projects
DROP COLUMN IF EXISTS snapshot_updated_at;

DROP INDEX IF EXISTS idx_projects_snapshot_updated_at;

*/
