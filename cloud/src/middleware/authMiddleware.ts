import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabaseClient';

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
    console.log('Auth middleware user fetch response:', resp);
    const { data, error } = resp;
    if (error || !data?.user) {
      console.error('Supabase getUser error:', error, 'data:', data);
      return res.status(401).json({ error: 'Invalid token', detail: (error as any)?.message || null });
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
