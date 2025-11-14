import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/Auth/AuthPage';
import MainLayout from './layouts/MainLayout';
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
                // Silently fail in production
              }
            } catch (e) {
              // Silently fail in production
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
            path="/app" 
            element={isAuthenticated ? <MainLayout /> : <Navigate to="/auth" />} 
          />
          <Route path="/" element={<Navigate to={isAuthenticated ? "/app" : "/auth"} />} />
          <Route path="*" element={<Navigate to={isAuthenticated ? "/app" : "/auth"} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
