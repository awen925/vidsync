import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';

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

export default router;
