import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';

const router = Router();

// GET /api/users/profile
router.get('/profile', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const email = (req as any).user.email;

    // TODO: Get user profile from Supabase
    console.log(`[STUB] Get profile for user: ${userId}`);

    res.json({
      user: {
        id: userId,
        email,
        name: 'User Name',
        avatar: null,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PUT /api/users/profile
router.put('/profile', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, avatar } = req.body;

    // TODO: Update user profile in Supabase
    console.log(`[STUB] Update profile for user: ${userId}`);

    res.json({
      user: {
        id: userId,
        name,
        avatar,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/users/settings
router.get('/settings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get user settings from Supabase
    const { data: userSettings, error } = await supabase
      .from('user_settings')
      .select('default_download_path')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (which is ok - user just doesn't have settings yet)
      console.error('Failed to fetch user settings:', error.message);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }

    // Return settings with defaults if not set
    res.json({
      settings: {
        defaultDownloadPath: userSettings?.default_download_path || '~/Downloads',
        autoSync: true,
        syncMode: 'automatic',
        notifications: true,
      },
    });
  } catch (error) {
    console.error('Get settings exception:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /api/users/settings
router.put('/settings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { defaultDownloadPath, autoSync, syncMode } = req.body;

    // Update user settings in Supabase
    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', userId)
      .single();

    let result;
    if (existing) {
      // Update existing settings
      result = await supabase
        .from('user_settings')
        .update({
          default_download_path: defaultDownloadPath,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();
    } else {
      // Create new settings
      result = await supabase
        .from('user_settings')
        .insert({
          user_id: userId,
          default_download_path: defaultDownloadPath,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Failed to update settings:', result.error.message);
      return res.status(500).json({ error: 'Failed to update settings' });
    }

    res.json({
      settings: {
        defaultDownloadPath: result.data.default_download_path || defaultDownloadPath,
        autoSync,
        syncMode,
        notifications: true,
      },
      updatedAt: result.data.updated_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error('Update settings exception:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
