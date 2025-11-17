import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Stack,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  useTheme,
  useMediaQuery,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  Paper,
  Tooltip,
} from '@mui/material';
import {
  Settings,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Folder,
  Mail,
} from 'lucide-react';
import { useAppTheme } from '../theme/AppThemeProvider';
import YourProjectsPage from '../pages/Projects/YourProjectsPage';
import InvitedProjectsPage from '../pages/Projects/InvitedProjectsPage';
import ProfilePage from '../pages/Settings/ProfilePage';
import AppSettingsPage from '../pages/AppSettings/SettingsPage';
import SubscriptionPage from '../pages/AppSettings/SubscriptionPage';

type PageType = 'your-projects' | 'invited-projects' | 'profile' | 'settings' | 'subscription';

const SIDEBAR_WIDTH = 280;
const LEFT_PANEL_WIDTH = 280;
const ICON_SIDEBAR_WIDTH = 80;

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { isDark } = useAppTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [currentPage, setCurrentPage] = useState<PageType>('your-projects');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/auth');
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const renderMainContent = () => {
    switch (currentPage) {
      case 'your-projects':
        return <YourProjectsPage onSelectProject={setSelectedProjectId} />;
      case 'invited-projects':
        return <InvitedProjectsPage onSelectProject={setSelectedProjectId} />;
      case 'profile':
        return <ProfilePage />;
      case 'settings':
        return <AppSettingsPage />;
      case 'subscription':
        return <SubscriptionPage />;
      default:
        return <YourProjectsPage onSelectProject={setSelectedProjectId} />;
    }
  };

  // Top Navigation Items
  const topNavItems = [
    { label: 'Your Projects', id: 'your-projects', icon: <Folder size={20} /> },
    { label: 'Invited Projects', id: 'invited-projects', icon: <Mail size={20} /> },
  ];

  // Bottom Navigation Items
  const bottomNavItems = [
    { label: 'Settings', id: 'settings', icon: <Settings size={20} /> },
  ];

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100%', bgcolor: 'background.default' }}>
      {/* Top AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: '100%',
          zIndex: 1300,
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: 'none',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          {/* Left: Menu & Branding */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              sx={{ display: { xs: 'flex', md: 'none' } }}
            >
              <MenuIcon size={24} />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <img
                src={isDark ? '/icons/logo1.png' : '/icons/logo3.png'}
                alt="Vidsync"
                style={{ height: 32, width: 'auto' }}
              />
              <Box sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Vidsync
              </Box>
            </Box>
          </Box>

          {/* Right: User Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              onClick={handleUserMenuOpen}
              sx={{
                cursor: 'pointer',
                width: 36,
                height: 36,
                bgcolor: 'secondary.main',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              U
            </Avatar>
            <Menu
              anchorEl={userMenuAnchor}
              open={Boolean(userMenuAnchor)}
              onClose={handleUserMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={() => { setCurrentPage('profile'); handleUserMenuClose(); }}>
                Profile
              </MenuItem>
              <MenuItem onClick={() => { setCurrentPage('settings'); handleUserMenuClose(); }}>
                Settings
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <LogOut size={18} style={{ marginRight: 8 }} />
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Compact Icon Sidebar */}
      <Paper
        elevation={0}
        sx={{
          width: ICON_SIDEBAR_WIDTH,
          flexShrink: 0,
          marginTop: '64px',
          height: 'calc(100vh - 64px)',
          overflow: 'auto',
          borderRight: 1,
          borderColor: 'divider',
          borderRadius: 1,
          zIndex: 1200,
          display: sidebarOpen ? 'flex' : { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          alignItems: 'center',
          py: 2,
          gap: 1,
          bgcolor: isDark ? '#1E1E1E' : 'background.paper',
        }}
      >
        {/* Top Navigation Icons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {topNavItems.map((item) => (
            <Box
              key={item.id}
              onMouseEnter={() => setHoveredNav(item.id)}
              onMouseLeave={() => setHoveredNav(null)}
              sx={{ position: 'relative' }}
            >
              <Tooltip title={item.label} placement="right" arrow>
                <IconButton
                  disableRipple
                  onClick={() => setCurrentPage(item.id as PageType)}
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 2,
                    bgcolor: currentPage === item.id ? 'primary.main' : 'transparent',
                    color: currentPage === item.id ? 'white' : 'text.primary',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: currentPage === item.id ? 'primary.dark' : 'action.hover',
                    },
                  }}
                >
                  {item.icon}
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Bottom Navigation Icons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {bottomNavItems.map((item) => (
            <Tooltip key={item.id} title={item.label} placement="right" arrow>
              <IconButton
                disableRipple
                onClick={() => setCurrentPage(item.id as PageType)}
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 2,
                  bgcolor: currentPage === item.id ? 'primary.main' : 'transparent',
                  color: currentPage === item.id ? 'white' : 'text.primary',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: currentPage === item.id ? 'primary.dark' : 'action.hover',
                  },
                }}
              >
                {item.icon}
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      </Paper>

      {/* Main Content Area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          marginTop: '64px',
          overflow: 'hidden',
          backgroundColor: 'background.default',
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 0,
          }}
        >
          {renderMainContent()}
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;
