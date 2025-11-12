import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/Auth/AuthPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ProjectsPage from './pages/Projects/ProjectsPage';
import ProjectDetailPage from './pages/Projects/ProjectDetailPage';
import SettingsPage from './pages/Settings/SettingsPage';
import './styles/index.css';
import { supabase } from './lib/supabaseClient';

function App() {
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>(false);

  React.useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        // Try to restore session from secure refresh token stored in main process
        if ((window as any).api?.secureStore?.getRefreshToken) {
          const resp = await (window as any).api.secureStore.getRefreshToken();
          const refreshToken = resp?.token;
          if (refreshToken) {
            // Set the session from refresh token
            try {
              const { error: setErr } = await supabase.auth.setSession({ refresh_token: refreshToken } as any);
              if (setErr) {
                console.warn('Failed to set session from refresh token:', setErr);
              }
            } catch (e) {
              console.warn('setSession error', e);
            }
          }
        }

        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setIsAuthenticated(!!data?.session);
      } catch (e) {
        // fallback to localStorage
        setIsAuthenticated(!!localStorage.getItem('token'));
      }
    };
    check();

    const listener = supabase.auth.onAuthStateChange((_: any, session: any) => {
      setIsAuthenticated(!!session);
      // when session changes, persist/clear refresh token in secure store
      (async () => {
        try {
          const refresh = (session as any)?.refresh_token;
          if (refresh && (window as any).api?.secureStore?.setRefreshToken) {
            await (window as any).api.secureStore.setRefreshToken(refresh);
          } else if (!session && (window as any).api?.secureStore?.clearRefreshToken) {
            await (window as any).api.secureStore.clearRefreshToken();
          }
        } catch (e) {}
      })();
    });

    return () => {
      mounted = false;
      try {
        // unsubscribe if available
        (listener as any)?.subscription?.unsubscribe?.();
      } catch (e) {}
    };
  }, []);

  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route 
            path="/dashboard" 
            element={isAuthenticated ? <DashboardPage /> : <Navigate to="/auth" />} 
          />
          <Route
            path="/projects"
            element={isAuthenticated ? <ProjectsPage /> : <Navigate to="/auth" />}
          />
          <Route
            path="/projects/new"
            element={isAuthenticated ? <ProjectsPage /> : <Navigate to="/auth" />}
          />
          <Route
            path="/projects/:projectId"
            element={isAuthenticated ? <ProjectDetailPage /> : <Navigate to="/auth" />}
          />
          <Route 
            path="/settings" 
            element={isAuthenticated ? <SettingsPage /> : <Navigate to="/auth" />} 
          />
          <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/auth"} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
