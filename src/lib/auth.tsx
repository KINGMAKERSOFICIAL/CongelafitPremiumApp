import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setAuthToken } from './api';
import { clearRecipeImageOverrides, loadRecipeImageOverrides } from './recipeImages';

export interface MemberUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending' | 'refunded' | 'canceled';
  affiliateLink: string;
  kiwifyProduct: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AppPublicConfig {
  kiwifyCheckoutUrl: string;
  kiwifyAffiliateInviteUrl: string;
}

interface AuthContextValue {
  user: MemberUser | null;
  config: AppPublicConfig;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  firstAccess: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  saveAffiliateLink: (affiliateLink: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_CONFIG: AppPublicConfig = {
  kiwifyCheckoutUrl: '',
  kiwifyAffiliateInviteUrl: '',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MemberUser | null>(null);
  const [config, setConfig] = useState<AppPublicConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: MemberUser | null; config: AppPublicConfig }>('/api/auth/me');
      setUser(data.user);
      setConfig(data.config ?? DEFAULT_CONFIG);
      if (data.user) {
        void loadRecipeImageOverrides();
      } else {
        clearRecipeImageOverrides();
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: MemberUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    void loadRecipeImageOverrides();
  }, []);

  const firstAccess = useCallback(async (email: string, password: string, name?: string) => {
    const res = await apiFetch<{ token: string; user: MemberUser }>('/api/auth/first-access', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    void loadRecipeImageOverrides();
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignora */
    }
    setAuthToken(null);
    setUser(null);
    clearRecipeImageOverrides();
  }, []);

  const saveAffiliateLink = useCallback(async (affiliateLink: string) => {
    const res = await apiFetch<{ user: MemberUser }>('/api/auth/affiliate-link', {
      method: 'POST',
      body: JSON.stringify({ affiliateLink }),
    });
    setUser(res.user);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await apiFetch('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        config,
        loading,
        login,
        firstAccess,
        logout,
        saveAffiliateLink,
        changePassword,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
