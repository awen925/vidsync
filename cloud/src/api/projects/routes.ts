import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';
import { getWebSocketService } from '../../services/webSocketService';
import { SyncthingService } from '../../services/syncthingService';
import { FileMetadataService } from '../../services/fileMetadataService';
import { getSyncthingConfig } from '../../utils/syncthingConfig';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// ============================================================================
// CACHE: Sync status cache with TTL
// ============================================================================
const syncStatusCache = new Map<string, {
  data: any;
  expiresAt: number;
}>();

function getCachedSyncStatus(projectId: string): any | null {
  const cached = syncStatusCache.get(projectId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  syncStatusCache.delete(projectId);
  return null;
}

function setCachedSyncStatus(projectId: string, data: any, ttlMs: number = 5000): void {
  syncStatusCache.set(projectId, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

// POST /api/projects
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now();
  let projectId: string | null = null;
  
  try {
    const { name, description, local_path, auto_sync } = req.body;
    const ownerId = (req as any).user.id;

    if (!name) return res.status(400).json({ error: 'Project name required' });

    // Check for duplicate: same local_path for same owner (if local_path provided)
    if (local_path && local_path.trim().length > 0) {
      console.log(`[Project:${name}] Checking for duplicate project with local_path: ${local_path}`);

      // Check if a project with same local_path already exists for this owner
      const { data: existingProjects, error: dupErr } = await supabase
        .from('projects')
        .select('id, name, local_path')
        .eq('owner_id', ownerId)
        .eq('local_path', local_path);

      if (!dupErr && existingProjects && existingProjects.length > 0) {
        const existing = existingProjects[0];
        console.log(`[Project:${name}] ⚠️  Duplicate found: ${existing.name} (${existing.id})`);
        return res.status(409).json({
          error: `Project with path "${local_path}" already exists as "${existing.name}"`,
          code: 'DUPLICATE_PROJECT_PATH',
          existingProjectId: existing.id,
          existingProjectName: existing.name,
        });
      }
    }

    const payload = {
      owner_id: ownerId,
      name,
      description: description || null,
      local_path: local_path || null,
      auto_sync: typeof auto_sync === 'boolean' ? auto_sync : true,
    };

    console.log(`[Project:${name}] Step 1: Creating project in database...`);

    const { data, error } = await supabase.from('projects').insert(payload).select().single();

    if (error) {
      console.error(`[Project:${name}] ✗ Failed to create project in DB: ${error.message}`);
      return res.status(500).json({ error: 'Failed to create project' });
    }

    projectId = data.id;
    console.log(`[Project:${projectId}] ✅ Step 1: Project created in DB`);

    // Initialize SyncthingService early (always needed for checking/waiting)
    const syncConfig = getSyncthingConfig();
    const syncthingService = new SyncthingService(
      syncConfig.apiKey,
      syncConfig.host,
      syncConfig.port
    );

    // Get owner's primary device with Syncthing ID
    console.log(`[Project:${projectId}] Step 2: Getting device info...`);
    const { data: devices, error: devErr } = await supabase
      .from('devices')
      .select('syncthing_id')
      .eq('user_id', ownerId)
      .limit(1);

    const hasDevice = !devErr && devices && devices.length > 0 && devices[0].syncthing_id;
    if (hasDevice) {
      const deviceId = devices[0].syncthing_id as string;
      console.log(`[Project:${projectId}] ✅ Step 2: Device found (${deviceId})`);

      // Step 3: Create Syncthing folder (only if we have a device)
      console.log(`[Project:${projectId}] Step 3: Sending folder create request to Syncthing...`);
      try {
        await syncthingService.createFolder(
          projectId as string,
          name,
          local_path || `/tmp/vidsync/${projectId}`,
          deviceId
        );
        console.log(`[Project:${projectId}] ✅ Step 3: Folder create request sent`);
      } catch (createErr: any) {
        console.error(`[Project:${projectId}] ✗ Failed to create Syncthing folder: ${createErr.message}`);
        throw new Error(`Syncthing folder creation failed: ${createErr.message}`);
      }
    } else {
      console.warn(`[Project:${projectId}] ⚠️  No device found in DB, skipping folder create (but folder may already exist in Syncthing)`);
      console.log(`[Project:${projectId}] Step 3: Skipped (no device)`);
    }

    // Step 4: Verify folder exists in Syncthing (critical!)
    console.log(`[Project:${projectId}] Step 4: Verifying folder exists in Syncthing...`);
    const folderExists = await syncthingService.verifyFolderExists(projectId as string, 10000);
    if (!folderExists) {
      console.error(`[Project:${projectId}] ✗ Folder verification failed - folder not found in Syncthing`);
      // If no device was in DB and folder doesn't exist, return project but warn user
      if (!hasDevice) {
        console.warn(`[Project:${projectId}] ⚠️  No device configured and folder not in Syncthing - returning project without snapshot`);
        return res.status(201).json({ 
          project: data,
          warning: 'No device found and folder does not exist in Syncthing - folder creation skipped'
        });
      }
      // If we tried to create it and it still doesn't exist, that's an error
      throw new Error('Folder creation verification failed');
    }
    console.log(`[Project:${projectId}] ✅ Step 4: Folder verified to exist in Syncthing`);

    // Step 5: Wait for folder to be known (event-based, more reliable than scan)
    console.log(`[Project:${projectId}] Step 5: Waiting for folder to be known to Syncthing...`);
    try {
      await syncthingService.waitForFolderKnown(projectId as string, 30000);
      console.log(`[Project:${projectId}] ✅ Step 5: Folder is known to Syncthing`);
    } catch (knownErr) {
      console.warn(`[Project:${projectId}] ⚠️  Warning: Timeout waiting for folder to be known: ${knownErr}`);
      // Continue anyway - folder might still be usable
    }

    // Step 6: Wait for index scan to complete (LocalIndexUpdated event)
    console.log(`[Project:${projectId}] Step 6: Waiting for folder to be indexed...`);
    try {
      await syncthingService.waitForFolderScanned(projectId as string, 120000); // 2 minutes for large folders
      console.log(`[Project:${projectId}] ✅ Step 6: Folder indexing complete`);
    } catch (scanErr) {
      console.warn(`[Project:${projectId}] ⚠️  Warning: Timeout waiting for index scan: ${scanErr}`);
      // Continue anyway - we can fetch files without waiting for full scan
    }

    // Step 7: Fetch file list
    console.log(`[Project:${projectId}] Step 7: Fetching file list from Syncthing...`);
    let syncFiles = null;
    const maxRetries = 5;
    const retryDelays = [500, 1000, 2000, 3000, 5000];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        
        console.log(`[Project:${projectId}] Step 7: Attempt ${attempt + 1}/${maxRetries} to fetch files...`);
        syncFiles = await syncthingService.getFolderFiles(projectId as string, 10);
        console.log(`[Project:${projectId}] ✅ Step 7: Files fetched (${syncFiles.length} items)`);
        break;
      } catch (err: any) {
        const errorMsg = err.message || String(err);
        const shouldRetry = 
          errorMsg.includes('no such folder') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ETIMEDOUT') ||
          errorMsg.includes('socket hang up');
        
        if (shouldRetry && attempt < maxRetries - 1) {
          console.warn(`[Project:${projectId}] ⚠️  Retryable error (attempt ${attempt + 1}): ${errorMsg}`);
        } else if (attempt === maxRetries - 1) {
          console.error(`[Project:${projectId}] ✗ Failed after ${maxRetries} attempts: ${errorMsg}`);
          throw err;
        }
      }
    }

    if (!syncFiles) {
      throw new Error('Failed to fetch files after all retries');
    }

    // Step 8: Generate and save snapshot
    console.log(`[Project:${projectId}] Step 8: Generating snapshot...`);
    if (syncFiles.length > 0) {
      const snapshotFiles: Array<{
        path: string;
        name: string;
        type: 'file' | 'folder';
        size: number;
        hash: string;
        modifiedAt: string;
      }> = syncFiles.map(f => ({
        path: f.path,
        name: f.name,
        type: f.type === 'file' ? 'file' : 'folder',
        size: f.size,
        hash: '',
        modifiedAt: f.modTime,
      }));

      await FileMetadataService.saveSnapshot(projectId as string, name, snapshotFiles);
      console.log(`[Project:${projectId}] ✅ Step 8: Snapshot saved (${snapshotFiles.length} files)`);
    } else {
      console.log(`[Project:${projectId}] Step 8: No files to snapshot (folder is empty)`);
    }

    // Step 9: Update project with snapshot info
    console.log(`[Project:${projectId}] Step 9: Updating project record with snapshot URL...`);
    const snapshotUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/snapshots/${projectId}-snapshot.json.gz`;
    const { data: updated } = await supabase
      .from('projects')
      .update({
        snapshot_url: snapshotUrl,
        snapshot_generated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select()
      .single();
    console.log(`[Project:${projectId}] ✅ Step 9: Project record updated`);

    const elapsed = Date.now() - startTime;
    console.log(`[Project:${projectId}] 🎉 CREATION COMPLETE in ${elapsed}ms`);

    res.status(201).json({ 
      project: updated || data,
      creationTimeMs: elapsed,
      filesCount: syncFiles?.length || 0
    });
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

    // Get project details directly (without using the view which may not exist)
    const { data: projects, error: projectsErr } = await supabase
      .from('projects')
      .select('*')
      .in('id', projectIds);

    if (projectsErr) {
      console.error('Failed to fetch invited projects:', projectsErr.message);
      return res.status(500).json({ error: 'Failed to fetch invited projects' });
    }

    // Get owner info for each project
    const ownerIds = [...new Set((projects || []).map((p: any) => p.owner_id))];
    
    // Build a map of owner info (we'll fetch user info from auth)
    // For now, just use empty owner info (email/full_name not critical for MVP)
    const transformedProjects = await Promise.all((projects || []).map(async (p: any) => {
      // Calculate file_count and total_size from snapshot if available
      let file_count = 0;
      let total_size = 0;

      if (p.snapshot_url) {
        try {
          const snapshot = await FileMetadataService.loadSnapshot(p.snapshot_url);
          const files = snapshot.files || [];
          const flatFiles = flattenFileTree(files);
          file_count = flatFiles.length;
          total_size = flatFiles.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
        } catch (err) {
          console.warn(`Failed to load snapshot for project ${p.id}:`, err);
          // Use defaults if snapshot fails
          file_count = 0;
          total_size = 0;
        }
      }

      return {
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
        snapshot_url: p.snapshot_url,
        file_count,
        total_size,
        owner: {
          id: p.owner_id,
          email: 'owner@example.com', // Not critical for MVP
          full_name: 'Project Owner',  // Not critical for MVP
        }
      };
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
      // Use project UUID as folder ID (new standard)
      const syncthingService = new SyncthingService(
        process.env.SYNCTHING_API_KEY || '',
        process.env.SYNCTHING_HOST || 'localhost',
        parseInt(process.env.SYNCTHING_PORT || '8384')
      );

      // Delete the folder from Syncthing using project UUID
      await syncthingService.deleteFolder(projectId);
      console.log(`Deleted Syncthing folder ${projectId}`);
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
// OPTIONAL: Can pass invited_email to track which email(s) can use this token
router.post('/:projectId/invite-token', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { invited_email } = req.body;
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
      invited_email: invited_email || null, // Track which email was invited
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
        // Get user's primary Syncthing device ID and device UUID
        const { data: userDevices, error: devErr } = await supabase
          .from('devices')
          .select('id, syncthing_id')
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
          const inviteeDeviceId = userDevices[0].syncthing_id;
          const inviteeDeviceUuid = userDevices[0].id;
          const syncthingService = new SyncthingService(
            process.env.SYNCTHING_API_KEY || '',
            process.env.SYNCTHING_HOST || 'localhost',
            parseInt(process.env.SYNCTHING_PORT || '8384')
          );

          // Add the invited user's device to the folder with RECEIVEONLY role
          // This ensures they can only download files, not upload/modify them
          await syncthingService.addDeviceToFolderWithRole(
            project.syncthing_folder_id,
            inviteeDeviceId,
            'receiveonly'  // ← CRITICAL: Enforce read-only access for invitees
          );

          // Record the device-project role mapping for reference
          const { error: roleErr } = await supabase
            .from('project_device_roles')
            .insert({
              project_id: projectId,
              device_id: inviteeDeviceUuid,  // Device UUID from devices table
              user_id: userId,
              role: 'viewer',  // Invitees are viewers
              folder_type: 'receiveonly',  // Syncthing enforces this
            })
            .select()
            .single();

          if (roleErr) {
            console.warn(`[Join] Failed to record device role: ${roleErr.message}`);
            // Don't fail - role is recorded at DB level but not critical for sync
          }

          console.log(`[Join] ✅ Added invitee device to Syncthing folder with receiveonly role for project ${projectId}`);
        }
      }
    } catch (syncErr) {
      console.warn(`[Join] Failed to add device to Syncthing folder: ${syncErr}`);
      // Continue anyway - device can be added manually later
    }

    // Generate snapshot when user joins (optional) - ASYNCHRONOUSLY with retry
    // User may already have files synced, so try to capture them
    (async () => {
      try {
        console.log(`[Join] Starting async snapshot generation for ${projectId}`);
        
        // Get Syncthing config
        let syncConfig;
        try {
          syncConfig = getSyncthingConfig();
        } catch (err) {
          console.warn(`[Join] Failed to get Syncthing config: ${err}`);
          return;
        }

        // Initialize SyncthingService
        const syncthingService = new SyncthingService(
          syncConfig.apiKey,
          syncConfig.host,
          syncConfig.port
        );

        // Retry logic: Try to fetch files multiple times
        let syncFiles: Array<{
          path: string;
          name: string;
          type: 'file' | 'dir';
          size: number;
          modTime: string;
          syncStatus: 'synced' | 'syncing' | 'pending' | 'error';
        }> | null = null;
        let lastError = null;
        const maxRetries = 4; // Try up to 4 times
        const retryDelays = [1000, 2000, 3000, 5000]; // Wait: 1s, 2s, 3s, 5s

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // Wait before attempting
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
            
            console.log(`[Join] Attempt ${attempt + 1}/${maxRetries} to fetch files for ${projectId}`);
            
            syncFiles = await syncthingService.getFolderFiles(projectId, 10);
            console.log(`[Join] ✅ Successfully fetched files on attempt ${attempt + 1}`);
            break; // Success, exit retry loop
          } catch (err: any) {
            lastError = err;
            const errorMsg = err.message || String(err);
            
            // Check if we should retry
            const shouldRetry = 
              errorMsg.includes('no such folder') ||
              errorMsg.includes('ECONNREFUSED') ||
              errorMsg.includes('ETIMEDOUT') ||
              errorMsg.includes('socket hang up');
            
            if (shouldRetry) {
              // Retryable error
              console.warn(`[Join] Retryable error (attempt ${attempt + 1}): ${errorMsg}`);
              if (attempt === maxRetries - 1) {
                // Last attempt, don't throw, just skip
                console.log(`[Join] Failed after ${maxRetries} attempts, skipping snapshot`);
                syncFiles = [];
                break;
              }
            } else {
              // Non-retryable error, skip
              throw err;
            }
          }
        }

        if (syncFiles && syncFiles.length > 0) {
          // Convert to snapshot format
          const snapshotFiles: Array<{
            path: string;
            name: string;
            type: 'file' | 'folder';
            size: number;
            hash: string;
            modifiedAt: string;
          }> = syncFiles.map(f => ({
            path: f.path,
            name: f.name,
            type: f.type === 'file' ? 'file' : 'folder',
            size: f.size,
            hash: '',
            modifiedAt: f.modTime,
          }));

          // Save snapshot to Supabase Storage
          await FileMetadataService.saveSnapshot(projectId, project.name, snapshotFiles);
          console.log(`[Join] ✅ Saved snapshot for ${projectId} with ${snapshotFiles.length} files`);
        } else {
          console.log(`[Join] No files synced yet for ${projectId}`);
        }
      } catch (err) {
        console.warn(`[Join] Failed to generate snapshot: ${err}`);
        // Continue anyway - snapshot can be generated later on demand
      }
    })();

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
 * Paginated file list from latest snapshot stored in Supabase Storage
 * Generates snapshot on-demand if not available
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
      .select('owner_id, snapshot_url, name')
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

    // Load snapshot from storage if available
    let allFiles: any[] = [];
    
    if (project.snapshot_url) {
      try {
        const snapshot = await FileMetadataService.loadSnapshot(project.snapshot_url);
        allFiles = flattenFileTree(snapshot.files || []);
      } catch (err) {
        console.warn('Failed to load snapshot:', err);
        // Continue - will generate new snapshot below
      }
    }
    
    // If no snapshot, generate one from Syncthing
    if (allFiles.length === 0 && !project.snapshot_url) {
      console.log(`[files-list] Generating initial snapshot for project ${projectId}`);
      try {
        // Get Syncthing config
        let syncConfig;
        try {
          syncConfig = getSyncthingConfig();
        } catch (err) {
          console.warn(`[files-list] Failed to get Syncthing config, returning empty list:`, err);
          return res.json({
            files: [],
            pagination: {
              total: 0,
              limit: pageLimit,
              offset: pageOffset,
              hasMore: false,
            },
          });
        }

        // Query Syncthing for files
        const syncthingService = new SyncthingService(
          syncConfig.apiKey,
          syncConfig.host,
          syncConfig.port
        );

        const syncFiles = await syncthingService.getFolderFiles(projectId, 10);
        console.log(`[files-list] Retrieved ${syncFiles.length} files from Syncthing`);

        // Convert to snapshot format
        const snapshotFiles: Array<{
          path: string;
          name: string;
          type: 'file' | 'folder';
          size: number;
          hash: string;
          modifiedAt: string;
        }> = syncFiles.map(f => ({
          path: f.path,
          name: f.name,
          type: f.type === 'file' ? 'file' : 'folder',
          size: f.size,
          hash: '',
          modifiedAt: f.modTime,
        }));

        // Save snapshot asynchronously (don't wait)
        (async () => {
          try {
            await FileMetadataService.saveSnapshot(projectId, project.name, snapshotFiles);
            console.log(`[files-list] Saved snapshot for project ${projectId}`);
          } catch (err) {
            console.warn(`[files-list] Failed to save snapshot:`, err);
          }
        })();

        // Return current files
        allFiles = flattenFileTree(snapshotFiles);
      } catch (err) {
        console.error(`[files-list] Failed to generate snapshot:`, err);
        // Return empty - user can try again
      }
    }

    // Apply pagination to flattened file list
    const paginatedFiles = allFiles.slice(pageOffset, pageOffset + pageLimit);

    res.json({
      files: paginatedFiles.map(f => ({
        file_path: f.path,
        is_directory: f.type === 'folder',
        size: f.size || 0,
        file_hash: f.hash || '',
        modified_at: f.modifiedAt,
      })),
      pagination: {
        total: allFiles.length,
        limit: pageLimit,
        offset: pageOffset,
        hasMore: pageOffset + pageLimit < allFiles.length,
      },
    });
  } catch (error) {
    console.error('Get files-list exception:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Helper function to flatten file tree for pagination
function flattenFileTree(files: any[]): any[] {
  const result: any[] = [];
  
  function traverse(items: any[]) {
    for (const item of items) {
      result.push(item);
      if (item.children && Array.isArray(item.children)) {
        traverse(item.children);
      }
    }
  }
  
  traverse(files);
  return result;
}

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
 * GET /api/projects/:projectId/file-tree
 * Returns file tree structure from snapshot (for file browser UI in invited projects)
 * Much better UX than flat pagination list
 */
router.get('/:projectId/file-tree', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify user is member (owner or invited)
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, snapshot_url, name')
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

    // Load snapshot from storage if available
    let fileTree: any = null;
    let totalFiles = 0;
    let totalSize = 0;
    
    if (project.snapshot_url) {
      try {
        const snapshot = await FileMetadataService.loadSnapshot(project.snapshot_url);
        fileTree = snapshot.files || [];
        
        // Calculate totals
        const flatFiles = flattenFileTree(fileTree);
        totalFiles = flatFiles.length;
        totalSize = flatFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      } catch (err) {
        console.warn('Failed to load snapshot:', err);
        return res.status(404).json({ error: 'Snapshot not available' });
      }
    } else {
      return res.status(404).json({ error: 'No snapshot available yet' });
    }

    res.json({
      tree: fileTree,
      summary: {
        totalFiles,
        totalSize,
        projectName: project.name,
      },
    });
  } catch (error) {
    console.error('Get file-tree exception:', error);
    res.status(500).json({ error: 'Failed to fetch file tree' });
  }
});


/**
 * GET /api/projects/:projectId/file-sync-status
 * Returns current sync status for the project folder
 * Response is cached for 5 seconds to avoid Syncthing overload
 * 
 * For members (invited users only)
 */
router.get('/:projectId/file-sync-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify user is project member (owner or invited)
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, syncthing_folder_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;

    if (!isOwner) {
      // Check if invited member with accepted status
      const { data: member } = await supabase
        .from('project_members')
        .select('status')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (!member || member.status !== 'accepted') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Check cache first
    const cached = getCachedSyncStatus(projectId);
    if (cached) {
      console.log(`[Cache HIT] Sync status for project ${projectId}`);
      return res.json(cached);
    }

    // Read Syncthing config from local device
    let syncConfig;
    try {
      syncConfig = getSyncthingConfig();
      console.log(`[file-sync-status] Using local Syncthing config: ${syncConfig.host}:${syncConfig.port}`);
    } catch (configError) {
      console.error(`[file-sync-status] Failed to read Syncthing config:`, configError);
      return res.status(503).json({ 
        error: 'Syncthing not configured',
        message: (configError as Error).message 
      });
    }

    // Query Syncthing API using local config
    const syncthingService = new SyncthingService(
      syncConfig.apiKey,
      syncConfig.host,
      syncConfig.port
    );

    // Use project UUID as folder ID (new standard - matches Syncthing folder naming)
    const folderStatus = await syncthingService.getFolderStatus(projectId);

    // Calculate completion percentage
    const completion = folderStatus.globalBytes > 0
      ? Math.round((folderStatus.inSyncBytes / folderStatus.globalBytes) * 100)
      : 100;

    // Determine state
    let state: 'synced' | 'syncing' | 'paused' | 'error' = 'synced';
    if (folderStatus.folderState === 'syncing') {
      state = 'syncing';
    } else if (folderStatus.folderState === 'stopped' || folderStatus.folderState === 'paused') {
      state = 'paused';
    } else if (folderStatus.pullErrors && folderStatus.pullErrors > 0) {
      state = 'error';
    }

    const response = {
      folderState: folderStatus.folderState,
      state,
      completion,
      bytesDownloaded: folderStatus.inSyncBytes || 0,
      totalBytes: folderStatus.globalBytes || 0,
      needsBytes: folderStatus.needBytes || 0,
      filesDownloaded: folderStatus.inSyncFiles || 0,
      totalFiles: folderStatus.globalFiles || 0,
      lastUpdate: new Date().toISOString(),
      pullErrors: folderStatus.pullErrors || 0,
    };

    // Cache the response for 5 seconds
    setCachedSyncStatus(projectId, response, 5000);

    res.json(response);
  } catch (error) {
    console.error('Get file-sync-status exception:', error);
    res.status(500).json({ error: `Failed to get sync status: ${(error as Error).message}` });
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
  const startTime = Date.now();
  const { projectId } = req.params;
  const { deviceId, syncthingApiKey } = req.body;
  const userId = (req as any).user.id;

  try {
    if (!deviceId || !syncthingApiKey) {
      return res.status(400).json({ error: 'deviceId and syncthingApiKey required' });
    }

    console.log(`[Sync:${projectId}] Starting sync lifecycle for device ${deviceId}`);

    // Verify user is owner (only owner can start syncs)
    console.log(`[Sync:${projectId}] Step 1: Verifying project ownership...`);
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name, local_path')
      .eq('id', projectId)
      .single();

    if (!project) {
      console.error(`[Sync:${projectId}] ✗ Project not found`);
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner_id !== userId) {
      console.error(`[Sync:${projectId}] ✗ User is not project owner`);
      return res.status(403).json({ error: 'Only project owner can start sync' });
    }

    if (!project.local_path) {
      console.error(`[Sync:${projectId}] ✗ Project has no local_path configured`);
      return res.status(400).json({ error: 'Project has no local_path configured' });
    }

    console.log(`[Sync:${projectId}] ✅ Step 1: Project verified (${project.name})`);

    // Initialize Syncthing service
    const syncthingService = new SyncthingService(syncthingApiKey);

    // Step 2: Test connection to Syncthing
    console.log(`[Sync:${projectId}] Step 2: Testing connection to Syncthing...`);
    const isConnected = await syncthingService.testConnection();
    if (!isConnected) {
      console.error(`[Sync:${projectId}] ✗ Cannot connect to Syncthing service`);
      return res.status(503).json({ error: 'Cannot connect to Syncthing service' });
    }
    console.log(`[Sync:${projectId}] ✅ Step 2: Connected to Syncthing`);

    // Step 3: Add device to folder (enable syncing)
    console.log(`[Sync:${projectId}] Step 3: Adding device ${deviceId} to folder...`);
    try {
      await syncthingService.addDeviceToFolder(projectId, deviceId);
      console.log(`[Sync:${projectId}] ✅ Step 3: Device added to folder`);
    } catch (addErr: any) {
      console.error(`[Sync:${projectId}] ✗ Failed to add device to folder: ${addErr.message}`);
      throw new Error(`Failed to add device to folder: ${addErr.message}`);
    }

    // Step 4: Trigger initial folder scan
    console.log(`[Sync:${projectId}] Step 4: Triggering folder scan...`);
    try {
      await syncthingService.scanFolder(projectId);
      console.log(`[Sync:${projectId}] ✅ Step 4: Folder scan initiated`);
    } catch (scanErr: any) {
      console.warn(`[Sync:${projectId}] ⚠️  Warning scanning folder: ${scanErr.message}`);
      // Don't fail here - scan might happen asynchronously
    }

    // Step 5: Wait for device to be known in folder
    console.log(`[Sync:${projectId}] Step 5: Waiting for device to be known in folder...`);
    try {
      await syncthingService.waitForFolderKnown(projectId, 30000);
      console.log(`[Sync:${projectId}] ✅ Step 5: Device known in folder`);
    } catch (knownErr) {
      console.warn(`[Sync:${projectId}] ⚠️  Timeout waiting for folder to be known: ${knownErr}`);
      // Continue anyway - might still sync
    }

    // Step 6: Wait for folder to be scanned (LocalIndexUpdated event)
    console.log(`[Sync:${projectId}] Step 6: Waiting for folder index update...`);
    try {
      await syncthingService.waitForFolderScanned(projectId, 120000);
      console.log(`[Sync:${projectId}] ✅ Step 6: Folder indexed`);
    } catch (scanTimeoutErr) {
      console.warn(`[Sync:${projectId}] ⚠️  Timeout waiting for folder index: ${scanTimeoutErr}`);
      // Continue anyway - initial sync might still proceed
    }

    // Step 7: Get final folder status
    console.log(`[Sync:${projectId}] Step 7: Retrieving folder status...`);
    const status = await syncthingService.getFolderStatus(projectId);
    console.log(`[Sync:${projectId}] ✅ Step 7: Folder status retrieved`);

    const elapsed = Date.now() - startTime;
    console.log(`[Sync:${projectId}] 🎉 SYNC START COMPLETE in ${elapsed}ms`);

    res.json({
      success: true,
      message: 'Sync started successfully',
      projectId,
      projectName: project.name,
      deviceId,
      folderStatus: status,
      timeTaken: elapsed,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Sync:${projectId}] ✗ SYNC START FAILED after ${elapsed}ms: ${(error as Error).message}`);
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

// GET /api/projects/:projectId/invited-users - Get list of invited users
// Shows email addresses of users invited via shareable tokens
router.get('/:projectId/invited-users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify access: user must be owner or accepted member
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check permission
    const isOwner = project.owner_id === userId;
    if (!isOwner) {
      const { data: memberRow } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .single();

      if (!memberRow) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get all active invites with invited_email for this project
    const { data: invites, error: invErr } = await supabase
      .from('project_invites')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true);

    if (invErr) {
      console.error('Failed to fetch invited users:', invErr.message);
      return res.status(500).json({ error: 'Failed to fetch invited users' });
    }

    // Get actual members (already joined)
    const { data: members, error: memErr } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'accepted');

    if (memErr) {
      console.error('Failed to fetch members:', memErr.message);
      return res.status(500).json({ error: 'Failed to fetch members' });
    }

    // Transform response: combine invited emails and accepted members
    const invitedEmails = (invites || [])
      .filter((inv: any) => inv.invited_email) // Only include those with emails
      .map((inv: any) => ({
        type: 'invited',
        email: inv.invited_email,
        invitedAt: inv.created_at,
        invitedBy: inv.created_by,
        status: 'pending',
      }));

    const memberEmails = (members || [])
      .filter((m: any) => m.user_id) // Only actual members (not pending)
      .map((m: any) => ({
        type: 'member',
        userId: m.user_id,
        role: m.role,
        status: 'accepted',
        joinedAt: m.joined_at,
      }));

    res.json({
      invitedCount: invitedEmails.length,
      membersCount: memberEmails.length,
      invited: invitedEmails,
      members: memberEmails,
    });
  } catch (error) {
    console.error('Get invited-users exception:', error);
    res.status(500).json({ error: 'Failed to fetch invited users' });
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

    // NOTE: Legacy remote_files table removed - using Syncthing API instead
    // These endpoints now return mock data as they are not used in production
    // The new /file-sync-status endpoint provides real-time sync status via Syncthing
    
    res.json({
      success: true,
      files: [],
      pagination: {
        total: 0,
        perPage: perPage,
        pageNum: pageNum,
        hasMore: false,
      },
      note: 'Files list deprecated - use /file-sync-status endpoint for sync status',
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
          // Legacy: remote_files table no longer used
          // File deletions are now handled via Syncthing API
          results.push({ path: filePath, op: 'delete', status: 'deprecated' });
        } else {
          // Legacy: remote_files table no longer used
          // File updates are now handled via Syncthing API
          results.push({ path: filePath, op, status: 'deprecated' });
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

/**
 * GET /api/projects/:projectId/sync-status
 * Get current sync status (paused or syncing)
 */
router.get('/:projectId/sync-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, syncthing_folder_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;
    if (!isOwner) {
      const { data: member } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get folder status from Syncthing
    const syncthingService = new SyncthingService(
      process.env.SYNCTHING_API_KEY || '',
      process.env.SYNCTHING_HOST || 'localhost',
      parseInt(process.env.SYNCTHING_PORT || '8384')
    );

    const status = await syncthingService.getFolderStatus(project.syncthing_folder_id);

    res.json({
      projectId,
      paused: status.paused,
      state: status.state, // idle, syncing, scanning, error
      needItems: status.needItems,
      inSyncItems: status.inSyncItems,
      completion: status.completion,
    });
  } catch (error) {
    console.error('Sync-status exception:', error);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

/**
 * PUT /api/projects/:projectId/download-path
 * Set custom download path for a project (TASK 5)
 * Default: ~/downloads/vidsync/{projectName}-{projectId}/
 */
router.put('/:projectId/download-path', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { downloadPath } = req.body;
    const userId = (req as any).user.id;

    if (!downloadPath || typeof downloadPath !== 'string') {
      return res.status(400).json({ error: 'Invalid download path' });
    }

    // Verify user is owner or member
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;
    if (!isOwner) {
      const { data: member } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Update project with new download path
    const { error } = await supabase
      .from('projects')
      .update({ local_sync_path: downloadPath })
      .eq('id', projectId);

    if (error) {
      console.error('Failed to update download path:', error);
      return res.status(500).json({ error: 'Failed to update download path' });
    }

    res.json({
      success: true,
      projectId,
      projectName: project.name,
      downloadPath,
    });
  } catch (error) {
    console.error('Update download-path exception:', error);
    res.status(500).json({ error: 'Failed to update download path' });
  }
});

/**
 * GET /api/projects/:projectId/download-path
 * Get current download path for a project
 */
router.get('/:projectId/download-path', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    const { data: project } = await supabase
      .from('projects')
      .select('owner_id, name, local_sync_path')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isOwner = project.owner_id === userId;
    if (!isOwner) {
      const { data: member } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({
      projectId,
      projectName: project.name,
      downloadPath: project.local_sync_path || `~/downloads/vidsync/${project.name}-${projectId}`,
      isCustom: !!project.local_sync_path,
    });
  } catch (error) {
    console.error('Get download-path exception:', error);
    res.status(500).json({ error: 'Failed to fetch download path' });
  }
});

export default router;


