import { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory rate limiter
 * For production, use Redis-based rate limiter (e.g., redis-rate-limit)
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};
const CLEANUP_INTERVAL = 60000; // Clean up every minute

// Cleanup old entries
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Create a rate limiter middleware
 * @param maxRequests Maximum requests allowed
 * @param windowMs Time window in milliseconds
 * @param keyGenerator Function to generate rate limit key (default: IP address)
 */
export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  keyGenerator?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator ? keyGenerator(req) : getClientIp(req);
    const now = Date.now();

    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    const record = store[key];

    // Reset if window has passed
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    // Increment counter
    record.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - record.count);
    const resetTime = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetTime.toString());

    // Check if limit exceeded
    if (record.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: resetTime,
      });
    }

    next();
  };
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Global rate limiter (general API requests)
 */
export const globalRateLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000')
);

/**
 * Specific rate limiters for sensitive endpoints
 */

// Auth endpoints (stricter limit)
export const authRateLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_AUTH || '20'),
  60000 // 1 minute
);

// Pairing endpoints (very strict)
export const pairingRateLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_PAIRING || '10'),
  60000 // 1 minute
);

// Sync endpoints
export const syncRateLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_SYNC || '50'),
  60000 // 1 minute
);

/**
 * Per-user rate limiter (using user ID as key)
 */
export function createUserRateLimiter(maxRequests: number, windowMs: number) {
  return createRateLimiter(maxRequests, windowMs, (req: Request) => {
    const userId = (req as any).user?.id || getClientIp(req);
    return `user:${userId}`;
  });
}

// Export rate limiters for specific endpoints
export const userActionRateLimiter = createUserRateLimiter(200, 60000); // 200 requests per minute per user
export const createProjectRateLimiter = createUserRateLimiter(10, 60000); // 10 projects per minute per user
export const inviteCodeRateLimiter = createUserRateLimiter(20, 60000); // 20 invite codes per minute per user
