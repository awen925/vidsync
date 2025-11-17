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
} from '@mui/material';
import {
  Settings,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Folder,
  Mail,
} from 'lucide-react';
import YourProjectsPage from '../pages/Projects/YourProjectsPage';
import InvitedProjectsPage from '../pages/Projects/InvitedProjectsPage';
import ProfilePage from '../pages/Settings/ProfilePage';
import AppSettingsPage from '../pages/AppSettings/SettingsPage';
import SubscriptionPage from '../pages/AppSettings/SubscriptionPage';

type PageType = 'your-projects' | 'invited-projects' | 'profile' | 'settings' | 'subscription';

const SIDEBAR_WIDTH = 280;
const LEFT_PANEL_WIDTH = 280;

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [currentPage, setCurrentPage] = useState<PageType>('your-projects');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
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
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          {/* Left: Menu & Branding */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              sx={{ display: { xs: 'flex', md: sidebarOpen ? 'none' : 'flex' } }}
            >
              <MenuIcon size={24} />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <img
                src="/icons/logo1.png"
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

      {/* Left Sidebar - Navigation */}
      <Paper
        sx={{
          width: sidebarOpen ? SIDEBAR_WIDTH : 0,
          flexShrink: 0,
          marginTop: '64px',
          height: 'calc(100vh - 64px)',
          overflow: 'hidden',
          transition: 'width 0.3s ease',
          borderRight: 1,
          borderColor: 'divider',
          zIndex: 1200,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Top Navigation */}
          <Box sx={{ p: 2 }}>
            <List sx={{ p: 0 }}>
              {topNavItems.map((item) => (
                <ListItem key={item.id} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    selected={currentPage === item.id}
                    onClick={() => setCurrentPage(item.id as PageType)}
                    sx={{
                      borderRadius: 1,
                      '&.Mui-selected': {
                        bgcolor: 'action.selected',
                        color: 'primary.main',
                        fontWeight: 600,
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {item.icon}
                      <span>{item.label}</span>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          <Divider />

          {/* Flex spacer */}
          <Box sx={{ flex: 1 }} />

          {/* Bottom Navigation */}
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            <List sx={{ p: 0 }}>
              {bottomNavItems.map((item) => (
                <ListItem key={item.id} disablePadding>
                  <ListItemButton
                    selected={currentPage === item.id}
                    onClick={() => setCurrentPage(item.id as PageType)}
                    sx={{
                      borderRadius: 1,
                      '&.Mui-selected': {
                        bgcolor: 'action.selected',
                        color: 'primary.main',
                        fontWeight: 600,
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {item.icon}
                      <span>{item.label}</span>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
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
