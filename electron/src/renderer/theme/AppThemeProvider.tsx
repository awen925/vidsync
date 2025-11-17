import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { createTheme } from '@mui/material/styles';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Light theme - Lagoon color scheme
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0891B2', // Lagoon teal
      light: '#06B6D4',
      dark: '#0E7490',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#14B8A6', // Lagoon green
      light: '#2DD4BF',
      dark: '#0D9488',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F0F9FB', // Very light lagoon background
      paper: '#E0F2FE', // Light cyan paper
    },
    text: {
      primary: '#164E63',
      secondary: '#475569',
    },
    action: {
      hover: 'rgba(8, 145, 178, 0.08)',
      selected: 'rgba(8, 145, 178, 0.16)',
    },
    divider: '#CFFAFE',
    success: {
      main: '#2EBD6E',
    },
    warning: {
      main: '#F5A623',
    },
    error: {
      main: '#E01E5A',
    },
    info: {
      main: '#0891B2',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
});

// Dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4A90E2', // Lighter blue for dark mode
      light: '#6BA3F0',
      dark: '#0A66C2',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#F5A623', // Lighter red for dark mode
      light: '#F5B649',
      dark: '#E01E5A',
      contrastText: '#ffffff',
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#B0B0B0',
    },
    action: {
      hover: 'rgba(74, 144, 226, 0.12)',
      selected: 'rgba(74, 144, 226, 0.24)',
    },
    divider: '#333333',
    success: {
      main: '#4ECB71',
    },
    warning: {
      main: '#F5B649',
    },
    error: {
      main: '#F5A623',
    },
    info: {
      main: '#4A90E2',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
});

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return context;
};

interface AppThemeProviderProps {
  children: React.ReactNode;
}

export const AppThemeProvider: React.FC<AppThemeProviderProps> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [isDark, setIsDark] = useState(false);

  // Load theme preference from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('vidsync_theme') as ThemeMode;
    if (savedMode && ['light', 'dark', 'auto'].includes(savedMode)) {
      setModeState(savedMode);
    }
  }, []);

  // Determine actual theme based on mode and system preference
  useEffect(() => {
    const updateTheme = () => {
      if (mode === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDark(prefersDark);
      } else {
        setIsDark(mode === 'dark');
      }
    };

    updateTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateTheme);
    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, [mode]);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem('vidsync_theme', newMode);
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ mode, isDark, setMode }}>
      <MuiThemeProvider theme={theme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

export default AppThemeProvider;
