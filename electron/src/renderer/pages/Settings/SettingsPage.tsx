import React, { useState } from 'react';
// styles are imported globally from App.tsx
import { cloudAPI } from '../../hooks/useCloudApi';

export const SettingsPage: React.FC = () => {
  const [downloadPath, setDownloadPath] = React.useState('~/Downloads');
  const [autoSync, setAutoSync] = React.useState(true);
  const [syncMode, setSyncMode] = React.useState<'automatic' | 'manual'>('automatic');
  const [saving, setSaving] = React.useState(false);

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
    </div>
  );
};

export default SettingsPage;
