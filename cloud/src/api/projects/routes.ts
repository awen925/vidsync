import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// POST /api/projects
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description, local_path, auto_sync } = req.body;
    const ownerId = (req as any).user.id;

    if (!name) return res.status(400).json({ error: 'Project name required' });

    const payload = {
      owner_id: ownerId,
      name,
      description: description || null,
      local_path: local_path || null,
      auto_sync: typeof auto_sync === 'boolean' ? auto_sync : true,
    };

    const { data, error } = await supabase.from('projects').insert(payload).select().single();

    if (error) {
      console.error('Failed to create project:', error.message);
      return res.status(500).json({ error: 'Failed to create project' });
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

    // Get project details with owner info
    const { data: projects, error: projectsErr } = await supabase
      .from('projects')
      .select('*,owner:owner_id(id,email)')
      .in('id', projectIds);

    if (projectsErr) {
      console.error('Failed to fetch invited projects:', projectsErr.message);
      return res.status(500).json({ error: 'Failed to fetch invited projects' });
    }

    res.json({ projects: projects || [] });
  } catch (error) {
    console.error('Get invited projects exception:', error);
    res.status(500).json({ error: 'Failed to fetch invited projects' });
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
      console.warn('Failed to store invite token (table may not exist):', inviteErr.message);
      // Still return the token even if storage fails
      return res.json({ token });
    }

    res.json({ token: invite.invite_token || token });
  } catch (error) {
    console.error('Generate invite token exception:', error);
    res.status(500).json({ error: 'Failed to generate invite token' });
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

// GET /api/projects/:projectId/files - Get file tree from local path
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

    // Check access: owner only (can't browse invited projects this way)
    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied - only project owner can browse files' });
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

export default router;
