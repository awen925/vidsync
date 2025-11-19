import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Paper, TextField, Button, Typography,
  Alert, CircularProgress, InputAdornment, IconButton, Stack, Divider,
} from '@mui/material';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAppTheme } from '../../theme/AppThemeProvider';
import { setAccessToken } from '../../hooks/useCloudApi';
import { supabase } from '../../lib/supabaseClient';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useAppTheme();
  const [isLogin, setIsLogin] = React.useState(true);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [passwordConfirm, setPasswordConfirm] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      const { data: session } = await supabase.auth.getSession();
      if (session?.session) {
        setAccessToken(session.session.access_token);
        
        // Update device info on login (sync latest Syncthing device ID)
        try {
          console.log('[AUTH] Syncing device information with latest Syncthing ID...');
          
          // Sync device - this fetches the latest Syncthing device ID and updates Supabase
          const syncResult = await (window as any).api.deviceSyncNow({
            accessToken: session.session.access_token,
          });
          
          if (syncResult?.ok) {
            console.log('[AUTH] Device synced successfully:', syncResult.device);
            
            // After successful device sync, ensure folders for all projects
            try {
              console.log('[AUTH] Ensuring Syncthing folders for all projects...');
              const folderResult = await (window as any).api.projectEnsureFolders({
                accessToken: session.session.access_token,
              });
              if (folderResult?.ok) {
                console.log('[AUTH] Folders ensured for projects:', folderResult.results);
              } else {
                console.warn('[AUTH] Failed to ensure folders:', folderResult?.error);
              }
            } catch (folderErr: any) {
              console.warn('[AUTH] Error ensuring folders:', folderErr.message || folderErr);
            }
          } else {
            console.warn('[AUTH] Failed to sync device on login:', syncResult?.error);
            // Don't fail login if device sync fails
          }
        } catch (updateErr: any) {
          console.warn('[AUTH] Failed to sync device on login:', updateErr.message || updateErr);
          // Don't fail login if device sync fails
        }
        
        setSuccess('Login successful! Redirecting...');
        setTimeout(() => navigate('/dashboard'), 1000);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Validate password confirmation
    if (password !== passwordConfirm) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }
    
    try {
      // Sign up with Supabase (email will be auto-confirmed for development)
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });
      
      if (signupError) throw new Error(signupError.message);
      
      if (data.user) {
        console.log('[AUTH] Signup successful:', data.user.id);
        
        // Try to get session immediately
        let sessionAttempts = 0;
        let session = null;
        
        while (sessionAttempts < 3) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session) {
            session = sessionData.session;
            break;
          }
          sessionAttempts++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (session) {
          setAccessToken(session.access_token);
          
          // Register device with backend
          try {
            const deviceId = `vidsync-${data.user.id.substring(0, 8)}`;
            
            // Get Syncthing device ID
            let syncthingId = null;
            try {
              const result = await (window as any).api.syncthingGetDeviceId('__app_shared__');
              if (result?.ok && result?.id) {
                syncthingId = result.id;
                console.log(`[AUTH] Got Syncthing device ID: ${syncthingId}`);
              }
            } catch (err: any) {
              console.warn('[AUTH] Error getting Syncthing device ID:', err);
            }
            
            // Sync device info with latest Syncthing device ID
            const syncResult = await (window as any).api.deviceSyncNow({
              accessToken: session.access_token,
            });
            
            if (syncResult?.ok) {
              console.log('[AUTH] Device synced successfully');
              
              // After successful device sync, ensure folders for all projects
              try {
                console.log('[AUTH] Ensuring Syncthing folders for all projects...');
                const folderResult = await (window as any).api.projectEnsureFolders({
                  accessToken: session.access_token,
                });
                if (folderResult?.ok) {
                  console.log('[AUTH] Folders ensured for projects:', folderResult.results);
                } else {
                  console.warn('[AUTH] Failed to ensure folders:', folderResult?.error);
                }
              } catch (folderErr: any) {
                console.warn('[AUTH] Error ensuring folders:', folderErr.message || folderErr);
              }
              
              setSuccess('Account created! Redirecting...');
            } else {
              console.warn('[AUTH] Failed to sync device:', syncResult?.error);
              setSuccess('Account created! Redirecting...');
            }
            
            setTimeout(() => navigate('/dashboard'), 1500);
          } catch (deviceErr: any) {
            console.warn('[AUTH] Device sync error:', deviceErr.message || deviceErr);
            setSuccess('Account created! Redirecting...');
            setTimeout(() => navigate('/dashboard'), 1500);
          }
        } else {
          // No session available yet - email confirmation may be required
          setSuccess('Signup successful! Please check your email to confirm your account.');
          setTimeout(() => {
            setIsLogin(true);
            setEmail('');
            setPassword('');
            setPasswordConfirm('');
          }, 3000);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: isDark ? '#1a1a1a' : '#f5f5f5',
        p: 2,
      }}
    >
      <Container maxWidth="sm">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: 4,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <img
              src="/icons/logo2.png"
              alt="Vidsync"
              style={{ height: 80, width: 'auto' }}
            />
          </Box>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>Vidsync</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>Fast & Secure File Sync</Typography>
        </Box>

        <Paper 
          elevation={0}
          sx={{ 
            p: 4, 
            borderRadius: 2,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
          }}
        >
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

          {isLogin ? (
            <Box component="form" onSubmit={handleLogin}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                Sign In
              </Typography>

              <Stack spacing={2.5}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><Mail size={20} /></InputAdornment>,
                  }}
                />
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><Lock size={20} /></InputAdornment>,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                          edge="end"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? <CircularProgress size={24} /> : 'Sign In'}
                </Button>
              </Stack>

              <Divider sx={{ my: 3 }} />

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  Don't have an account?
                </Typography>
                <Button
                  variant="text"
                  onClick={() => {
                    setIsLogin(false);
                    setEmail('');
                    setPassword('');
                    setPasswordConfirm('');
                    setError('');
                    setSuccess('');
                  }}
                  disabled={isLoading}
                >
                  Create one now
                </Button>
              </Box>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSignup}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                Create Account
              </Typography>

              <Stack spacing={2.5}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><Mail size={20} /></InputAdornment>,
                  }}
                />
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><Lock size={20} /></InputAdornment>,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                          edge="end"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="Confirm Password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  disabled={isLoading}
                  required
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><Lock size={20} /></InputAdornment>,
                  }}
                />
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? <CircularProgress size={24} /> : 'Create Account'}
                </Button>
              </Stack>

              <Divider sx={{ my: 3 }} />

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  Already registered?
                </Typography>
                <Button
                  variant="text"
                  onClick={() => {
                    setIsLogin(true);
                    setEmail('');
                    setPassword('');
                    setPasswordConfirm('');
                    setError('');
                    setSuccess('');
                  }}
                  disabled={isLoading}
                >
                  Sign in instead
                </Button>
              </Box>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
};

export default AuthPage;
