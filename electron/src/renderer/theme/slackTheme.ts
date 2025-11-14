import { createTheme } from '@mui/material/styles';

// Slack-like color palette
const slackTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0A66C2', // Slack blue
      light: '#4A90E2',
      dark: '#003EA1',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#E01E5A', // Slack red
      light: '#F5A623',
      dark: '#8B0000',
      contrastText: '#ffffff',
    },
    background: {
      default: '#FFFFFF',
      paper: '#F8F9FA',
    },
    text: {
      primary: '#2C3E50',
      secondary: '#7F8FA4',
    },
    action: {
      hover: 'rgba(10, 102, 194, 0.08)',
      selected: 'rgba(10, 102, 194, 0.16)',
    },
    divider: '#E1E8ED',
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
      main: '#0A66C2',
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
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      color: '#2C3E50',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 700,
      color: '#2C3E50',
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 600,
      color: '#2C3E50',
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 600,
      color: '#2C3E50',
    },
    h5: {
      fontSize: '1rem',
      fontWeight: 600,
      color: '#2C3E50',
    },
    h6: {
      fontSize: '0.875rem',
      fontWeight: 600,
      color: '#2C3E50',
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.5,
      color: '#2C3E50',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      color: '#7F8FA4',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          padding: '8px 16px',
          fontSize: '0.875rem',
          fontWeight: 600,
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
        contained: {
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.15)',
          },
        },
        outlined: {
          borderColor: '#E1E8ED',
          color: '#2C3E50',
          '&:hover': {
            borderColor: '#0A66C2',
            backgroundColor: 'rgba(10, 102, 194, 0.08)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          border: '1px solid #E1E8ED',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
            borderColor: '#D1D8E0',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '6px',
            backgroundColor: '#FFFFFF',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              borderColor: '#0A66C2',
            },
            '&.Mui-focused': {
              boxShadow: '0 0 0 3px rgba(10, 102, 194, 0.1)',
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#0A66C2',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
          backgroundColor: '#FFFFFF',
          color: '#2C3E50',
          borderBottom: '1px solid #E1E8ED',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        root: {
          backgroundColor: '#F8F9FA',
          borderRight: '1px solid #E1E8ED',
        },
      },
    },
  },
  shape: {
    borderRadius: 6,
  },
});

export default slackTheme;
