import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';

const router = Router();

// POST /api/sync/events
router.post('/events', authMiddleware, (req: Request, res: Response) => {
  try {
    const { projectId, type, path, message } = req.body;
    const userId = (req as any).user.id;

    // TODO: Store sync event in Supabase
    console.log(`[STUB] Sync event: ${type} for project: ${projectId}`);

    res.status(201).json({
      event: {
        id: 'evt-' + Date.now(),
        projectId,
        type,
        path,
        message,
        userId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record sync event' });
  }
});

// GET /api/sync/status/:projectId
router.get('/status/:projectId', authMiddleware, (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // TODO: Get sync status from Supabase
    console.log(`[STUB] Get sync status for project: ${projectId}`);

    res.json({
      status: {
        projectId,
        state: 'syncing',
        progress: 45,
        lastSync: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

export default router;
