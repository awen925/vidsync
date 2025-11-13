import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './api/auth/routes';
import projectRoutes from './api/projects/routes';
import deviceRoutes from './api/devices/routes';
import syncRoutes from './api/sync/routes';
import userRoutes from './api/users/routes';
import nebulaRoutes from './api/nebula/routes';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/users', userRoutes);
app.use('/api/nebula', nebulaRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
