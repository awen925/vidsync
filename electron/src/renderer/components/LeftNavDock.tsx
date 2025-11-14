import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

interface LeftNavDockProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const LeftNavDock: React.FC<LeftNavDockProps> = ({ currentPage, onNavigate }) => {
  const navigate = useNavigate();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const navItems = [
    {
      id: 'your-projects',
      label: 'Your Projects',
      icon: '📁',
      description: 'Manage your projects'
    },
    {
      id: 'invited-projects',
      label: 'Invited Projects',
      icon: '👥',
      description: 'Projects shared with you'
    },
  ];

  const handleLogout = () => {
    // Clear auth tokens
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/auth');
  };

  return (
    <div className="fixed left-0 top-0 h-screen w-20 bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900 shadow-lg flex flex-col items-center py-6 z-40">
      {/* Logo/App Icon */}
      <div className="mb-8">
        <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform">
          <span className="text-2xl">📤</span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 flex flex-col gap-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${
              currentPage === item.id
                ? 'bg-blue-400 text-white shadow-lg scale-110'
                : 'text-blue-200 hover:bg-blue-700 hover:text-white'
            }`}
            title={item.label}
          >
            <span className="text-2xl">{item.icon}</span>

            {/* Tooltip */}
            <div className="absolute left-full ml-3 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {item.label}
              <div className="text-xs text-gray-400 mt-1">{item.description}</div>
            </div>
          </button>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-3 pt-4 border-t border-blue-700">
        {/* Settings Button */}
        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="w-14 h-14 rounded-xl flex items-center justify-center text-blue-200 hover:bg-blue-700 hover:text-white transition-all duration-200 group relative"
          title="Settings"
        >
          <span className="text-2xl">⚙️</span>
          <div className="absolute left-full ml-3 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Settings
          </div>
        </button>

        {/* Profile Button */}
        <button
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="w-14 h-14 rounded-xl flex items-center justify-center text-blue-200 hover:bg-blue-700 hover:text-white transition-all duration-200 group relative"
          title="Profile"
        >
          <span className="text-2xl">👤</span>
          <div className="absolute left-full ml-3 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Profile
          </div>
        </button>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-14 h-14 rounded-xl flex items-center justify-center text-red-300 hover:bg-red-600 hover:text-white transition-all duration-200 group relative"
          title="Logout"
        >
          <LogOut size={24} />
          <div className="absolute left-full ml-3 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Logout
          </div>
        </button>
      </div>

      {/* Settings Dropdown - positioned absolutely */}
      {isSettingsOpen && (
        <div className="absolute left-20 bottom-20 bg-white rounded-lg shadow-xl w-48 z-50">
          <button
            onClick={() => {
              onNavigate('settings');
              setIsSettingsOpen(false);
            }}
            className="w-full text-left px-4 py-3 hover:bg-gray-100 text-gray-700 font-medium rounded-t-lg"
          >
            ⚙️ Settings
          </button>
          <button
            onClick={() => {
              onNavigate('preferences');
              setIsSettingsOpen(false);
            }}
            className="w-full text-left px-4 py-3 hover:bg-gray-100 text-gray-700 font-medium"
          >
            🎨 Preferences
          </button>
          <button
            onClick={() => {
              onNavigate('notifications');
              setIsSettingsOpen(false);
            }}
            className="w-full text-left px-4 py-3 hover:bg-gray-100 text-gray-700 font-medium rounded-b-lg border-t"
          >
            🔔 Notifications
          </button>
        </div>
      )}

      {/* Profile Dropdown */}
      {isProfileOpen && (
        <div className="absolute left-20 bottom-20 bg-white rounded-lg shadow-xl w-48 z-50">
          <button
            onClick={() => {
              onNavigate('profile');
              setIsProfileOpen(false);
            }}
            className="w-full text-left px-4 py-3 hover:bg-gray-100 text-gray-700 font-medium rounded-t-lg"
          >
            👤 My Profile
          </button>
          <button
            onClick={() => {
              onNavigate('subscription');
              setIsProfileOpen(false);
            }}
            className="w-full text-left px-4 py-3 hover:bg-gray-100 text-gray-700 font-medium rounded-b-lg border-t"
          >
            💎 Subscription
          </button>
        </div>
      )}
    </div>
  );
};

export default LeftNavDock;
