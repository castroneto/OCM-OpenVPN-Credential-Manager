import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AdminUser } from '../lib/types';
import { api, setToken } from '../lib/api';

interface AuthState {
  user: AdminUser | null;
  loading: boolean;
  /** True until the first admin exists (drives the first-run setup screen). */
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<void>;
  completeSetup: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await api.setupStatus();
        if (!active) return;
        setNeedsSetup(status.needsSetup);
        // No admin yet → no session to restore; go straight to setup.
        if (!status.needsSetup) {
          const me = await api.me();
          if (active) setUser(me);
        }
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await api.login(username, password);
    setToken(tokens.accessToken);
    const me = await api.me();
    setUser(me);
  }, []);

  const completeSetup = useCallback(
    async (username: string, password: string) => {
      const tokens = await api.setup(username, password);
      setToken(tokens.accessToken);
      const me = await api.me();
      setUser(me);
      setNeedsSetup(false);
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, needsSetup, login, completeSetup, logout }),
    [user, loading, needsSetup, login, completeSetup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
