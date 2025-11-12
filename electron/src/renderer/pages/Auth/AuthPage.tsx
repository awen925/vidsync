import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cloudAPI, setAccessToken } from '../../hooks/useCloudApi';
import logo from '../../assets/logo.svg';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [mode, setMode] = React.useState<'login' | 'signup' | 'magic'>('login');

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const response = await cloudAPI.post('/auth/login', { email, password });
      const token = response.data?.token;
      if (token) {
        setAccessToken(token);
        localStorage.setItem('token', token);

        // Register device with cloud after successful login
        try {
          const deviceInfo = await (window as any).api.deviceGetInfo();
          await cloudAPI.post('/devices/register', {
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            platform: deviceInfo.platform,
          });
        } catch (regErr) {
          console.warn('Device registration failed:', regErr);
        }

        navigate('/dashboard');
      } else {
        setError('Invalid login response');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const response = await cloudAPI.post('/auth/signup', { email, password });
      const token = response.data?.token;
      if (token) {
        setAccessToken(token);
        localStorage.setItem('token', token);

        // Register device with cloud after signup
        try {
          const deviceInfo = await (window as any).api.deviceGetInfo();
          await cloudAPI.post('/devices/register', {
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            platform: deviceInfo.platform,
          });
        } catch (regErr) {
          console.warn('Device registration failed:', regErr);
        }

        navigate('/dashboard');
      } else {
        setError('Signup succeeded but no token returned');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed');
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
