import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabaseClient';
import * as jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use Supabase to validate token and get user
    const resp = await supabase.auth.getUser(token);
    const { data, error } = resp;

    if (error || !data?.user) {
      // If the token is expired and we're in development, try a safe decode fallback
      const errMsg = (error as any)?.message || '';
      console.error('Supabase getUser error:', error, 'data:', data);

      if (process.env.NODE_ENV !== 'production' && errMsg.toLowerCase().includes('expired')) {
        try {
          // Decode without verification to extract the user id/email for dev convenience
          const decoded: any = jwt.decode(token as string) || {};
          const userId = decoded?.sub || decoded?.user_id || decoded?.id;
          const email = decoded?.email || '';

          if (userId) {
            console.warn('Using decoded (expired) token payload in dev mode. This is insecure and only for local testing.');
            req.user = { id: userId, email };
            return next();
          }
        } catch (decErr) {
          console.error('Failed to decode expired token fallback:', decErr);
        }
      }

      return res.status(401).json({ error: 'Invalid token', detail: errMsg || null });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
