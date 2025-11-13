-- Vidsync Cloud Database Schema for Supabase
-- This schema defines all tables, indexes, and RLS policies for the Vidsync cloud backend

-- Enable UUID and other extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP WITH TIME ZONE,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ============================================================================
-- DEVICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'linux', 'darwin', 'win32'
  device_token TEXT NOT NULL UNIQUE,
  syncthing_id TEXT,
  nebula_ip TEXT,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_device_token ON devices(device_token);
CREATE INDEX idx_devices_is_online ON devices(is_online);

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  local_path TEXT,
  syncthing_folder_id TEXT,
  auto_sync BOOLEAN DEFAULT true,
  sync_mode TEXT DEFAULT 'automatic', -- 'automatic', 'manual'
  status TEXT DEFAULT 'idle', -- 'idle', 'syncing', 'paused', 'error'
  last_synced TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_projects_status ON projects(status);

-- ============================================================================
-- PROJECT MEMBERS TABLE (for shared projects)
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'owner', 'editor', 'viewer'
  invited_by UUID,
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
CREATE INDEX idx_project_members_status ON project_members(status);

-- ============================================================================
-- PROJECT DEVICES TABLE (which devices are syncing which projects)
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  is_syncing BOOLEAN DEFAULT true,
  sync_percentage NUMERIC DEFAULT 0,
  last_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, device_id)
);

CREATE INDEX idx_project_devices_project_id ON project_devices(project_id);
CREATE INDEX idx_project_devices_device_id ON project_devices(device_id);

-- ============================================================================
-- SYNC EVENTS TABLE (audit trail of sync activity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'fileUpdate', 'folderCreate', 'delete', 'conflict', 'error', 'scanStart', 'scanComplete', 'paused', 'resumed'
  file_path TEXT,
  file_size BIGINT,
  previous_hash TEXT,
  new_hash TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sync_events_project_id ON sync_events(project_id);
CREATE INDEX idx_sync_events_device_id ON sync_events(device_id);
CREATE INDEX idx_sync_events_created_at ON sync_events(created_at DESC);
CREATE INDEX idx_sync_events_event_type ON sync_events(event_type);

-- ============================================================================
-- CONFLICTS TABLE (for handling sync conflicts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  device_a_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  device_b_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  device_a_hash TEXT,
  device_b_hash TEXT,
  device_a_timestamp TIMESTAMP WITH TIME ZONE,
  device_b_timestamp TIMESTAMP WITH TIME ZONE,
  resolution_strategy TEXT, -- 'device_a', 'device_b', 'keep_both', 'newer', 'manual'
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conflicts_project_id ON conflicts(project_id);
CREATE INDEX idx_conflicts_file_path ON conflicts(file_path);
CREATE INDEX idx_conflicts_resolved_at ON conflicts(resolved_at);

-- ============================================================================
-- USER SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  default_download_path TEXT,
  auto_sync BOOLEAN DEFAULT true,
  default_sync_mode TEXT DEFAULT 'automatic', -- 'automatic', 'manual'
  notifications_enabled BOOLEAN DEFAULT true,
  notification_email BOOLEAN DEFAULT true,
  theme TEXT DEFAULT 'light', -- 'light', 'dark'
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- ============================================================================
-- MAGIC LINK TOKENS TABLE (for passwordless login)
-- ============================================================================
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_magic_link_tokens_email ON magic_link_tokens(email);
CREATE INDEX idx_magic_link_tokens_token ON magic_link_tokens(token);
CREATE INDEX idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at);

-- ============================================================================
-- AUDIT LOG TABLE (for compliance and debugging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (
    auth.uid()::uuid = id
  );

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (
    auth.uid()::uuid = id
  );

-- Devices: users can only see their own devices
CREATE POLICY "Users can view their own devices" ON devices
  FOR SELECT USING (
    auth.uid()::uuid = user_id
  );

CREATE POLICY "Users can insert their own devices" ON devices
  FOR INSERT WITH CHECK (
    auth.uid()::uuid = user_id
  );

CREATE POLICY "Users can update their own devices" ON devices
  FOR UPDATE USING (
    auth.uid()::uuid = user_id
  );

CREATE POLICY "Users can delete their own devices" ON devices
  FOR DELETE USING (
    auth.uid()::uuid = user_id
  );

-- Projects: users can only see their own or shared projects
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (
    auth.uid()::uuid = owner_id OR
    id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()::uuid AND status = 'accepted'
    )
  );

CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT WITH CHECK (
    auth.uid()::uuid = owner_id
  );

CREATE POLICY "Owners can update their projects" ON projects
  FOR UPDATE USING (
    auth.uid()::uuid = owner_id
  );

CREATE POLICY "Owners can delete their projects" ON projects
  FOR DELETE USING (
    auth.uid()::uuid = owner_id
  );

-- Project members: only project members can see memberships
CREATE POLICY "Users can view project members" ON project_members
  FOR SELECT USING (
    user_id = auth.uid()::uuid OR
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()::uuid
    )
  );

-- Project devices: visible to project members
CREATE POLICY "Project members can view devices" ON project_devices
  FOR SELECT USING (
    project_id IN (
      SELECT projects.id FROM projects
      WHERE projects.owner_id = auth.uid()::uuid OR
      projects.id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()::uuid AND status = 'accepted'
      )
    )
  );

-- Sync events: visible to project members
CREATE POLICY "Project members can view sync events" ON sync_events
  FOR SELECT USING (
    project_id IN (
      SELECT projects.id FROM projects
      WHERE projects.owner_id = auth.uid()::uuid OR
      projects.id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()::uuid AND status = 'accepted'
      )
    )
  );

-- Conflicts: visible to project members
CREATE POLICY "Project members can view conflicts" ON conflicts
  FOR SELECT USING (
    project_id IN (
      SELECT projects.id FROM projects
      WHERE projects.owner_id = auth.uid()::uuid OR
      projects.id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()::uuid AND status = 'accepted'
      )
    )
  );

-- User settings: users can only see their own
CREATE POLICY "Users can view their own settings" ON user_settings
  FOR SELECT USING (
    auth.uid()::uuid = user_id
  );

CREATE POLICY "Users can update their own settings" ON user_settings
  FOR UPDATE USING (
    auth.uid()::uuid = user_id
  );

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER users_updated_at_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for devices table
CREATE TRIGGER devices_updated_at_trigger
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for projects table
CREATE TRIGGER projects_updated_at_trigger
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for project_members table
CREATE TRIGGER project_members_updated_at_trigger
  BEFORE UPDATE ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for project_devices table
CREATE TRIGGER project_devices_updated_at_trigger
  BEFORE UPDATE ON project_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for conflicts table
CREATE TRIGGER conflicts_updated_at_trigger
  BEFORE UPDATE ON conflicts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_settings table
CREATE TRIGGER user_settings_updated_at_trigger
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create user settings on user creation
CREATE OR REPLACE FUNCTION create_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create user settings
CREATE TRIGGER users_create_settings_trigger
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_settings();

-- ============================================================================
-- SAMPLE DATA (for development/testing)
-- ============================================================================
-- Uncomment to populate with test data:
/*
INSERT INTO users (email, password_hash, full_name, email_verified) VALUES
  ('test@example.com', '$2a$10$...', 'Test User', true)
ON CONFLICT DO NOTHING;
*/

