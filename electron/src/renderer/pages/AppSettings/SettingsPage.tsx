import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Tabs,
  Tab,
  TextField,
  FormControlLabel,
  Checkbox,
  Radio,
  RadioGroup,
  Slider,
  Typography,
  Button,
  Divider,
  Select,
  MenuItem,
  Stack,
  Alert,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import { Settings, Bell, Sliders, Check, Folder } from 'lucide-react';
import { useAppTheme } from '../../theme/AppThemeProvider';
import { cloudAPI } from '../../hooks/useCloudApi';
import { supabase } from '../../lib/supabaseClient';

type SettingsTab = 'general' | 'preferences' | 'notifications' | 'devices';

interface NotificationSettings {
  projectUpdates: boolean;
  syncComplete: boolean;
  teamInvites: boolean;
  securityAlerts: boolean;
  weeklyDigest: boolean;
  emailNotifications: boolean;
}

interface PreferenceSettings {
  theme: 'light' | 'dark' | 'auto';
  autoSync: boolean;
  conflictResolution: 'ask' | 'keepLocal' | 'keepRemote';
  bandwidthLimit: number;
  uploadThreads: number;
  downloadThreads: number;
}

const SettingsPage: React.FC = () => {
  const { mode, setMode } = useAppTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saved, setSaved] = useState(false);

  const [notifications, setNotifications] = useState<NotificationSettings>({
    projectUpdates: true,
    syncComplete: true,
    teamInvites: true,
    securityAlerts: true,
    weeklyDigest: false,
    emailNotifications: true,
  });

  const [preferences, setPreferences] = useState<PreferenceSettings>({
    theme: mode as any,
    autoSync: true,
    conflictResolution: 'ask',
    bandwidthLimit: 10,
    uploadThreads: 4,
    downloadThreads: 4,
  });

  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [syncthingId, setSyncthingId] = useState<string | null>(null);
  const [updatingSyncthingId, setUpdatingSyncthingId] = useState(false);

  useEffect(() => {
    setPreferences(prev => ({
      ...prev,
      theme: mode as any,
    }));
  }, [mode]);

  // Load settings from backend
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await cloudAPI.get('/users/settings');
        const settings = response.data.settings;
        if (settings.defaultDownloadPath) {
          setDefaultDownloadPath(settings.defaultDownloadPath);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };

    fetchSettings();
  }, []);

  // Load devices from backend
  useEffect(() => {
    const fetchDevices = async () => {
      setDevicesLoading(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.access_token) {
          console.error('No access token available');
          return;
        }

        const result = await (window as any).api?.deviceList({
          accessToken: session.session.access_token,
        });

        if (result?.ok) {
          setDevices(result.devices || []);
        } else {
          console.error('Failed to fetch devices:', result?.error);
        }
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      } finally {
        setDevicesLoading(false);
      }
    };

    fetchDevices();
  }, []);

  // Get local Syncthing device ID
  useEffect(() => {
    const getSyncthingDeviceId = async () => {
      try {
        const result = await (window as any).api?.syncthingGetDeviceId('__app_shared__');
        if (result?.ok && result?.id) {
          setSyncthingId(result.id);
        }
      } catch (error) {
        console.error('Failed to get Syncthing device ID:', error);
      }
    };

    getSyncthingDeviceId();
  }, []);

  const [language, setLanguage] = useState('en');
  const [defaultSyncInterval, setDefaultSyncInterval] = useState(30);
  const [defaultDownloadPath, setDefaultDownloadPath] = useState('~/downloads/vidsync');
  const [downloadPathSaving, setDownloadPathSaving] = useState(false);

  const handleNotificationChange = (key: keyof NotificationSettings) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handlePreferenceChange = (key: keyof PreferenceSettings, value: any) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    
    if (key === 'theme') {
      setMode(value as 'light' | 'dark' | 'auto');
    }
  };

  const handleBrowseDownloadPath = async () => {
    try {
      const path = await (window as any).api?.openDirectory();
      if (path) {
        setDefaultDownloadPath(path);
        setSaved(false);
      }
    } catch (error) {
      console.error('Failed to browse directory:', error);
    }
  };

  const saveDownloadPath = async () => {
    setDownloadPathSaving(true);
    try {
      await cloudAPI.put('/users/settings', {
        defaultDownloadPath: defaultDownloadPath,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save download path:', error);
    } finally {
      setDownloadPathSaving(false);
    }
  };

  const handleUpdateSyncthingId = async () => {
    if (!syncthingId) {
      console.warn('No Syncthing device ID available');
      return;
    }

    setUpdatingSyncthingId(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        console.error('No access token available');
        return;
      }

      // Get current device info (we need the deviceId to update)
      const listResult = await (window as any).api?.deviceList({
        accessToken: session.session.access_token,
      });

      if (!listResult?.ok) {
        console.error('Failed to list devices:', listResult?.error);
        return;
      }

      const currentDevices = listResult.devices || [];
      // Find the current device (first Electron app)
      const currentDevice = currentDevices.find((d: any) => d.platform === 'electron');
      
      if (currentDevice) {
        // Update the device with the Syncthing ID via IPC
        const updateResult = await (window as any).api?.deviceRegister({
          deviceId: currentDevice.device_id,
          deviceName: currentDevice.device_name,
          platform: currentDevice.platform,
          syncthingId: syncthingId,
          nebulaIp: currentDevice.nebula_ip,
          accessToken: session.session.access_token,
        });

        if (updateResult?.ok) {
          console.log('[SETTINGS] Updated device with Syncthing ID:', syncthingId);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          
          // Refresh devices list
          const refreshResult = await (window as any).api?.deviceList({
            accessToken: session.session.access_token,
          });
          if (refreshResult?.ok) {
            setDevices(refreshResult.devices || []);
          }
        } else {
          console.error('Failed to update Syncthing ID:', updateResult?.error);
        }
      }
    } catch (error) {
      console.error('Failed to update Syncthing ID:', error);
    } finally {
      setUpdatingSyncthingId(false);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const SettingSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        {title}
      </Typography>
      <Paper elevation={0} sx={{ p: 3, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
        {children}
      </Paper>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100%', bgcolor: 'background.default', flexDirection: 'column' }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          p: 3,
          mb: 3,
          borderRadius: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Settings size={32} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Settings</Typography>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>Customize your experience</Typography>
          </Box>
        </Box>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 3, pb: 3 }}>
        <Container maxWidth="md">
          {/* Tabs */}
          <Paper elevation={0} sx={{ mb: 3, borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <Tabs
              value={activeTab}
              onChange={(_, val) => setActiveTab(val)}
              variant="fullWidth"
            >
              <Tab label="General" value="general" icon={<Settings size={20} />} iconPosition="start" />
              <Tab label="Preferences" value="preferences" icon={<Sliders size={20} />} iconPosition="start" />
              <Tab label="Notifications" value="notifications" icon={<Bell size={20} />} iconPosition="start" />
              <Tab label="Devices" value="devices" icon={<Settings size={20} />} iconPosition="start" />
            </Tabs>
          </Paper>

          {/* General Settings */}
          {activeTab === 'general' && (
            <Box>
              <SettingSection title="Language">
                <Select
                  fullWidth
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setSaved(false);
                  }}
                >
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="es">Spanish</MenuItem>
                  <MenuItem value="fr">French</MenuItem>
                  <MenuItem value="de">German</MenuItem>
                  <MenuItem value="ja">Japanese</MenuItem>
                </Select>
              </SettingSection>

              <SettingSection title="Default Sync Interval">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Slider
                    min={5}
                    max={120}
                    step={5}
                    value={defaultSyncInterval}
                    onChange={(_, val) => {
                      setDefaultSyncInterval(val as number);
                      setSaved(false);
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 80 }}>
                    {defaultSyncInterval}m
                  </Typography>
                </Box>
              </SettingSection>

              <SettingSection title="Storage &amp; Cache">
                <Stack spacing={2}>
                  <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Cache Size</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>2.3 GB</Typography>
                  </Box>
                  <Button disableRipple variant="outlined" fullWidth>
                    Clear Cache
                  </Button>
                </Stack>
              </SettingSection>

              <SettingSection title="Default Download Path">
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    value={defaultDownloadPath}
                    onChange={(e) => {
                      setDefaultDownloadPath(e.target.value);
                      setSaved(false);
                    }}
                    placeholder="~/downloads/vidsync"
                    size="small"
                    variant="outlined"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button
                            size="small"
                            onClick={handleBrowseDownloadPath}
                            startIcon={<Folder size={16} />}
                            sx={{ textTransform: 'none' }}
                          >
                            Browse
                          </Button>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Files will be downloaded to this location by default. You can also override this per project.
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={saveDownloadPath}
                    disabled={downloadPathSaving}
                  >
                    {downloadPathSaving ? 'Saving...' : 'Save Path'}
                  </Button>
                </Stack>
              </SettingSection>
            </Box>
          )}

          {/* Preference Settings */}
          {activeTab === 'preferences' && (
            <Box>
              <SettingSection title="Theme">
                <RadioGroup
                  value={preferences.theme}
                  onChange={(e) => handlePreferenceChange('theme', e.target.value)}
                >
                  <FormControlLabel value="light" control={<Radio />} label="Light" />
                  <FormControlLabel value="dark" control={<Radio />} label="Dark" />
                  <FormControlLabel value="auto" control={<Radio />} label="Auto (Follow System)" />
                </RadioGroup>
              </SettingSection>

              <SettingSection title="Auto-Sync Projects">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={preferences.autoSync}
                      onChange={() => handlePreferenceChange('autoSync', !preferences.autoSync)}
                    />
                  }
                  label="Automatically sync projects at scheduled intervals"
                />
              </SettingSection>

              <SettingSection title="Conflict Resolution">
                <Select
                  fullWidth
                  value={preferences.conflictResolution}
                  onChange={(e) => handlePreferenceChange('conflictResolution', e.target.value)}
                >
                  <MenuItem value="ask">Ask Me</MenuItem>
                  <MenuItem value="keepLocal">Keep Local Version</MenuItem>
                  <MenuItem value="keepRemote">Keep Remote Version</MenuItem>
                </Select>
              </SettingSection>

              <SettingSection title="Bandwidth Limit">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={preferences.bandwidthLimit}
                    onChange={(_, val) => handlePreferenceChange('bandwidthLimit', val as number)}
                    sx={{ flex: 1 }}
                  />
                  <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 80 }}>
                    {preferences.bandwidthLimit === 0 ? '∞' : `${preferences.bandwidthLimit}MB`}
                  </Typography>
                </Box>
              </SettingSection>

              <SettingSection title="Thread Settings">
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>Upload Threads: {preferences.uploadThreads}</Typography>
                    <Slider
                      min={1}
                      max={16}
                      step={1}
                      value={preferences.uploadThreads}
                      onChange={(_, val) => handlePreferenceChange('uploadThreads', val as number)}
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>Download Threads: {preferences.downloadThreads}</Typography>
                    <Slider
                      min={1}
                      max={16}
                      step={1}
                      value={preferences.downloadThreads}
                      onChange={(_, val) => handlePreferenceChange('downloadThreads', val as number)}
                    />
                  </Box>
                </Stack>
              </SettingSection>
            </Box>
          )}

          {/* Notification Settings */}
          {activeTab === 'notifications' && (
            <Box>
              <SettingSection title="Notification Preferences">
                <Stack spacing={2}>
                  {[
                    { key: 'projectUpdates', label: 'Project Updates', desc: 'When projects are updated' },
                    { key: 'syncComplete', label: 'Sync Complete', desc: 'When syncing finishes' },
                    { key: 'teamInvites', label: 'Team Invites', desc: 'For team invitations' },
                    { key: 'securityAlerts', label: 'Security Alerts', desc: 'Important security alerts' },
                    { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'Activity summary' },
                    { key: 'emailNotifications', label: 'Email Notifications', desc: 'Via email' },
                  ].map(({ key, label, desc }) => (
                    <FormControlLabel
                      key={key}
                      control={
                        <Checkbox
                          checked={notifications[key as keyof NotificationSettings]}
                          onChange={() => handleNotificationChange(key as keyof NotificationSettings)}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
                          <Typography variant="caption" sx={{ opacity: 0.7 }}>{desc}</Typography>
                        </Box>
                      }
                    />
                  ))}
                </Stack>
              </SettingSection>
            </Box>
          )}

          {/* Device Settings */}
          {activeTab === 'devices' && (
            <Box>
              <SettingSection title="Your Devices">
                {devicesLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress />
                  </Box>
                ) : devices.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No devices registered yet.
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {devices.map((device: any) => (
                      <Paper key={device.id} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
                        <Stack spacing={1}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {device.device_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Device ID: {device.device_id}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Platform: {device.platform}
                          </Typography>
                          {device.syncthing_id ? (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              Syncthing ID: {device.syncthing_id}
                            </Typography>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'warning.main' }}>
                              Syncthing ID: Not set
                            </Typography>
                          )}
                          {device.nebula_ip && (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              Nebula IP: {device.nebula_ip}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Status: {device.is_online ? '✓ Online' : '✗ Offline'}
                          </Typography>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </SettingSection>

              <SettingSection title="Sync Syncthing Device ID">
                <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                  Your local Syncthing device ID needs to be saved to enable inviting other devices for sharing.
                </Typography>
                {syncthingId ? (
                  <Box>
                    <TextField
                      fullWidth
                      label="Local Syncthing Device ID"
                      value={syncthingId}
                      disabled
                      variant="outlined"
                      InputProps={{ readOnly: true }}
                    />
                    <Box sx={{ mt: 2 }}>
                      <Button
                        variant="contained"
                        onClick={handleUpdateSyncthingId}
                        disabled={updatingSyncthingId}
                      >
                        {updatingSyncthingId ? <CircularProgress size={24} /> : 'Save Syncthing ID'}
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Alert severity="warning">
                    Unable to retrieve Syncthing device ID. Make sure Syncthing is running.
                  </Alert>
                )}
              </SettingSection>
            </Box>
          )}

          {/* Save Button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 4 }}>
            <Button
              disableRipple
              variant="contained"
              startIcon={<Check size={20} />}
              onClick={handleSave}
            >
              Save Changes
            </Button>
            {saved && (
              <Alert severity="success" sx={{ flex: 1, py: 1 }}>
                Saved successfully!
              </Alert>
            )}
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

export default SettingsPage;
