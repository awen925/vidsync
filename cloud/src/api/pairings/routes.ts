import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';
import crypto from 'crypto';

const router = Router();

// POST /api/pairings - create a short-lived pairing token
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { projectId, fromDeviceId, expiresIn = 300 } = req.body;
    if (!projectId || !fromDeviceId) return res.status(400).json({ error: 'projectId and fromDeviceId required' });

    const token = crypto.randomBytes(6).toString('hex');
    const expiresAt = new Date(Date.now() + (Number(expiresIn) * 1000)).toISOString();

    const { data, error } = await supabase
      .from('pairing_invites')
      .insert({ token, project_id: projectId, from_device_id: fromDeviceId, expires_at: expiresAt })
      .select()
      .single();

    if (error) {
      console.error('Failed to create pairing invite:', error.message);
      return res.status(500).json({ error: 'Failed to create pairing invite' });
    }

    res.json({ token: data.token, expires_at: data.expires_at });
  } catch (e) {
    console.error('Create pairing exception', e);
    res.status(500).json({ error: 'Failed to create pairing invite' });
  }
});

// GET /api/pairings/:token - fetch invite info (do not consume)
router.get('/:token', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { data, error } = await supabase.from('pairing_invites').select('*').eq('token', token).single();
    if (error) return res.status(404).json({ error: 'Invite not found' });
    if (data.expires_at && new Date(data.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });
    res.json({ token: data.token, project_id: data.project_id, from_device_id: data.from_device_id, acceptor_device_id: data.acceptor_device_id, consumed: data.consumed, expires_at: data.expires_at });
  } catch (e) {
    console.error('Fetch pairing exception', e);
    res.status(500).json({ error: 'Failed to fetch pairing invite' });
  }
});

// POST /api/pairings/:token/accept - accept invite, set acceptor_device_id and mark consumed
router.post('/:token/accept', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { acceptorDeviceId } = req.body;
    if (!acceptorDeviceId) return res.status(400).json({ error: 'acceptorDeviceId required' });

    const { data: existing, error: selErr } = await supabase.from('pairing_invites').select('*').eq('token', token).single();
    if (selErr || !existing) return res.status(404).json({ error: 'Invite not found' });
    if (existing.expires_at && new Date(existing.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });

    const { data, error } = await supabase.from('pairing_invites').update({ acceptor_device_id: acceptorDeviceId, consumed: true }).eq('token', token).select().single();
    if (error) {
      console.error('Failed to accept pairing invite:', error.message);
      return res.status(500).json({ error: 'Failed to accept invite' });
    }

    res.json({ ok: true, token: data.token, project_id: data.project_id, from_device_id: data.from_device_id, acceptor_device_id: data.acceptor_device_id });
  } catch (e) {
    console.error('Accept pairing exception', e);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

export default router;
