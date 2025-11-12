import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';

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
router.get('/settings', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // TODO: Get user settings from Supabase
    console.log(`[STUB] Get settings for user: ${userId}`);

    res.json({
      settings: {
        defaultDownloadPath: '~/Downloads',
        autoSync: true,
        syncMode: 'automatic',
        notifications: true,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /api/users/settings
router.put('/settings', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const settings = req.body;

    // TODO: Update user settings in Supabase
    console.log(`[STUB] Update settings for user: ${userId}`);

    res.json({
      settings,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
