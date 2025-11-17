import React, { useState, useEffect } from 'react';
import { Settings, Bell, Sliders, Save } from 'lucide-react';
import { useAppTheme } from '../../theme/AppThemeProvider';

type SettingsTab = 'general' | 'preferences' | 'notifications';

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

  // Sync preferences with stored values
  useEffect(() => {
    setPreferences(prev => ({
      ...prev,
      theme: mode as any,
    }));
  }, [mode]);

  const [language, setLanguage] = useState('en');
  const [defaultSyncInterval, setDefaultSyncInterval] = useState(30);

  const handleNotificationChange = (key: keyof NotificationSettings) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handlePreferenceChange = (key: keyof PreferenceSettings, value: any) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    
    // If theme is being changed, update the app theme immediately
    if (key === 'theme') {
      setMode(value as 'light' | 'dark' | 'auto');
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 ml-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-6xl mx-auto px-8 py-12">
          <div className="flex items-center gap-3">
            <Settings size={32} />
            <h1 className="text-4xl font-bold">Settings</h1>
          </div>
          <p className="text-blue-100 mt-2">Customize your experience</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Tabs */}
          <div className="w-48">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setActiveTab('general')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'general'
                    ? 'bg-blue-50 border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Settings size={18} />
                  General
                </div>
              </button>
              <button
                onClick={() => setActiveTab('preferences')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'preferences'
                    ? 'bg-blue-50 border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sliders size={18} />
                  Preferences
                </div>
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'notifications'
                    ? 'bg-blue-50 border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bell size={18} />
                  Notifications
                </div>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="bg-white rounded-lg border border-gray-200 p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">General Settings</h2>

                {/* Language */}
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Language</label>
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      setSaved(false);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                  </select>
                </div>

                {/* Default Sync Interval */}
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Default Sync Interval (minutes)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="5"
                      max="120"
                      step="5"
                      value={defaultSyncInterval}
                      onChange={(e) => {
                        setDefaultSyncInterval(parseInt(e.target.value));
                        setSaved(false);
                      }}
                      className="flex-1"
                    />
                    <span className="text-2xl font-bold text-blue-600 w-16 text-right">
                      {defaultSyncInterval}
                    </span>
                  </div>
                </div>

                {/* Storage Info */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage & Cache</h3>
                  <div className="space-y-3">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Cache Size</p>
                      <p className="text-lg font-bold text-gray-900">2.3 GB</p>
                    </div>
                    <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                      <p className="font-medium text-gray-900">Clear Cache</p>
                      <p className="text-sm text-gray-600 mt-1">Free up space by clearing cached files</p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Preference Settings */}
            {activeTab === 'preferences' && (
              <div className="bg-white rounded-lg border border-gray-200 p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Preferences</h2>

                {/* Theme */}
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Theme</label>
                  <div className="flex gap-4">
                    {['light', 'dark', 'auto'].map(theme => (
                      <label key={theme} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="theme"
                          value={theme}
                          checked={preferences.theme === theme}
                          onChange={() => handlePreferenceChange('theme', theme as any)}
                          className="w-4 h-4"
                        />
                        <span className="capitalize text-gray-700">{theme}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Auto Sync */}
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.autoSync}
                      onChange={() => handlePreferenceChange('autoSync', !preferences.autoSync)}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Auto-Sync Projects</p>
                      <p className="text-sm text-gray-600">Automatically sync projects at scheduled intervals</p>
                    </div>
                  </label>
                </div>

                {/* Conflict Resolution */}
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Conflict Resolution Strategy
                  </label>
                  <select
                    value={preferences.conflictResolution}
                    onChange={(e) => handlePreferenceChange('conflictResolution', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ask">Ask Me</option>
                    <option value="keepLocal">Keep Local Version</option>
                    <option value="keepRemote">Keep Remote Version</option>
                  </select>
                </div>

                {/* Bandwidth Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Bandwidth</h3>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Bandwidth Limit (MB/s)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={preferences.bandwidthLimit}
                        onChange={(e) => handlePreferenceChange('bandwidthLimit', parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-2xl font-bold text-blue-600 w-16 text-right">
                        {preferences.bandwidthLimit === 0 ? '∞' : preferences.bandwidthLimit}
                      </span>
                    </div>
                  </div>

                  {/* Thread Settings */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Upload Threads
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="16"
                          step="1"
                          value={preferences.uploadThreads}
                          onChange={(e) => handlePreferenceChange('uploadThreads', parseInt(e.target.value))}
                          className="flex-1"
                        />
                        <span className="text-lg font-bold text-gray-900 w-8 text-center">
                          {preferences.uploadThreads}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Download Threads
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="16"
                          step="1"
                          value={preferences.downloadThreads}
                          onChange={(e) => handlePreferenceChange('downloadThreads', parseInt(e.target.value))}
                          className="flex-1"
                        />
                        <span className="text-lg font-bold text-gray-900 w-8 text-center">
                          {preferences.downloadThreads}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notification Settings */}
            {activeTab === 'notifications' && (
              <div className="bg-white rounded-lg border border-gray-200 p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Notification Settings</h2>

                <div className="space-y-4">
                  {[
                    {
                      key: 'projectUpdates' as const,
                      label: 'Project Updates',
                      description: 'Get notified when projects are updated'
                    },
                    {
                      key: 'syncComplete' as const,
                      label: 'Sync Complete',
                      description: 'Notify when syncing finishes'
                    },
                    {
                      key: 'teamInvites' as const,
                      label: 'Team Invites',
                      description: 'Receive notifications for team invitations'
                    },
                    {
                      key: 'securityAlerts' as const,
                      label: 'Security Alerts',
                      description: 'Important alerts about account security'
                    },
                    {
                      key: 'weeklyDigest' as const,
                      label: 'Weekly Digest',
                      description: 'Receive a weekly summary of activity'
                    },
                    {
                      key: 'emailNotifications' as const,
                      label: 'Email Notifications',
                      description: 'Send notifications via email'
                    },
                  ].map(({ key, label, description }) => (
                    <label
                      key={key}
                      className="flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={notifications[key]}
                        onChange={() => handleNotificationChange(key)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{label}</p>
                        <p className="text-sm text-gray-600">{description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Save size={20} />
                Save Changes
              </button>
              {saved && (
                <div className="text-green-600 font-medium flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                  Saved successfully!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
