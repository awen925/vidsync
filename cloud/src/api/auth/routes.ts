import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { supabase } from '../../lib/supabaseClient';

const router = Router();

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    console.log(`[AUTH] Signup request: ${email}`);

    // Create user using Supabase Admin
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || null },
    });

    if (createErr) {
      console.error('Supabase signup error:', createErr.message);
      return res.status(500).json({ error: createErr.message });
    }

    // Sign in to get a session (so front-end can receive an access token)
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInErr) {
      // Return created user but indicate no token
      return res.status(201).json({
        user: {
          id: created.user?.id,
          email: created.user?.email,
          name: (created.user?.user_metadata as any)?.name || null,
        },
        warning: 'User created but sign-in failed: ' + signInErr.message,
      });
    }

    const token = (signInData as any).session?.access_token || (signInData as any).session?.access_token;

    res.status(201).json({
      token,
      user: {
        id: created.user?.id,
        email: created.user?.email,
        name: (created.user?.user_metadata as any)?.name || null,
      },
    });
  } catch (error) {
    console.error('Signup exception:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    console.log(`[AUTH] Login request: ${email}`);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Supabase login error:', error.message);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = (data as any).session?.access_token;
    const user = (data as any).user;

    res.json({ token, user });
  } catch (error) {
    console.error('Login exception:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/magic-link
router.post('/magic-link', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    console.log(`[AUTH] Magic link request: ${email}`);

    // Use Supabase to send magic link (OTP) to email
    const { data, error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
      console.error('Magic link error:', error.message);
      return res.status(500).json({ error: 'Failed to send magic link' });
    }

    res.json({ message: 'Magic link sent', details: data });
  } catch (error) {
    console.error('Magic link exception:', error);
    res.status(500).json({ error: 'Magic link request failed' });
  }
});

// POST /api/auth/verify-link
router.post('/verify-link', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // For now, simply attempt to get a user from the session token
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Verify link error:', error.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({ token, user: data.user });
  } catch (error) {
    console.error('Verify link exception:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({
    user: (req as any).user,
  });
});

export default router;
