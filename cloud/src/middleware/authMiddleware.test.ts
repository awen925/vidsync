/**
 * Tests for authMiddleware
 * - verifies that when Supabase reports an expired token, in non-production the middleware
 *   decodes the token and allows the request to proceed (dev fallback).
 * - verifies that in production the middleware rejects expired tokens with 401.
 */

// Mock the supabase client before importing the middleware so the module under test
// receives the mocked client instance.
const getUserMock = jest.fn();
jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
  },
}));

import jwt from 'jsonwebtoken';
import { authMiddleware } from './authMiddleware';
import { supabase } from '../lib/supabaseClient';

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // default to non-production for dev fallback tests
    process.env.NODE_ENV = 'test';
  });

  it('decodes expired token and calls next() in non-production', async () => {
    // create an expired token (expiresIn negative) — signature not important for decode()
    const token = jwt.sign({ sub: 'user-123', email: 'dev@example.com' }, 'dev-secret', { expiresIn: -10 });

    // Mock Supabase getUser to return an error indicating expiry
    (supabase as any).auth.getUser = getUserMock;
    getUserMock.mockResolvedValue({ data: null, error: { message: 'token is expired' } });

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-123');
    expect(req.user.email).toBe('dev@example.com');
  });

  it('returns 401 in production for expired token', async () => {
    process.env.NODE_ENV = 'production';

    const token = jwt.sign({ sub: 'user-456', email: 'prod@example.com' }, 'prod-secret', { expiresIn: -10 });

    (supabase as any).auth.getUser = getUserMock;
    getUserMock.mockResolvedValue({ data: null, error: { message: 'token is expired' } });

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid token' }));
  });
});
