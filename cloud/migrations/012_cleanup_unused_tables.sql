-- ============================================================================
-- DATABASE CLEANUP MIGRATION
-- Remove unused and duplicate tables/views
-- Date: November 18, 2025
-- ============================================================================

-- PHASE 1: DROP UNUSED TABLES (Not referenced in backend code)
-- These tables are unused in the current Syncthing-based architecture

-- Drop remote_files table (replaced by Syncthing folder sync)
DROP TABLE IF EXISTS public.remote_files CASCADE;

-- Drop file_transfers table (not used in current sync flow)
DROP TABLE IF EXISTS public.file_transfers CASCADE;

-- Drop transfer_events table (depends on file_transfers)
DROP TABLE IF EXISTS public.transfer_events CASCADE;

-- Drop file_synced_devices table (part of old file tracking)
DROP TABLE IF EXISTS public.file_synced_devices CASCADE;

-- Drop optimized_file_index table (replaced by FileMetadataService snapshots)
DROP TABLE IF EXISTS public.optimized_file_index CASCADE;

-- Drop file_sync_checkpoints table (duplicate of project_sync_checkpoints)
DROP TABLE IF EXISTS public.file_sync_checkpoints CASCADE;

-- Drop nebula_ip_allocations table (Nebula pairing not in current scope)
DROP TABLE IF EXISTS public.nebula_ip_allocations CASCADE;

-- Drop nebula_ip_pool table (Nebula pairing not in current scope)
DROP TABLE IF EXISTS public.nebula_ip_pool CASCADE;

-- Drop pairing_invites table (device pairing not in current scope)
DROP TABLE IF EXISTS public.pairing_invites CASCADE;

-- Drop conflicts table (not needed - Syncthing handles conflicts)
DROP TABLE IF EXISTS public.conflicts CASCADE;

-- ============================================================================
-- PHASE 2: DROP DUPLICATE TABLES (Consolidate sync state)
-- Keep: project_snapshots (official snapshot storage)
-- Drop: project_file_snapshots, project_sync_state, project_sync_checkpoints
-- ============================================================================

-- Drop project_file_snapshots (replaced by JSON snapshots in Supabase Storage)
DROP TABLE IF EXISTS public.project_file_snapshots CASCADE;

-- Drop project_sync_state (redundant with project_snapshots)
DROP TABLE IF EXISTS public.project_sync_state CASCADE;

-- Drop project_sync_checkpoints (not used in current implementation)
DROP TABLE IF EXISTS public.project_sync_checkpoints CASCADE;

-- ============================================================================
-- PHASE 3: DROP UNUSED VIEWS
-- ============================================================================

DROP VIEW IF EXISTS public.project_invites_with_creator CASCADE;
DROP VIEW IF EXISTS public.projects_with_owner CASCADE;
DROP VIEW IF EXISTS public.project_members_with_user CASCADE;
DROP VIEW IF EXISTS public.owned_projects_full CASCADE;
DROP VIEW IF EXISTS public.user_profiles CASCADE;

-- Keep: invited_projects_full (used in GET /projects/list/invited)

-- ============================================================================
-- PHASE 4: CLEAN UP TRIGGERS FROM DELETED TABLES
-- ============================================================================

-- These triggers are automatically dropped when tables are dropped
-- No manual action needed

-- ============================================================================
-- PHASE 5: CONSOLIDATION - DROP REDUNDANT FIELDS FROM projects TABLE
-- ============================================================================

-- The projects table had sync_mode and status which are now managed by Syncthing
-- Keep these for backward compatibility but note they're informational only

-- If you want to be strict:
-- ALTER TABLE public.projects DROP COLUMN IF EXISTS sync_mode;
-- ALTER TABLE public.projects DROP COLUMN IF EXISTS status;

-- For now, we keep them for backward compatibility with existing code

-- ============================================================================
-- PHASE 6: CLEANUP - REMOVE UNUSED TABLES FROM COMMENT
-- ============================================================================

-- Confirm project_invites is still used (it is - for invite tokens)
-- Confirm project_members is still used (it is - for membership)
-- Confirm project_devices is still used (it is - for device tracking)
-- Confirm sync_events is still used (it is - for audit trail)
-- Confirm audit_logs is still used (it is - for compliance)

-- ============================================================================
-- SUMMARY OF REMAINING TABLES (PRODUCTION)
-- ============================================================================

/*

CORE TABLES:
✓ projects - Project information + Syncthing folder ID + snapshot URLs
✓ project_members - Project membership (owner/viewer roles)
✓ project_invites - Invite tokens for sharing projects
✓ devices - User devices with Syncthing IDs
✓ project_devices - Project-device relationships
✓ sync_events - Sync activity audit trail
✓ project_snapshots - Snapshot metadata (file tree JSON storage location)

UTILITY TABLES:
✓ user_settings - User preferences (theme, notifications, etc)
✓ magic_link_tokens - Passwordless login tokens
✓ audit_logs - Compliance logging

VIEWS (INFORMATIONAL):
✓ invited_projects_full - Projects where user is a member (with owner info)

STORAGE BUCKETS:
✓ project-snapshots - Gzip-compressed JSON file metadata (Supabase Storage)

TOTAL: 10 tables + 1 view + 1 storage bucket

*/

-- ============================================================================
-- VERIFICATION QUERIES (Run to confirm cleanup)
-- ============================================================================

-- List all remaining tables
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- List all remaining views
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'VIEW' ORDER BY table_name;
