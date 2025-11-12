import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';

const router = Router();

// POST /api/projects
router.post('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const userId = (req as any).user.id;

    if (!name) {
      return res.status(400).json({ error: 'Project name required' });
    }

    // TODO: Create project in Supabase
    console.log(`[STUB] Create project: ${name} for user: ${userId}`);

    res.status(201).json({
      id: 'project-' + Date.now(),
      name,
      description,
      owner: userId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/projects
router.get('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // TODO: List projects from Supabase
    console.log(`[STUB] List projects for user: ${userId}`);

    res.json({
      projects: [
        {
          id: 'project-1',
          name: 'Sample Project',
          description: 'A sample project',
          owner: userId,
          members: 1,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// GET /api/projects/:projectId
router.get('/:projectId', authMiddleware, (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // TODO: Get project details from Supabase
    console.log(`[STUB] Get project: ${projectId}`);

    res.json({
      project: {
        id: projectId,
        name: 'Sample Project',
        description: 'A sample project',
        members: [
          {
            id: 'user-1',
            email: 'user@example.com',
            role: 'owner',
          },
        ],
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// POST /api/projects/:projectId/invite
router.post('/:projectId/invite', authMiddleware, (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // TODO: Send invitation via Supabase
    console.log(`[STUB] Invite ${email} to project: ${projectId}`);

    res.status(201).json({
      invitation: {
        id: 'inv-' + Date.now(),
        projectId,
        email,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

export default router;
