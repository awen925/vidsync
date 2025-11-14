import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Container, Card, CardContent, TextField, Button, Typography,
  FormControlLabel, Switch, Stack, Divider, Alert, CircularProgress,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { LogOut, Folder } from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';
import { supabase } from '../../lib/supabaseClient';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [downloadPath, setDownloadPath] = useState('~/Downloads');
  const [autoSync, setAutoSync] = useState(true);
  const [syncMode, setSyncMode] = useState<'automatic' | 'manual'>('automatic');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [success, setSuccess] = useState('');

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await cloudAPI.get('/users/settings');
        const settings = response.data.settings;
        setDownloadPath(settings.defaultDownloadPath);
        setAutoSync(settings.autoSync);
        setSyncMode(settings.syncMode);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };

    fetchSettings();
  }, []);

  const handleBrowseDirectory = async () => {
    const path = await (window as any).api?.openDirectory();
    if (path) {
      setDownloadPath(path);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess('');
    try {
      await cloudAPI.put('/users/settings', {
        defaultDownloadPath: downloadPath,
        autoSync,
        syncMode,
      });
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      await (window as any).api.secureStore.clearRefreshToken();
      navigate('/auth');
    } catch (error) {
      console.error('Failed to logout:', error);
      setLoggingOut(false);
    }
  };

  return (
    <Box sx={{ py: 4, minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="md">
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 4 }}>Settings</Typography>

        {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

        {/* Sync Preferences Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>Sync Preferences</Typography>
            
            <Stack spacing={3}>
              {/* Download Path */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500 }}>Default Download Path</Typography>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    value={downloadPath}
                    onChange={(e) => setDownloadPath(e.target.value)}
                    InputProps={{
                      readOnly: true,
                      endAdornment: <Folder size={18} style={{ marginRight: 8 }} />,
                    }}
                  />
                  <Button variant="outlined" onClick={handleBrowseDirectory} sx={{ minWidth: 100 }}>
                    Browse
                  </Button>
                </Stack>
              </Box>

              <Divider />

              {/* Auto Sync */}
              <Box>
                <FormControlLabel
                  control={<Switch checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />}
                  label={
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>Auto Sync</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Automatically sync files when they change</Typography>
                    </Box>
                  }
                />
              </Box>

              <Divider />

              {/* Sync Mode */}
              <FormControl fullWidth>
                <InputLabel>Sync Mode</InputLabel>
                <Select value={syncMode} onChange={(e) => setSyncMode(e.target.value as any)} label="Sync Mode">
                  <MenuItem value="automatic">Automatic</MenuItem>
                  <MenuItem value="manual">Manual</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Box sx={{ mb: 4 }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleSave}
            disabled={saving}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {saving ? <><CircularProgress size={20} sx={{ mr: 1 }} />Saving...</> : 'Save Settings'}
          </Button>
        </Box>

        <Divider sx={{ my: 4 }} />

        {/* Account Section */}
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Account</Typography>
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={<LogOut size={20} />}
            onClick={handleLogout}
            disabled={loggingOut}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {loggingOut ? 'Logging out...' : 'Logout'}
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default SettingsPage;
