-- ============================================================================
-- DATABASE SCHEMA REFERENCE - PRODUCTION TABLES
-- Final state after cleanup migrations
-- Date: November 18, 2025
-- ============================================================================

-- ============================================================================
-- CORE TABLES (Required)
-- ============================================================================

--1. projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  local_path text,
  syncthing_folder_id text,          -- ID of Syncthing folder (auto-created on project creation)
  auto_sync boolean DEFAULT true,    -- Whether to auto-sync new files
  sync_mode text DEFAULT 'automatic', -- 'automatic' or 'manual' (informational only)
  status text DEFAULT 'idle',        -- 'idle', 'syncing', 'paused' (informational only)
  last_synced timestamp with time zone,
  snapshot_url text,                 -- URL to gzip JSON in Supabase Storage
  snapshot_updated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Usage in backend:
-- - POST /api/projects: Create project, auto-create Syncthing folder
-- - GET /api/projects/list/owned: Fetch owned projects
-- - DELETE /api/projects/:id: Delete project + cleanup Syncthing folder + snapshots


--2. project_members
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'viewer',  -- 'owner', 'editor', 'viewer'
  invited_by uuid,
  invited_at timestamp with time zone,
  joined_at timestamp with time zone,
  status text DEFAULT 'pending',     -- 'pending', 'accepted', 'declined'
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Usage in backend:
-- - POST /api/projects/join: Add user as member when joining
-- - GET /api/projects/list/invited: Get projects where user is member
-- - DELETE /api/projects/:id: Clean up members when deleting project


--3. project_invites
CREATE TABLE public.project_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invite_token text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  is_active boolean DEFAULT true,
  used_count integer DEFAULT 0,
  last_used_at timestamp with time zone,
  last_used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Usage in backend:
-- - POST /api/projects/:id/invite-token: Generate shareable invite
-- - POST /api/projects/join: Verify and use invite token


--4. devices
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NOT NULL,
  platform text NOT NULL,             -- 'linux', 'darwin', 'win32'
  device_token text NOT NULL UNIQUE,
  syncthing_id text,                  -- Syncthing device ID (from Syncthing API)
  nebula_ip text,                     -- Nebula VPN IP (for future use)
  is_online boolean DEFAULT false,
  last_seen timestamp with time zone,
  is_lighthouse boolean DEFAULT false,
  nebula_last_seen timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, device_id)
);

-- Usage in backend:
-- - POST /api/projects: Get owner's device to create Syncthing folder
-- - POST /api/projects/join: Get user's device to add to Syncthing folder
-- - POST /pause-sync, /resume-sync: Get user's device for Syncthing operations


--5. project_devices
CREATE TABLE public.project_devices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  is_syncing boolean DEFAULT true,
  sync_percentage numeric DEFAULT 0,
  last_sync timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(project_id, device_id)
);

-- Usage in backend:
-- - Track which devices are syncing which projects
-- - Update sync percentage and status
-- - Delete associations when removing project


--6. sync_events
CREATE TABLE public.sync_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  event_type text NOT NULL,          -- 'fileUpdate', 'folderCreate', 'delete', 'conflict', 'error'
  file_path text,
  file_size bigint,
  previous_hash text,
  new_hash text,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Usage in backend:
-- - Log sync events for audit trail
-- - Track file changes and conflicts
-- - Provide history of project sync activity


--7. project_snapshots
CREATE TABLE public.project_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_version integer NOT NULL DEFAULT 1,
  total_files integer NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  root_hash character varying(64),
  file_tree jsonb NOT NULL DEFAULT '[]',
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  invalidated_at timestamp with time zone
);

-- Usage in backend:
-- - Metadata about snapshots (version, file count, total size)
-- - file_tree: Nested JSON structure of project files (for quick lookup)
-- - Actual file snapshots stored in Supabase Storage (project-snapshots bucket)


-- ============================================================================
-- UTILITY TABLES (Optional but recommended)
-- ============================================================================

--8. user_settings
CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  default_download_path text,
  auto_sync boolean DEFAULT true,
  default_sync_mode text DEFAULT 'automatic',
  notifications_enabled boolean DEFAULT true,
  notification_email boolean DEFAULT true,
  theme text DEFAULT 'light',
  language text DEFAULT 'en',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Usage: Store user preferences


--9. magic_link_tokens
CREATE TABLE public.magic_link_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Usage: Passwordless login tokens


--10. audit_logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Usage: Compliance and debugging


-- ============================================================================
-- VIEWS (Read-only, used for convenience)
-- ============================================================================

--1. invited_projects_full
CREATE VIEW public.invited_projects_full AS
SELECT
  p.id,
  p.owner_id,
  p.name,
  p.description,
  p.local_path,
  p.syncthing_folder_id,
  p.auto_sync,
  p.sync_mode,
  p.status,
  p.last_synced,
  p.created_at,
  p.updated_at,
  u.email as owner_email,
  u.raw_user_meta_data ->> 'full_name'::text as owner_name
FROM
  projects p
  LEFT JOIN auth.users u ON u.id = p.owner_id;

-- Usage in backend:
-- - GET /api/projects/list/invited: Shows projects with owner info


-- ============================================================================
-- STORAGE BUCKETS (External file storage)
-- ============================================================================

/*
BUCKET: project-snapshots
Location: Supabase Storage
Files: Gzip-compressed JSON snapshots
Path format: {projectId}/snapshot_{timestamp}.json.gz
Size: ~1MB per project (average)
Lifetime: Keep only latest per project (auto-cleanup)
Access: RLS-protected URLs stored in projects.snapshot_url

Example:
- projects/{projectId}/snapshot_1700000000000.json.gz
- Contains: { projectId, projectName, totalFiles, totalSize, files: [...] }
- Compressed: gzip (~90% reduction for typical projects)
*/


-- ============================================================================
-- SUMMARY
-- ============================================================================

/*
TABLES REMOVED (See cleanup migrations):
✗ remote_files - Replaced by Syncthing folder sync
✗ file_transfers - Not in current scope
✗ transfer_events - Not in current scope
✗ file_synced_devices - Removed (unused)
✗ optimized_file_index - Replaced by JSON snapshots
✗ file_sync_checkpoints - Consolidated
✗ nebula_ip_allocations - Not in current scope
✗ nebula_ip_pool - Not in current scope
✗ pairing_invites - Not in current scope
✗ conflicts - Handled by Syncthing
✗ project_file_snapshots - Replaced by cloud storage JSON
✗ project_sync_state - Consolidated
✗ project_sync_checkpoints - Consolidated

VIEWS REMOVED:
✗ project_invites_with_creator
✗ projects_with_owner
✗ project_members_with_user
✗ owned_projects_full
✗ user_profiles

FINAL COUNT:
- Tables: 10
- Views: 1
- Storage buckets: 1
- Total: 12 database objects

SIZE ESTIMATE:
- Small project (100 files): ~50KB
- Medium project (1K files): ~500KB
- Large project (10K files): ~5MB
- Very large (100K files): ~50MB

All stored in Supabase Storage with RLS protection.
Database only stores references (URLs) - stays lightweight.

*/
