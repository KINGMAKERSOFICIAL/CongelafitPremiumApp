import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setAuthToken, setUnauthorizedHandler } from './api';
import { setOfficialSiteUrl } from './invite';
import { clearRecipeImageOverrides, loadRecipeImageOverrides } from './recipeImages';

export interface MemberUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending' | 'suspended' | 'refunded' | 'canceled';
  mustChangePassword?: boolean;
  affiliateLink: string;
  kiwifyProduct: string;
  kiwifySubscriptionId?: string;
  nextPaymentAt?: string | null;
  suspendedReason?: string;
  accessEmailSentAt?: string | null;
  accessEmailStatus?: 'sent' | 'failed' | 'outbox' | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AppPublicConfig {
  officialSiteUrl: string;
  kiwifyCheckoutUrl: string;
  kiwifyAffiliateInviteUrl: string;
}

interface AuthContextValue {
  user: MemberUser | null;
  config: AppPublicConfig;
  authNotice: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  firstAccess: (email: string, password: string, name?: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ ok: boolean; message: string; emailConfigured: boolean }>;
  logout: () => Promise<void>;
  saveAffiliateLink: (affiliateLink: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearAuthNotice: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_CONFIG: AppPublicConfig = {
  officialSiteUrl: 'https://www.congelafit.com.br',
  kiwifyCheckoutUrl: 'https://www.congelafit.com.br',
  kiwifyAffiliateInviteUrl: 'https://kiwify.com.br/',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MemberUser | null>(null);
  const [config, setConfig] = useState<AppPublicConfig>(DEFAULT_CONFIG);
  const [authNotice, setAuthNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: MemberUser | null; authNotice?: string; config: AppPublicConfig }>(
        '/api/auth/me',
      );
      const nextCfg = { ...DEFAULT_CONFIG, ...(data.config ?? {}) };
      setOfficialSiteUrl(nextCfg.officialSiteUrl);
      setUser(data.user);
      setConfig(nextCfg);
      if (data.authNotice) setAuthNotice(data.authNotice);
      if (data.user) {
        setAuthNotice('');
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
    setUnauthorizedHandler((code, msg) => {
      setUser(null);
      clearRecipeImageOverrides();
      if (code === 'ACCOUNT_SUSPENDED' && msg) {
        setAuthNotice(msg);
      }
    });
    return () => setUnauthorizedHandler(null);
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
    setAuthNotice('');
    setUser(res.user);
    void loadRecipeImageOverrides();
  }, []);

  const firstAccess = useCallback(async (email: string, password: string, name?: string) => {
    const res = await apiFetch<{ token: string; user: MemberUser }>('/api/auth/first-access', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setAuthToken(res.token);
    setAuthNotice('');
    setUser(res.user);
    void loadRecipeImageOverrides();
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return apiFetch<{ ok: boolean; message: string; emailConfigured: boolean }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
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

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await apiFetch('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      await refresh();
    },
    [refresh],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        config,
        authNotice,
        loading,
        login,
        firstAccess,
        forgotPassword,
        logout,
        saveAffiliateLink,
        changePassword,
        clearAuthNotice: () => setAuthNotice(''),
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
