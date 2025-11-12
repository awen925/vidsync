import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';

const router = Router();

// POST /api/devices/register
router.post('/register', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { deviceId, deviceName, platform, deviceToken, syncthingId, nebulaIp } = req.body;
    const userId = (req as any).user.id;

    if (!deviceId || !deviceName) {
      return res.status(400).json({ error: 'Device ID and name required' });
    }

    console.log(`[DEVICES] Register device: ${deviceName} (${deviceId}) for user: ${userId}`);

    // Use provided deviceToken or generate a simple one
    const token = deviceToken || `${deviceId}-${Date.now()}`;

    // Check if device already exists for this user+deviceId
    const { data: existing, error: selectErr } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .eq('device_id', deviceId);

    if (selectErr && (selectErr as any).code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error)
      console.error('Failed to check existing device:', selectErr.message);
      return res.status(500).json({ error: 'Failed to register device' });
    }

    const payload = {
      user_id: userId,
      device_id: deviceId,
      device_name: deviceName,
      platform: platform || 'unknown',
      device_token: token,
      syncthing_id: syncthingId || null,
      nebula_ip: nebulaIp || null,
      is_online: true,
      last_seen: new Date().toISOString(),
    };

    let data, error;
    
    if (existing && existing.length > 0) {
      // Update existing device
      const { data: updated, error: updateErr } = await supabase
        .from('devices')
        .update(payload)
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .select()
        .single();
      data = updated;
      error = updateErr;
    } else {
      // Insert new device
      const { data: inserted, error: insertErr } = await supabase
        .from('devices')
        .insert(payload)
        .select()
        .single();
      data = inserted;
      error = insertErr;
    }

    if (error) {
      console.error('Failed to persist device:', error.message);
      return res.status(500).json({ error: 'Failed to register device' });
    }

    res.status(201).json({ device: data });
  } catch (error) {
    console.error('Register device exception:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// GET /api/devices
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    console.log(`[DEVICES] List devices for user: ${userId}`);

    const { data, error } = await supabase.from('devices').select('*').eq('user_id', userId);

    if (error) {
      console.error('Failed to fetch devices:', error.message);
      return res.status(500).json({ error: 'Failed to list devices' });
    }

    res.json({ devices: data || [] });
  } catch (error) {
    console.error('List devices exception:', error);
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

// DELETE /api/devices/:deviceId
router.delete('/:deviceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    console.log(`[DEVICES] Delete device: ${deviceId}`);

    const { data, error } = await supabase.from('devices').delete().eq('device_id', deviceId);

    if (error) {
      console.error('Failed to delete device:', error.message);
      return res.status(500).json({ error: 'Failed to delete device' });
    }

    res.json({ message: 'Device deleted successfully', deleted: data });
  } catch (error) {
    console.error('Delete device exception:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

export default router;
