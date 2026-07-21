import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Flex, Spinner } from '@radix-ui/themes';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { CredentialsPage } from './pages/CredentialsPage';
import { AdminsPage } from './pages/AdminsPage';
import type { ReactElement } from 'react';

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading, needsSetup } = useAuth();
  if (loading) {
    return (
      <Flex align="center" justify="center" style={{ height: '100vh' }}>
        <Spinner size="3" />
      </Flex>
    );
  }
  if (needsSetup) return <Navigate to="/setup" replace />;
  return user ? children : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/credentials" replace />} />
            <Route path="/credentials" element={<CredentialsPage />} />
            <Route path="/admins" element={<AdminsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
