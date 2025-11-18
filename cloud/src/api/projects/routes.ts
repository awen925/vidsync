import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';
import { getWebSocketService } from '../../services/webSocketService';
import { SyncthingService } from '../../services/syncthingService';
import { FileMetadataService } from '../../services/fileMetadataService';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// POST /api/projects
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, local_path, auto_sync } = req.body;
    const ownerId = (req as any).user.id;

    if (!name) return res.status(400).json({ error: 'Project name required' });

    // Generate folder ID (use project UUID-based format)
    const folderId = `proj_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

    const payload = {
      owner_id: ownerId,
      name,
      description: description || null,
      local_path: local_path || null,
      auto_sync: typeof auto_sync === 'boolean' ? auto_sync : true,
      syncthing_folder_id: folderId, // Store folder ID
    };

    const { data, error } = await supabase.from('projects').insert(payload).select().single();

    if (error) {
      console.error('Failed to create project:', error.message);
      return res.status(500).json({ error: 'Failed to create project' });
    }

    // Try to create Syncthing folder (optional - fails gracefully)
    try {
      // Get owner's primary device with Syncthing ID
      const { data: devices, error: devErr } = await supabase
        .from('devices')
        .select('syncthing_id')
        .eq('user_id', ownerId)
        .limit(1);

      if (!devErr && devices && devices.length > 0 && devices[0].syncthing_id) {
        const syncthingService = new SyncthingService(
          process.env.SYNCTHING_API_KEY || '',
          process.env.SYNCTHING_HOST || 'localhost',
          parseInt(process.env.SYNCTHING_PORT || '8384')
        );

        await syncthingService.createFolder(
          folderId,
          name,
          local_path || `/tmp/vidsync/${data.id}`,
          devices[0].syncthing_id
        );

        console.log(`Auto-created Syncthing folder for project ${data.id}`);
      }
    } catch (syncErr) {
      console.warn(`Failed to auto-create Syncthing folder: ${syncErr}`);
      // Continue anyway - user can sync manually later
    }

    // Generate initial snapshot (optional)
    try {
      const mockFiles = [
        {
          path: 'README.md',
          name: 'README.md',
          type: 'file' as const,
          size: 0,
          hash: '',
          modifiedAt: new Date().toISOString(),
        },
      ];

      const snapshotResult = await FileMetadataService.saveSnapshot(
        data.id,
        name,
        mockFiles
      );

      console.log(`Generated initial snapshot for project ${data.id}`);
    } catch (snapshotErr) {
      console.warn(`Failed to generate initial snapshot: ${snapshotErr}`);
      // Continue anyway
    }

    res.status(201).json({ project: data });
  } catch (error) {
    console.error('Create project exception:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/projects
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Owned projects
    const { data: owned, error: ownedErr } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', userId);

    if (ownedErr) {
      console.error('Failed to fetch owned projects:', ownedErr.message);
      return res.status(500).json({ error: 'Failed to list projects' });
    }

    // Projects where user is a member (accepted)
    const { data: memberships, error: memErr } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId)
      .eq('status', 'accepted');

    if (memErr) {
      console.error('Failed to fetch project memberships:', memErr.message);
      return res.status(500).json({ error: 'Failed to list projects' });
    }

    const memberProjectIds = (memberships || []).map((m: any) => m.project_id).filter(Boolean);

    let memberProjects: any[] = [];
    if (memberProjectIds.length > 0) {
      const { data: mp, error: mpErr } = await supabase
        .from('projects')
        .select('*')
        .in('id', memberProjectIds);

      if (mpErr) {
        console.error('Failed to fetch member projects:', mpErr.message);
        return res.status(500).json({ error: 'Failed to list projects' });
      }

      memberProjects = mp || [];
    }

    const projects = [...(owned || []), ...memberProjects];

    res.json({ projects });
  } catch (error) {
    console.error('List projects exception:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// GET /api/projects/list/invited - Get invited projects where user is a member (received)
// IMPORTANT: This MUST come before /:projectId route to match correctly
router.get('/list/invited', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get accepted memberships
    const { data: memberships, error: memErr } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId)
      .eq('status', 'accepted');

    if (memErr) {
      console.error('Failed to fetch memberships:', memErr.message);
      return res.status(500).json({ error: 'Failed to fetch invited projects' });
    }

    const projectIds = (memberships || []).map((m: any) => m.project_id).filter(Boolean);

    if (projectIds.length === 0) {
      return res.json({ projects: [] });
    }

    // Get project details with owner info using the view (avoids cross-schema join limitation)
    const { data: projects, error: projectsErr } = await supabase
      .from('invited_projects_full')
      .select('*')
      .in('id', projectIds);

    if (projectsErr) {
      console.error('Failed to fetch invited projects:', projectsErr.message);
      return res.status(500).json({ error: 'Failed to fetch invited projects' });
    }

    // Transform to match expected response format (owner field contains owner info)
    const transformedProjects = (projects || []).map((p: any) => ({
      id: p.id,
      owner_id: p.owner_id,
      name: p.name,
      description: p.description,
      local_path: p.local_path,
      syncthing_folder_id: p.syncthing_folder_id,
      auto_sync: p.auto_sync,
      sync_mode: p.sync_mode,
      status: p.status,
      last_synced: p.last_synced,
      created_at: p.created_at,
      updated_at: p.updated_at,
      owner: {
        id: p.owner_id,
        email: p.owner_email,
        full_name: p.owner_name,
      }
    }));

    res.json({ projects: transformedProjects });
  } catch (error) {
    console.error('Get invited projects exception:', error);
    res.status(500).json({ error: 'Failed to fetch invited projects' });
  }
});

// GET /api/projects/list/owned - Get ONLY owned projects (not invited)
// IMPORTANT: This MUST come before /:projectId route to match correctly
router.get('/list/owned', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get only owned projects
    const { data: projects, error: projectsErr } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', userId);

    if (projectsErr) {
      console.error('Failed to fetch owned projects:', projectsErr.message);
      return res.status(500).json({ error: 'Failed to fetch owned projects' });
    }

    res.json({ projects: projects || [] });
  } catch (error) {
    console.error('Get owned projects exception:', error);
    res.status(500).json({ error: 'Failed to fetch owned projects' });
  }
});

// GET /api/projects/:projectId
router.get('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr) {
      console.error('Failed to fetch project:', projectErr.message);
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access: owner or accepted member
    const { data: memberRow, error: memberErr } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .single();

    const isOwner = project.owner_id === userId;
    const isMember = !!memberRow;

    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Access denied to project' });
    }

    // Fetch members
    const { data: members } = await supabase
      .from('project_members')
      .select('id, project_id, user_id, role, status, invited_at, joined_at, created_at')
      .eq('project_id', projectId);

    // Fetch assigned devices
    const { data: projectDevices } = await supabase
      .from('project_devices')
      .select('device_id, is_syncing, sync_percentage, last_sync')
      .eq('project_id', projectId);

    res.json({ project, members: members || [], devices: projectDevices || [] });
  } catch (error) {
    console.error('Get project exception:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// PUT /api/projects/:projectId - Update project (owner only)
router.put('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, description, local_path } = req.body;
    const userId = (req as any).user.id;

    // Verify project exists and user is owner
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can update' });
    }

    // Build update payload with only provided fields
    const updatePayload: any = {};
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (local_path !== undefined) updatePayload.local_path = local_path;

    // Update project
    const { data: updatedProject, error: updateErr } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId)
      .select()
      .single();

    if (updateErr) {
      console.error('Failed to update project:', updateErr.message);
      return res.status(500).json({ error: 'Failed to update project' });
    }

    res.json({ project: updatedProject });
  } catch (error) {
    console.error('Update project exception:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:projectId - Delete project (owner only)
router.delete('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify project exists and user is owner
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can delete' });
    }

    // Delete Syncthing folder (optional - fails gracefully)
    try {
      if (project.syncthing_folder_id) {
        const syncthingService = new SyncthingService(
          process.env.SYNCTHING_API_KEY || '',
          process.env.SYNCTHING_HOST || 'localhost',
          parseInt(process.env.SYNCTHING_PORT || '8384')
        );

        // Delete the folder from Syncthing
        // This will pause the folder and remove all shared devices
        await syncthingService.deleteFolder(project.syncthing_folder_id);
        console.log(`Deleted Syncthing folder ${project.syncthing_folder_id}`);
      }
    } catch (syncErr) {
      console.warn(`Failed to delete Syncthing folder: ${syncErr}`);
      // Continue anyway - database cleanup is more important
    }

    // Delete snapshots from Supabase Storage (optional - fails gracefully)
    try {
      if (projectId) {
        // List all snapshots for this project
        const { data: files, error: listErr } = await supabase.storage
          .from('project-snapshots')
          .list(projectId);

        if (!listErr && files && files.length > 0) {
          // Delete all snapshot files
          const toDelete = files.map((f) => `${projectId}/${f.name}`);
          const { error: deleteStorageErr } = await supabase.storage
            .from('project-snapshots')
            .remove(toDelete);

          if (deleteStorageErr) {
            console.warn(`Failed to delete snapshots: ${deleteStorageErr}`);
          } else {
            console.log(`Deleted ${toDelete.length} snapshots for project ${projectId}`);
          }
        }
      }
    } catch (storageErr) {
      console.warn(`Failed to clean up snapshots: ${storageErr}`);
      // Continue anyway
    }

    // Delete all members first (cascade)
    await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId);

    // Delete all devices associations
    await supabase
      .from('project_devices')
      .delete()
      .eq('project_id', projectId);

    // Delete all sync events
    await supabase
      .from('sync_events')
      .delete()
      .eq('project_id', projectId);

    // Delete the project
    const { error: deleteErr } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (deleteErr) {
      console.error('Failed to delete project:', deleteErr.message);
      return res.status(500).json({ error: 'Failed to delete project' });
    }

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project exception:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// POST /api/projects/:projectId/invite
router.post('/:projectId/invite', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { email, role } = req.body;
    const inviter = (req as any).user.id;

    if (!email) return res.status(400).json({ error: 'Email required' });

    // Create a pending membership entry (real invite/email sending can be added later)
    const payload = {
      project_id: projectId,
      user_id: null,
      role: role || 'viewer',
      invited_by: inviter,
      invited_at: new Date().toISOString(),
      status: 'pending',
    };

    // Note: We store email invitations in audit_logs or a dedicated invitations table in future
    const { data, error } = await supabase.from('project_members').insert(payload).select().single();

    if (error) {
      console.error('Failed to create invitation:', error.message);
      return res.status(500).json({ error: 'Failed to create invitation' });
    }

    res.status(201).json({ invitation: data });
  } catch (error) {
    console.error('Invite exception:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// POST /api/projects/:projectId/invite-token - Generate shareable invite token
router.post('/:projectId/invite-token', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify project ownership
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can generate invite codes' });
    }

    // Generate a unique invite token (simple base64 encoding of projectId + timestamp + random)
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 10);
    const tokenData = `${projectId}:${timestamp}:${random}`;
    const token = Buffer.from(tokenData).toString('base64').substring(0, 16);

    // Store the token in a temporary invitations table or cache with expiry
    // For now, we'll create an entry in audit logs or return the token directly
    const invitePayload = {
      project_id: projectId,
      invite_token: token,
      created_by: userId,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      is_active: true,
    };

    // Insert into a project_invites table if it exists, otherwise just return the token
    const { data: invite, error: inviteErr } = await supabase
      .from('project_invites')
      .insert(invitePayload)
      .select()
      .single();

    if (inviteErr) {
      console.warn('Failed to store invite token:', inviteErr.message);
      console.warn('Invite payload:', invitePayload);
      console.warn('Proceeding with token generation despite storage failure');
      // Still return the token even if storage fails
      return res.json({ token });
    }

    res.json({ token: invite.invite_token || token });
  } catch (error) {
    console.error('Generate invite token exception:', error);
    res.status(500).json({ error: 'Failed to generate invite token' });
  }
});

// POST /api/projects/join - Join a project using an invite token
router.post('/join', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { invite_code } = req.body;
    const userId = (req as any).user.id;

    if (!invite_code) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    // Find the invitation
    console.log('invite_code: ', invite_code);
    const { data: invite, error: inviteErr } = await supabase
      .from('project_invites')
      .select('*')
      .eq('invite_token', invite_code)
      .eq('is_active', true)
      .single();

    if (inviteErr || !invite) {
      return res.status(404).json({ error: 'Invalid or expired invite code' });
    }

    // Check if invite is expired
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Invite code has expired' });
    }

    const projectId = invite.project_id;

    // Check if user is already a member
    const { data: existingMember, error: existingErr } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      return res.status(400).json({ error: 'You are already a member of this project' });
    }

    // Add user as a member of the project
    const { data: member, error: memberErr } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: userId,
        role: 'viewer',
        invited_by: invite.created_by,
        invited_at: invite.created_at,
        joined_at: new Date().toISOString(),
        status: 'accepted',
      })
      .select()
      .single();

    if (memberErr) {
      console.error('Failed to add project member:', memberErr.message);
      return res.status(500).json({ error: 'Failed to join project' });
    }

    // Update invite usage tracking
    const { error: updateErr } = await supabase
      .from('project_invites')
      .update({
        used_count: (invite.used_count || 0) + 1,
        last_used_at: new Date().toISOString(),
        last_used_by: userId,
      })
      .eq('id', invite.id);

    if (updateErr) {
      console.warn('Failed to update invite usage:', updateErr.message);
      // Don't fail the join operation if we can't track usage
    }

    // Get the full project details
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr) {
      return res.status(500).json({ error: 'Failed to fetch project details' });
    }

    // Auto-add user's device to Syncthing folder (optional)
    try {
      if (project.syncthing_folder_id) {
        // Get user's primary Syncthing device ID
        const { data: userDevices, error: devErr } = await supabase
          .from('devices')
          .select('syncthing_id')
          .eq('user_id', userId)
          .limit(1);

        // Get owner's Syncthing API key from devices table (stored during device registration)
        const { data: ownerDevices, error: ownerDevErr } = await supabase
          .from('devices')
          .select('syncthing_id')
          .eq('user_id', project.owner_id)
          .limit(1);

        if (
          !devErr && userDevices && userDevices.length > 0 && userDevices[0].syncthing_id &&
          !ownerDevErr && ownerDevices && ownerDevices.length > 0 && ownerDevices[0].syncthing_id
        ) {
          const syncthingService = new SyncthingService(
            process.env.SYNCTHING_API_KEY || '',
            process.env.SYNCTHING_HOST || 'localhost',
            parseInt(process.env.SYNCTHING_PORT || '8384')
          );

          // Add the invited user's device to the folder
          await syncthingService.addDeviceToFolder(
            project.syncthing_folder_id,
            userDevices[0].syncthing_id
          );

          console.log(`Auto-added device to Syncthing folder for project ${projectId}`);
        }
      }
    } catch (syncErr) {
      console.warn(`Failed to auto-add device to Syncthing folder: ${syncErr}`);
      // Continue anyway - device can be added manually later
    }

    // Generate snapshot when user joins (optional)
    try {
      const mockFiles = [
        {
          path: project.name + '/file.txt',
          name: 'file.txt',
          type: 'file' as const,
          size: 1024,
          hash: '',
          modifiedAt: new Date().toISOString(),
        },
      ];

      await FileMetadataService.saveSnapshot(
        projectId,
        project.name,
        mockFiles
      );

      console.log(`Generated snapshot when user joined project ${projectId}`);
    } catch (snapshotErr) {
      console.warn(`Failed to generate snapshot on join: ${snapshotErr}`);
      // Continue anyway
    }

    res.status(200).json({ 
      message: 'Successfully joined project',
      project 
    });
  } catch (error) {
    console.error('Join project exception:', error);
    res.status(500).json({ error: 'Failed to join project' });
  }
});

// POST /api/projects/:projectId/devices -> assign device to project
router.post('/:projectId/devices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { deviceId } = req.body; // this should be the devices.id (uuid)
    const userId = (req as any).user.id;

    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    // Verify project ownership or membership
    const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isOwner = project.owner_id === userId;
    const { data: membership } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .single();

    if (!isOwner && !membership) return res.status(403).json({ error: 'Access denied' });

    // Insert into project_devices
    const payload = {
      project_id: projectId,
      device_id: deviceId,
      is_syncing: true,
      sync_percentage: 0,
    };

    const { data, error } = await supabase.from('project_devices').insert(payload).select().single();
    if (error) {
      console.error('Failed to assign device to project:', error.message);
      return res.status(500).json({ error: 'Failed to assign device' });
    }

    res.status(201).json({ assigned: data });
  } catch (error) {
    console.error('Assign device exception:', error);
    res.status(500).json({ error: 'Failed to assign device' });
  }
});

// DELETE /api/projects/:projectId/devices/:deviceId -> unassign
router.delete('/:projectId/devices/:deviceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId, deviceId } = req.params;
    const userId = (req as any).user.id;

    const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isOwner = project.owner_id === userId;
    const { data: membership } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .single();

    if (!isOwner && !membership) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('project_devices')
      .delete()
      .eq('project_id', projectId)
      .eq('device_id', deviceId);

    if (error) {
      console.error('Failed to unassign device:', error.message);
      return res.status(500).json({ error: 'Failed to unassign device' });
    }

    res.json({ message: 'Device unassigned', deleted: data });
  } catch (error) {
    console.error('Unassign device exception:', error);
    res.status(500).json({ error: 'Failed to unassign device' });
  }
});

// GET /api/projects/:projectId/sync-events?file=<file>&limit=1
router.get('/:projectId/sync-events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { file, limit } = req.query;

    let q = supabase.from('sync_events').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    if (file && typeof file === 'string') {
      q = q.eq('file_path', file);
    }

    if (limit) {
      const n = parseInt(String(limit), 10) || 10;
      q = (q as any).limit(n);
    } else {
      q = (q as any).limit(50);
    }

    const { data, error } = await q;
    if (error) {
      console.error('Failed to fetch sync events:', error.message);
      return res.status(500).json({ error: 'Failed to fetch sync events' });
    }

    res.json({ events: data || [] });
  } catch (error) {
    console.error('Sync events exception:', error);
    res.status(500).json({ error: 'Failed to fetch sync events' });
  }
});

// ================== PHASE 1: SYNCTHING-FIRST ENDPOINTS ==================

/**
 * GET /api/projects/:projectId/files-list
 * Paginated file list from project_file_snapshots
 * For invitees/members to browse files
 */
router.get('/:projectId/files-list', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { limit = '500', offset = '0' } = req.query;
    const userId = (req as any).user.id;

    // Verify user is member (owner or accepted invite)
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;

    if (!isOwner) {
      const { data: member } = await supabase
        .from('project_members')
        .select('status')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const pageLimit = Math.min(1000, Math.max(10, parseInt(String(limit), 10) || 500));
    const pageOffset = Math.max(0, parseInt(String(offset), 10) || 0);

    // Get total count
    const { count } = await supabase
      .from('project_file_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    const total = count || 0;

    // Get paginated files
    const { data: files, error } = await supabase
      .from('project_file_snapshots')
      .select('file_path, is_directory, size, file_hash, modified_at')
      .eq('project_id', projectId)
      .order('file_path', { ascending: true })
      .range(pageOffset, pageOffset + pageLimit - 1);

    if (error) {
      console.error('Failed to fetch files:', error.message);
      return res.status(500).json({ error: 'Failed to fetch files' });
    }

    res.json({
      files: files || [],
      pagination: {
        total,
        limit: pageLimit,
        offset: pageOffset,
        hasMore: pageOffset + pageLimit < total,
      },
    });
  } catch (error) {
    console.error('Get files-list exception:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

/**
 * GET /api/projects/:projectId/snapshot-metadata
 * Returns current snapshot version + metadata
 */
router.get('/:projectId/snapshot-metadata', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify user is member (owner or accepted invite)
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;

    if (!isOwner) {
      const { data: member } = await supabase
        .from('project_members')
        .select('status')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get snapshot metadata
    const { data: snapshot, error } = await supabase
      .from('project_sync_state')
      .select('snapshot_version, last_snapshot_at, total_files, total_size, root_hash')
      .eq('project_id', projectId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    res.json(snapshot);
  } catch (error) {
    console.error('Get snapshot-metadata exception:', error);
    res.status(500).json({ error: 'Failed to fetch snapshot metadata' });
  }
});

/**
 * PUT /api/projects/:projectId/refresh-snapshot
 * Force refresh of file snapshot from owner's device
 * Owner only
 */
router.put('/:projectId/refresh-snapshot', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify user is owner
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, local_path')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only owner can refresh snapshot' });
    }

    // TODO: Scan project folder and update snapshots
    // For now, just update the timestamp and increment version
    const { data: currentState } = await supabase
      .from('project_sync_state')
      .select('snapshot_version')
      .eq('project_id', projectId)
      .single();

    const newVersion = (currentState?.snapshot_version || 0) + 1;

    const { error: updateErr } = await supabase
      .from('project_sync_state')
      .update({
        snapshot_version: newVersion,
        last_snapshot_at: new Date().toISOString(),
      })
      .eq('project_id', projectId);

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message });
    }

    res.json({ success: true, message: 'Snapshot refresh triggered', snapshot_version: newVersion });
  } catch (error) {
    console.error('Refresh snapshot exception:', error);
    res.status(500).json({ error: 'Failed to refresh snapshot' });
  }
});

/**
 * POST /api/projects/:projectId/sync-start
 * Trigger Syncthing to start syncing to member's device
 */
router.post('/:projectId/sync-start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { deviceId, syncthingApiKey } = req.body;
    const userId = (req as any).user.id;

    if (!deviceId || !syncthingApiKey) {
      return res.status(400).json({ error: 'deviceId and syncthingApiKey required' });
    }

    // Verify user is owner (only owner can start syncs)
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name, local_path')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can start sync' });
    }

    if (!project.local_path) {
      return res.status(400).json({ error: 'Project has no local_path configured' });
    }

    // Initialize Syncthing service
    const syncthingService = new SyncthingService(syncthingApiKey);

    // Test connection
    const isConnected = await syncthingService.testConnection();
    if (!isConnected) {
      return res.status(503).json({ error: 'Cannot connect to Syncthing service' });
    }

    // Add device to folder (enable syncing)
    await syncthingService.addDeviceToFolder(projectId, deviceId);

    // Trigger initial folder scan
    await syncthingService.scanFolder(projectId);

    // Get folder status
    const status = await syncthingService.getFolderStatus(projectId);

    res.json({
      success: true,
      message: 'Sync started successfully',
      projectId,
      projectName: project.name,
      deviceId,
      folderStatus: status,
    });
  } catch (error) {
    console.error('Sync-start exception:', error);
    res.status(500).json({ error: `Failed to start sync: ${(error as Error).message}` });
  }
});

/**
 * POST /api/projects/:projectId/pause-sync
 * Pause syncing for a project
 * - For owner: pauses the Syncthing folder
 * - For invited member: removes their device from the folder
 */
router.post('/:projectId/pause-sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Get project details
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name, syncthing_folder_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user is owner or member
    const isOwner = project.owner_id === userId;
    let isMember = false;

    if (!isOwner) {
      const { data: membership } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      isMember = !!membership;
    }

    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Initialize Syncthing service (use server-side API key)
    const syncthingService = new SyncthingService(
      process.env.SYNCTHING_API_KEY || '',
      process.env.SYNCTHING_HOST || 'localhost',
      parseInt(process.env.SYNCTHING_PORT || '8384')
    );

    if (isOwner) {
      // Owner: pause the entire folder
      await syncthingService.pauseFolder(project.syncthing_folder_id);
    } else {
      // Member: remove their device from the folder
      const { data: userDevice } = await supabase
        .from('devices')
        .select('syncthing_id')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (userDevice?.syncthing_id) {
        await syncthingService.removeDeviceFromFolder(
          project.syncthing_folder_id,
          userDevice.syncthing_id
        );
      }
    }

    res.json({
      success: true,
      message: isOwner ? 'Sync paused successfully' : 'Sync removed successfully',
      projectId,
      projectName: project.name,
      userRole: isOwner ? 'owner' : 'member',
    });
  } catch (error) {
    console.error('Pause-sync exception:', error);
    res.status(500).json({ error: `Failed to pause sync: ${(error as Error).message}` });
  }
});

/**
 * POST /api/projects/:projectId/resume-sync
 * Resume syncing for a project
 * - For owner: resumes the Syncthing folder
 * - For invited member: adds their device back to the folder
 */
router.post('/:projectId/resume-sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Get project details
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name, syncthing_folder_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user is owner or member
    const isOwner = project.owner_id === userId;
    let isMember = false;

    if (!isOwner) {
      const { data: membership } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      isMember = !!membership;
    }

    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Initialize Syncthing service (use server-side API key)
    const syncthingService = new SyncthingService(
      process.env.SYNCTHING_API_KEY || '',
      process.env.SYNCTHING_HOST || 'localhost',
      parseInt(process.env.SYNCTHING_PORT || '8384')
    );

    if (isOwner) {
      // Owner: resume the entire folder
      await syncthingService.resumeFolder(project.syncthing_folder_id);
    } else {
      // Member: add their device back to the folder
      const { data: userDevice } = await supabase
        .from('devices')
        .select('syncthing_id')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (userDevice?.syncthing_id) {
        await syncthingService.addDeviceToFolder(
          project.syncthing_folder_id,
          userDevice.syncthing_id
        );
      }
    }

    res.json({
      success: true,
      message: isOwner ? 'Sync resumed successfully' : 'Sync added successfully',
      projectId,
      projectName: project.name,
      userRole: isOwner ? 'owner' : 'member',
    });
  } catch (error) {
    console.error('Resume-sync exception:', error);
    res.status(500).json({ error: `Failed to resume sync: ${(error as Error).message}` });
  }
});

/**
 * POST /api/projects/:projectId/sync-stop
 * Stop syncing - remove device from project folder
 */
router.post('/:projectId/sync-stop', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { deviceId, syncthingApiKey } = req.body;
    const userId = (req as any).user.id;

    if (!deviceId || !syncthingApiKey) {
      return res.status(400).json({ error: 'deviceId and syncthingApiKey required' });
    }

    // Verify user is owner
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can stop sync' });
    }

    // Initialize Syncthing service
    const syncthingService = new SyncthingService(syncthingApiKey);

    // Remove device from folder
    await syncthingService.removeDeviceFromFolder(projectId, deviceId);

    res.json({
      success: true,
      message: 'Sync stopped successfully',
      projectId,
      projectName: project.name,
      deviceId,
    });
  } catch (error) {
    console.error('Sync-stop exception:', error);
    res.status(500).json({ error: `Failed to stop sync: ${(error as Error).message}` });
  }
});

/**
 * GET /api/projects/:projectId/sync-status
 * Get current sync status for a project
 */
router.get('/:projectId/sync-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { syncthingApiKey } = req.query;
    const userId = (req as any).user.id;

    // Verify user has access
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;
    if (!isOwner) {
      const { data: member } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // If no API key provided, return basic status
    if (!syncthingApiKey) {
      return res.json({
        state: 'unknown',
        globalBytes: 0,
        localBytes: 0,
        needsBytes: 0,
        message: 'Provide syncthingApiKey query parameter for detailed status',
      });
    }

    // Initialize Syncthing service and get status
    const syncthingService = new SyncthingService(String(syncthingApiKey));
    const status = await syncthingService.getFolderStatus(projectId);

    res.json({
      state: status.state || 'idle',
      globalBytes: status.global?.bytes || 0,
      localBytes: status.local?.bytes || 0,
      needsBytes: status.needsBytes || 0,
      fullStatus: status,
    });
  } catch (error) {
    console.error('Sync-status exception:', error);
    res.status(500).json({ error: `Failed to get sync status: ${(error as Error).message}` });
  }
});

// ================== END PHASE 1 ENDPOINTS ==================

// GET /api/projects/:projectId/files - Get file tree from local path (OWNER ONLY)
// For members, use /files-list instead
router.get('/:projectId/files', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;
    const { maxDepth = 4 } = req.query;
    const maxDepthLimit = Math.min(parseInt(String(maxDepth), 10) || 4, 10);

    // Fetch project
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access: owner only (this endpoint is for local file system browsing)
    // Members should use /files-paginated instead (remote files with pagination)
    if (project.owner_id !== userId) {
      return res.status(403).json({ 
        error: 'Access denied - only project owner can browse local files',
        note: 'Members should use /files-paginated endpoint to view shared files'
      });
    }

    if (!project.local_path) {
      return res.json({ files: [], folder: null });
    }

    // Safely read directory
    // depth starts at 0 for the root, so depth <= maxDepthLimit allows scanning files at the max level
    const scanDirectory = (dirPath: string, depth: number): any[] => {
      try {
        if (!fs.existsSync(dirPath)) {
          return [];
        }

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
          .filter((entry) => !entry.name.startsWith('.')) // Skip hidden files
          .map((entry) => {
            try {
              const fullPath = path.join(dirPath, entry.name);
              const stats = fs.statSync(fullPath);

              if (entry.isDirectory()) {
                // Only scan children if we haven't reached the depth limit yet
                // This allows folders at maxDepth to be shown, but their children won't be populated
                const shouldScanChildren = depth < maxDepthLimit;
                return {
                  name: entry.name,
                  type: 'folder',
                  size: 0,
                  modified: stats.mtime.toISOString(),
                  children: shouldScanChildren ? scanDirectory(fullPath, depth + 1) : [],
                };
              } else {
                return {
                  name: entry.name,
                  type: 'file',
                  size: stats.size,
                  modified: stats.mtime.toISOString(),
                };
              }
            } catch (err) {
              console.warn(`Failed to stat ${entry.name}:`, err);
              return null;
            }
          })
          .filter(Boolean);
      } catch (err) {
        console.error(`Failed to read directory ${dirPath}:`, err);
        return [];
      }
    };

    const files = scanDirectory(project.local_path, 0);

    res.json({ files, folder: project.local_path });
  } catch (error) {
    console.error('Get files exception:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// GET /api/projects/:projectId/files-paginated - Paginated remote files for invitees
router.get('/:projectId/files-paginated', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { path: folderPath = '/', page = '1', per_page = '100' } = req.query;
    const userId = (req as any).user.id;

    // Parse pagination params
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const perPage = Math.min(500, Math.max(10, parseInt(String(per_page), 10) || 100)); // Cap at 500 items

    // Fetch project
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access: owner or accepted member
    const isOwner = project.owner_id === userId;
    const { data: member } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .single();

    if (!isOwner && !member) {
      return res.status(403).json({ error: 'Access denied to project' });
    }

    // Build path filter for folder navigation
    // If path is '/', show top-level files
    // Otherwise, show files whose path starts with folderPath
    const pathFilter = folderPath === '/' ? '%' : `${String(folderPath)}%`;

    // Fetch total count
    const { count } = await supabase
      .from('remote_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .like('path', pathFilter)
      .is('deleted_by', null);

    // Fetch paginated files
    const offset = (pageNum - 1) * perPage;
    const { data: files, error: filesErr } = await supabase
      .from('remote_files')
      .select('*')
      .eq('project_id', projectId)
      .like('path', pathFilter)
      .is('deleted_by', null)
      .order('is_directory', { ascending: false })  // Folders first
      .order('name')                                 // Then by name
      .range(offset, offset + perPage - 1);

    if (filesErr) {
      console.error('Failed to fetch remote files:', filesErr.message);
      return res.status(500).json({ error: 'Failed to fetch files' });
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / perPage);
    const hasMore = pageNum < totalPages;

    res.json({
      success: true,
      files: files || [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: totalCount,
        total_pages: totalPages,
        has_more: hasMore,
      },
      path: folderPath,
    });
  } catch (error) {
    console.error('Get paginated files exception:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// POST /api/projects/:projectId/files-sync - Scan and store file metadata from Syncthing folder
// Called by owner's device to publish file list for invitees
router.post('/:projectId/files-sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify ownership
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can sync files' });
    }

    // For now, return a message indicating this would scan the Syncthing folder
    // In production, this would:
    // 1. Call Syncthing REST API to list files
    // 2. Store metadata in remote_files table
    // 3. Update sync status badges
    res.json({
      success: true,
      message: 'File sync initiated',
      note: 'In production, this endpoint would scan the Syncthing folder and update file metadata',
    });
  } catch (error) {
    console.error('File sync exception:', error);
    res.status(500).json({ error: 'Failed to sync files' });
  }
});

// POST /api/projects/:projectId/files/update - Owner posts file changes (deltas)
// Phase 2B: Delta-first sync - only changed files sent (99% bandwidth savings)
// Called by: electron app's file watcher service
// Payload: [{path, op: 'create|update|delete', hash, mtime, size}]
router.post('/:projectId/files/update', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { changes } = req.body;
    const userId = (req as any).user.id;

    // Check access: owner only
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only project owner can update files' });
    }

    // Validate changes
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    // Limit changes per request (prevent abuse)
    if (changes.length > 1000) {
      return res.status(400).json({ error: 'Too many changes in single request (max 1000)' });
    }

    // Process each change
    const results: any[] = [];
    for (const change of changes) {
      const { path: filePath, op, hash, mtime, size } = change;

      if (!filePath || !op) {
        continue;
      }

      try {
        if (op === 'delete') {
          // Soft delete: mark as deleted but keep record for history
          const { error: updateErr } = await supabase
            .from('remote_files')
            .update({
              deleted_by: userId,
              deleted_at: new Date().toISOString(),
            })
            .eq('project_id', projectId)
            .eq('path', filePath);

          if (!updateErr) {
            results.push({ path: filePath, op: 'delete', status: 'success' });
          }
        } else {
          // Upsert file: create or update on (project_id, path)
          const { error: upsertErr } = await supabase
            .from('remote_files')
            .upsert({
              project_id: projectId,
              path: filePath,
              name: filePath.split('/').pop() || filePath,
              size: size || 0,
              is_directory: false,
              mime_type: getMimeType(filePath),
              file_hash: hash || '',
              modified_at: new Date(mtime || Date.now()).toISOString(),
              owner_id: userId,
            })
            .eq('project_id', projectId)
            .eq('path', filePath);

          if (!upsertErr) {
            results.push({ path: filePath, op, status: 'success' });
          }
        }

        // Append to project_events (immutable delta log)
        const { data: lastEvent } = await supabase
          .from('project_events')
          .select('seq')
          .eq('project_id', projectId)
          .order('seq', { ascending: false })
          .limit(1)
          .single();

        const seq = (lastEvent?.seq || 0) + 1;

        const eventData = {
          project_id: projectId,
          seq,
          change: { path: filePath, op, hash, mtime, size },
          created_at: new Date().toISOString(),
        };

        await supabase.from('project_events').insert(eventData);

        // Phase 2C: Broadcast to all WebSocket subscribers (real-time sync)
        try {
          const wsService = getWebSocketService();
          wsService.broadcastProjectEvent(projectId, eventData);
        } catch (error) {
          // WebSocket is optional - log but don't fail if not available
          console.debug('[Phase 2C] WebSocket broadcast skipped:', error);
        }
      } catch (error) {
        console.error(`Error processing change for ${filePath}:`, error);
        results.push({ path: filePath, op, status: 'error' });
      }
    }

    res.json({
      success: true,
      changes_processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Update files exception:', error);
    res.status(500).json({ error: 'Failed to update files' });
  }
});

// GET /api/projects/:projectId/events - Pull deltas since sequence number
// Phase 2B: Incremental fetch - only new events sent (for polling fallback)
// Called by: electron app to pull missed events or when reconnecting
// Query params: since_seq (default 0), limit (default 100, max 500)
router.get('/:projectId/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { since_seq = '0', limit = '100' } = req.query;
    const userId = (req as any).user.id;

    // Check access: owner or accepted member
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;

    if (!isOwner) {
      const { data: membership, error: memErr } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      if (memErr || !membership) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Fetch events since sequence
    const sinceSeq = Math.max(0, parseInt(String(since_seq), 10) || 0);
    const limitNum = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 100));

    const { data: events, error: eventsErr } = await supabase
      .from('project_events')
      .select('*')
      .eq('project_id', projectId)
      .gt('seq', sinceSeq)
      .order('seq', { ascending: true })
      .limit(limitNum);

    if (eventsErr) {
      console.error('Error fetching events:', eventsErr);
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    const eventList = events || [];
    const lastSeq = eventList.length > 0 ? eventList[eventList.length - 1].seq : sinceSeq;

    res.json({
      success: true,
      events: eventList,
      last_seq: lastSeq,
      has_more: eventList.length === limitNum,
    });
  } catch (error) {
    console.error('Get events exception:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Helper function to guess MIME type from filename
function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const mimeMap: { [key: string]: string } = {
    // Video
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    webm: 'video/webm',
    
    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    
    // Documents
    pdf: 'application/pdf',
    txt: 'text/plain',
    json: 'application/json',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * POST /api/projects/:projectId/generate-snapshot
 * Generate file metadata snapshot from Syncthing folder
 * Called when project is created or user joins
 */
router.post('/:projectId/generate-snapshot', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Get project details
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name, syncthing_folder_id, local_path')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user is owner or member
    const isOwner = project.owner_id === userId;
    let isMember = false;

    if (!isOwner) {
      const { data: membership } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      isMember = !!membership;
    }

    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // For now, create a simple snapshot structure
    // In production, this would scan the actual Syncthing folder
    const mockFiles = [
      {
        path: 'README.md',
        name: 'README.md',
        type: 'file' as const,
        size: 2048,
        hash: 'abc123',
        modifiedAt: new Date().toISOString(),
      },
      {
        path: 'documents',
        name: 'documents',
        type: 'folder' as const,
        children: [
          {
            path: 'documents/report.pdf',
            name: 'report.pdf',
            type: 'file' as const,
            size: 1024000,
            hash: 'def456',
            modifiedAt: new Date().toISOString(),
          },
        ],
      },
    ];

    // Save snapshot using FileMetadataService
    const snapshotResult = await FileMetadataService.saveSnapshot(
      projectId,
      project.name,
      mockFiles
    );

    // Cleanup old snapshots
    await FileMetadataService.cleanupOldSnapshots(projectId);

    res.json({
      success: true,
      message: 'Snapshot generated successfully',
      snapshot: {
        url: snapshotResult.snapshotUrl,
        size: snapshotResult.snapshotSize,
        createdAt: snapshotResult.createdAt,
      },
    });
  } catch (error) {
    console.error('Generate snapshot exception:', error);
    res.status(500).json({ error: `Failed to generate snapshot: ${(error as Error).message}` });
  }
});

export default router;

