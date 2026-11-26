import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearCatalogBook, loadCatalogFromServer } from '../data';
import { apiFetch, setAuthToken, setUnauthorizedHandler } from './api';
import { setOfficialSiteUrl } from './invite';
import { clearRecipeImageOverrides, loadRecipeImageOverrides } from './recipeImages';
import { flushUserStoreSync, hydrateUserStoreFromServer, resetLocalStoreOnLogout } from './store';

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
      setConfig(nextCfg);
      if (data.authNotice) setAuthNotice(data.authNotice);
      if (data.user) {
        await loadCatalogFromServer();
        setAuthNotice('');
        setUser(data.user);
        void loadRecipeImageOverrides();
        void hydrateUserStoreFromServer(data.user.id);
      } else {
        setUser(null);
        clearCatalogBook();
        clearRecipeImageOverrides();
      }
    } catch {
      setUser(null);
      clearCatalogBook();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((code, msg) => {
      setUser(null);
      clearCatalogBook();
      clearRecipeImageOverrides();
      resetLocalStoreOnLogout();
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
    await loadCatalogFromServer();
    setAuthNotice('');
    setUser(res.user);
    void loadRecipeImageOverrides();
    void hydrateUserStoreFromServer(res.user.id);
  }, []);

  const firstAccess = useCallback(async (email: string, password: string, name?: string) => {
    const res = await apiFetch<{ token: string; user: MemberUser }>('/api/auth/first-access', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setAuthToken(res.token);
    await loadCatalogFromServer();
    setAuthNotice('');
    setUser(res.user);
    void loadRecipeImageOverrides();
    void hydrateUserStoreFromServer(res.user.id);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return apiFetch<{ ok: boolean; message: string; emailConfigured: boolean }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const logout = useCallback(async () => {
    await flushUserStoreSync(false);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignora */
    }
    setAuthToken(null);
    setUser(null);
    clearCatalogBook();
    clearRecipeImageOverrides();
    resetLocalStoreOnLogout();
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
      const res = await apiFetch<{ ok: boolean; token?: string }>('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.token) setAuthToken(res.token);
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
