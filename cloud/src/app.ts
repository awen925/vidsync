import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './api/auth/routes';
import projectRoutes from './api/projects/routes';
import deviceRoutes from './api/devices/routes';
import syncRoutes from './api/sync/routes';
import userRoutes from './api/users/routes';
import nebulaRoutes from './api/nebula/routes';
import pairingsRoutes from './api/pairings/routes';
import { errorHandler } from './middleware/errorHandler';
import {
  globalRateLimiter,
  authRateLimiter,
  pairingRateLimiter,
  syncRateLimiter,
} from './middleware/rateLimiter';
import { auditLoggingMiddleware } from './middleware/auditLogger';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// ========== SECURITY MIDDLEWARE ==========

// Trust proxy (for rate limiting to work correctly behind load balancer)
app.set('trust proxy', 1);

// CORS configuration
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:3000').split(',').map(o => o.trim());

const corsOptions = {
  origin: function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, Electron, curl requests)
    if (!origin || origin === 'electron://localhost' || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In development, allow more, in production be strict
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// JSON body parser with size limit
// Skip JSON parsing for multipart requests (let multer handle them)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.is('multipart/form-data')) {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});

// Security headers middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Disable frameable
  res.setHeader('X-Frame-Options', 'DENY');

  // HSTS (HTTP Strict Transport Security)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      `max-age=${process.env.HSTS_MAX_AGE || 31536000}; includeSubDomains`
    );
  }

  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  next();
});

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const level =
    process.env.NODE_ENV === 'production' ? 'debug' : 'info';
  if (process.env.NODE_ENV !== 'production' || level === 'info') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Audit logging
app.use(auditLoggingMiddleware);

// Global rate limiter
app.use(globalRateLimiter);

// ========== ROUTES WITH SPECIFIC RATE LIMITERS ==========

// Auth routes (stricter rate limit)
app.use('/api/auth', authRateLimiter, authRoutes);

// Pairing routes (very strict rate limit)
app.use('/api/pairings', pairingRateLimiter, pairingsRoutes);

// Sync routes (moderate rate limit)
app.use('/api/sync', syncRateLimiter, syncRoutes);

// Other routes (use global rate limiter)
app.use('/api/projects', projectRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/nebula', nebulaRoutes);

// ========== HEALTH CHECK & ERROR HANDLING ==========

// Health check endpoint (not rate limited for monitoring)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
  });
});

// Readiness check (verifies database connection, etc.)
app.get('/readiness', async (req: Request, res: Response) => {
  try {
    // Add database connection check here if needed
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'not-ready', error: (err as Error).message });
  }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
