import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiClient, setUnauthorizedHandler } from '../services/apiClient';
import { mergeMeIntoUser, normalizeUserRecord, type User } from '../utils/authSession';

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  login: () => {},
  logout: () => {},
});

function readStoredToken(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeUserRecord(parsed);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [user, setUser] = useState<User | null>(readStoredUser);
  const hydratedTokenRef = useRef<string | null>(null);

  const login = useCallback((newToken: string, userData: User) => {
    hydratedTokenRef.current = userData.company ? newToken : null;
    try {
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch {
      // Ignore storage errors in restricted environments
    }
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    hydratedTokenRef.current = null;
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch {
      // Ignore storage errors in restricted environments
    }
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Hydrate missing tenant/company info (e.g. legacy localStorage sessions or minimal login payload)
  useEffect(() => {
    if (!token || user?.company || hydratedTokenRef.current === token) {
      return;
    }

    let cancelled = false;

    apiClient
      .get<unknown>('/api/auth/me', { token })
      .then((meData) => {
        if (cancelled) return;
        hydratedTokenRef.current = token;

        setUser((prev) => {
          const nextUser = mergeMeIntoUser(meData, prev);
          if (nextUser) {
            try {
              localStorage.setItem('user', JSON.stringify(nextUser));
            } catch {
              // Ignore storage errors in restricted environments
            }
          }
          return nextUser;
        });
      })
      .catch(() => {
        if (!cancelled) {
          hydratedTokenRef.current = token;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, user?.company]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
