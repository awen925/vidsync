import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cloudAPI, setAccessToken } from '../../hooks/useCloudApi';
import { supabase } from '../../lib/supabaseClient';
import logo from '../../assets/logo.svg';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [mode, setMode] = React.useState<'login' | 'signup' | 'magic'>('login');
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: Toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      // Use Supabase client in the renderer so it can manage refresh tokens
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message || 'Login failed');
        setIsLoading(false);
        return;
      }

      // supabase client will persist session and refresh tokens
      const token = (data as any)?.session?.access_token;
      if (token) {
        setAccessToken(token);

        // Persist refresh token securely in main process
        try {
          const refreshToken = (data as any).session?.refresh_token;
          if (refreshToken && (window as any).api?.secureStore?.setRefreshToken) {
            await (window as any).api.secureStore.setRefreshToken(refreshToken);
          }
        } catch (e) {
          // Silently fail in production
        }

        // Register device with cloud after successful login
        try {
          const deviceInfo = await (window as any).api.deviceGetInfo();
          await cloudAPI.post('/devices/register', {
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            platform: deviceInfo.platform,
            deviceToken: deviceInfo.deviceToken || undefined,
          });
          addToast('Device registered successfully', 'success');
        } catch (regErr) {
          // Silently fail device registration
          addToast('Logged in successfully', 'success');
        }

        navigate('/dashboard');
      } else {
        setError('Invalid login response');
      }
    } catch (err: any) {
      setError(err.message || err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      // Use Supabase client signUp to create account and session
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message || 'Signup failed');
        setIsLoading(false);
        return;
      }

      // If signUp provided a session, use it; otherwise show message
      const token = (data as any)?.session?.access_token;
      if (token) {
        setAccessToken(token);

        // Persist refresh token securely in main process
        try {
          const refreshToken = (data as any).session?.refresh_token;
          if (refreshToken && (window as any).api?.secureStore?.setRefreshToken) {
            await (window as any).api.secureStore.setRefreshToken(refreshToken);
          }
        } catch (e) {
          // Silently fail in production
        }

        try {
          const deviceInfo = await (window as any).api.deviceGetInfo();
          await cloudAPI.post('/devices/register', {
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            platform: deviceInfo.platform,
            deviceToken: deviceInfo.deviceToken || undefined,
          });
          addToast('Device registered successfully', 'success');
        } catch (regErr) {
          // Silently fail device registration
          addToast('Signed up successfully', 'success');
        }

        navigate('/dashboard');
      } else {
        setError('Signup succeeded. Please check your email to confirm.');
      }
    } catch (err: any) {
      setError(err.message || err.response?.data?.error || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await cloudAPI.post('/auth/magic-link', { email });
      setError('Magic link sent. Check your email.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-white shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-500'
                : toast.type === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="w-full max-w-md mx-auto p-6">
        <div className="card flex flex-col items-center gap-4">
          <img src={logo} alt="Vidsync" className="w-24 h-24" />
          <h1 className="text-2xl font-bold">Vidsync</h1>
          <p className="text-sm text-gray-500">Fast & secure file sync across devices</p>

          <div className="w-full mt-2">
            <div className="flex gap-2 mb-4">
              <button
                className={`flex-1 py-2 rounded-md ${mode === 'login' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setMode('login')}
              >
                Login
              </button>
              <button
                className={`flex-1 py-2 rounded-md ${mode === 'signup' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setMode('signup')}
              >
                Sign up
              </button>
              <button
                className={`py-2 px-3 rounded-md ${mode === 'magic' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setMode('magic')}
              >
                Magic Link
              </button>
            </div>

            <form onSubmit={mode === 'signup' ? handleSignup : mode === 'magic' ? handleMagicLink : handleLogin} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border-gray-200 rounded-md p-3 focus:ring-2 focus:ring-indigo-200"
              />

              {mode !== 'magic' && (
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border-gray-200 rounded-md p-3 focus:ring-2 focus:ring-indigo-200"
                />
              )}

              {error && <div className="text-sm text-red-600 p-2 bg-red-50 rounded">{error}</div>}

              <button type="submit" disabled={isLoading} className="w-full btn-primary">
                {isLoading ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send Magic Link' : 'Sign in'}
              </button>
            </form>

            <div className="text-center text-xs text-gray-400 mt-4">
              By continuing you agree to our <a className="text-indigo-600">Terms</a> and <a className="text-indigo-600">Privacy</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
