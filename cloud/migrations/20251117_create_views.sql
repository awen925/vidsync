-- Migration: Create public views for projects with owner and member info
-- Date: 2025-11-17
-- Purpose: Work around Supabase cross-schema join limitation
-- Issue: Cannot join public.projects with auth.users directly in PostgREST
-- Solution: Create views in public schema that pre-join with auth.users
-- These views can then be queried normally without explicit joins

BEGIN;

-- ============================================================================
-- VIEW 1: projects_with_owner
-- Pre-joins projects with owner info from auth.users
-- ============================================================================
CREATE OR REPLACE VIEW public.projects_with_owner AS
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
  -- Owner info from auth.users
  u.id as owner_id_auth,
  u.email as owner_email,
  u.raw_user_meta_data->>'full_name' as owner_name
FROM public.projects p
LEFT JOIN auth.users u ON u.id = p.owner_id;

-- Grant access to authenticated users
GRANT SELECT ON public.projects_with_owner TO authenticated;

-- ============================================================================
-- VIEW 2: project_members_with_user
-- Pre-joins project_members with user info from auth.users
-- ============================================================================
CREATE OR REPLACE VIEW public.project_members_with_user AS
SELECT 
  pm.id,
  pm.project_id,
  pm.user_id,
  pm.role,
  pm.status,
  pm.invited_at,
  pm.joined_at,
  pm.created_at,
  -- User info from auth.users
  u.id as user_id_auth,
  u.email as user_email,
  u.raw_user_meta_data->>'full_name' as user_name
FROM public.project_members pm
LEFT JOIN auth.users u ON u.id = pm.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public.project_members_with_user TO authenticated;

-- ============================================================================
-- VIEW 3: project_invites_with_creator
-- Pre-joins project_invites with creator info from auth.users
-- ============================================================================
CREATE OR REPLACE VIEW public.project_invites_with_creator AS
SELECT 
  pi.id,
  pi.project_id,
  pi.invite_token,
  pi.created_by,
  pi.created_at,
  pi.expires_at,
  pi.is_active,
  pi.used_count,
  pi.last_used_at,
  pi.last_used_by,
  -- Creator info from auth.users
  u.id as creator_id_auth,
  u.email as creator_email,
  u.raw_user_meta_data->>'full_name' as creator_name,
  -- Last used by info from auth.users
  u2.id as last_used_by_id_auth,
  u2.email as last_used_by_email,
  u2.raw_user_meta_data->>'full_name' as last_used_by_name
FROM public.project_invites pi
LEFT JOIN auth.users u ON u.id = pi.created_by
LEFT JOIN auth.users u2 ON u2.id = pi.last_used_by;

-- Grant access to authenticated users
GRANT SELECT ON public.project_invites_with_creator TO authenticated;

-- ============================================================================
-- VIEW 4: invited_projects_full
-- Combined view for /api/projects/list/invited
-- Shows projects that user is invited to with all owner details
-- ============================================================================
CREATE OR REPLACE VIEW public.invited_projects_full AS
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
  -- Owner info from auth.users
  u.email as owner_email,
  u.raw_user_meta_data->>'full_name' as owner_name
FROM public.projects p
LEFT JOIN auth.users u ON u.id = p.owner_id;

-- Grant access to authenticated users
GRANT SELECT ON public.invited_projects_full TO authenticated;

-- ============================================================================
-- VIEW 5: owned_projects_full
-- Shows projects owned by current user with member count
-- ============================================================================
CREATE OR REPLACE VIEW public.owned_projects_full AS
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
  -- Owner info from auth.users
  u.email as owner_email,
  u.raw_user_meta_data->>'full_name' as owner_name,
  -- Member count
  (SELECT COUNT(*) FROM public.project_members pm 
   WHERE pm.project_id = p.id AND pm.status = 'accepted') as member_count
FROM public.projects p
LEFT JOIN auth.users u ON u.id = p.owner_id;

-- Grant access to authenticated users
GRANT SELECT ON public.owned_projects_full TO authenticated;

-- ============================================================================
-- VIEW 6: user_profiles (useful for other queries)
-- Extracts user info from auth.users into public schema
-- ============================================================================
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
  id,
  email,
  raw_user_meta_data->>'full_name' as full_name,
  raw_user_meta_data->>'avatar_url' as avatar_url,
  created_at,
  updated_at
FROM auth.users;

-- Grant access to authenticated users
GRANT SELECT ON public.user_profiles TO authenticated;

COMMIT;
