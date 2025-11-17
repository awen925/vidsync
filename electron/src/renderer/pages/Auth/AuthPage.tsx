import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Paper, TextField, Button, Typography, Tab, Tabs,
  Alert, CircularProgress, InputAdornment, IconButton, Stack,
} from '@mui/material';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAppTheme } from '../../theme/AppThemeProvider';
import { setAccessToken } from '../../hooks/useCloudApi';
import { supabase } from '../../lib/supabaseClient';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} id={`auth-${index}`} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useAppTheme();
  const [tabValue, setTabValue] = React.useState(0);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
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
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      setSuccess('Account created! Check email to confirm.');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', p: 2 }}>
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: 'primary.main', color: 'white', p: 3, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <img
                src="/icons/logo2.png"
                alt="Vidsync"
                style={{ height: 80, width: 'auto' }}
              />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Vidsync</Typography>
            <Typography variant="body2">Fast & Secure File Sync</Typography>
          </Box>

          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="fullWidth">
            <Tab label="Login" />
            <Tab label="Sign Up" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

            <TabPanel value={tabValue} index={0}>
              <form onSubmit={handleLogin}>
                <Stack spacing={2}>
                  <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} InputProps={{ startAdornment: <InputAdornment position="start"><Mail size={20} /></InputAdornment> }} />
                  <TextField fullWidth label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} InputProps={{ startAdornment: <InputAdornment position="start"><Lock size={20} /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</IconButton></InputAdornment> }} />
                  <Button fullWidth variant="contained" size="large" type="submit" disabled={isLoading}>{isLoading ? <CircularProgress size={24} /> : 'Login'}</Button>
                </Stack>
              </form>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <form onSubmit={handleSignup}>
                <Stack spacing={2}>
                  <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} InputProps={{ startAdornment: <InputAdornment position="start"><Mail size={20} /></InputAdornment> }} />
                  <TextField fullWidth label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} InputProps={{ startAdornment: <InputAdornment position="start"><Lock size={20} /></InputAdornment>, endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</IconButton></InputAdornment> }} />
                  <Button fullWidth variant="contained" size="large" type="submit" disabled={isLoading}>{isLoading ? <CircularProgress size={24} /> : 'Create'}</Button>
                </Stack>
              </form>
            </TabPanel>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default AuthPage;
