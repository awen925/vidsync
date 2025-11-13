import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// styles are imported globally from App.tsx
import { cloudAPI } from '../../hooks/useCloudApi';
import { supabase } from '../../lib/supabaseClient';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [downloadPath, setDownloadPath] = React.useState('~/Downloads');
  const [autoSync, setAutoSync] = React.useState(true);
  const [syncMode, setSyncMode] = React.useState<'automatic' | 'manual'>('automatic');
  const [saving, setSaving] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

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
    try {
      await cloudAPI.put('/users/settings', {
        defaultDownloadPath: downloadPath,
        autoSync,
        syncMode,
      });
      alert('Settings saved successfully');
    } catch (error) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // Clear Supabase session
      await supabase.auth.signOut();
      
      // Clear secure refresh token
      await (window as any).api.secureStore.clearRefreshToken();
      
      // Redirect to auth page
      navigate('/auth');
    } catch (error) {
      console.error('Failed to logout:', error);
      alert('Logout failed');
      setLoggingOut(false);
    }
  };

  return (
    <div className="settings-container">
      <h1>Settings</h1>

      <div className="settings-section">
        <h2>Sync Preferences</h2>

        <div className="setting-item">
          <label>Default Download Path</label>
          <div className="path-input">
            <input
              type="text"
              value={downloadPath}
              onChange={(e) => setDownloadPath(e.target.value)}
              readOnly
            />
            <button onClick={handleBrowseDirectory}>Browse</button>
          </div>
        </div>

        <div className="setting-item">
          <label>Auto Sync</label>
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
          />
        </div>

        <div className="setting-item">
          <label>Sync Mode</label>
          <select value={syncMode} onChange={(e) => setSyncMode(e.target.value as any)}>
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #ddd' }}>
        <h2>Account</h2>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="btn-danger"
          style={{ background: '#dc3545', color: 'white', padding: '0.5rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {loggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
