import { decryptSecret } from './auth.ts';
import type { AppSettings, MemberStatus } from './types.ts';

const KIWIFY_API_BASE = 'https://public-api.kiwify.com';

export interface ResolvedKiwifyApiConfig {
  clientId: string;
  clientSecret: string;
  accountId: string;
  productId: string;
  configured: boolean;
  envConfigured: boolean;
}

export function resolveKiwifyApiConfig(settings: AppSettings, secret: string): ResolvedKiwifyApiConfig {
  const envClientId = (process.env.KIWIFY_CLIENT_ID || '').trim();
  const envClientSecret = (process.env.KIWIFY_CLIENT_SECRET || '').trim();
  const envAccountId = (process.env.KIWIFY_ACCOUNT_ID || '').trim();
  const envProductId = (process.env.KIWIFY_PRODUCT_ID || '').trim();

  const clientId = envClientId || (settings.kiwifyClientId || '').trim();
  const clientSecret = envClientSecret || decryptSecret(settings.kiwifyClientSecretEnc, secret);
  const accountId = envAccountId || (settings.kiwifyAccountId || '').trim();
  const productId = envProductId || (settings.kiwifyProductId || '').trim();

  return {
    clientId,
    clientSecret,
    accountId,
    productId,
    configured: Boolean(clientId && clientSecret && accountId),
    envConfigured: Boolean(envClientId && envClientSecret && envAccountId),
  };
}

let tokenCache: { key: string; accessToken: string; expiresAt: number } | null = null;

export async function fetchKiwifyOAuthToken(cfg: ResolvedKiwifyApiConfig): Promise<string> {
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Client ID e Client Secret da API da Kiwify não configurados.');
  }
  const cacheKey = `${cfg.clientId}:${cfg.accountId}`;
  if (tokenCache && tokenCache.key === cacheKey && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const resp = await fetch(`${KIWIFY_API_BASE}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const rawText = await resp.text();
  let parsed: { access_token?: string; expires_in?: number; message?: string; error?: string } = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    /* texto simples */
  }

  if (!resp.ok || !parsed.access_token) {
    throw new Error(
      parsed.message || parsed.error || `Falha ao autenticar na API da Kiwify (HTTP ${resp.status}).`,
    );
  }

  const ttlMs = (Number(parsed.expires_in) || 3600) * 1000;
  tokenCache = {
    key: cacheKey,
    accessToken: parsed.access_token,
    expiresAt: Date.now() + ttlMs,
  };
  return parsed.access_token;
}

export interface KiwifySaleRecord {
  orderId: string;
  email: string;
  name: string;
  productId: string;
  productName: string;
  rawStatus: string;
  mappedStatus: MemberStatus | null;
  subscriptionId?: string;
  nextPaymentAt?: string;
  updatedAt?: string;
}

export function mapKiwifySaleStatus(rawStatus: string, subscriptionStatus?: string): MemberStatus | null {
  const s = rawStatus.trim().toLowerCase();
  const sub = (subscriptionStatus || '').trim().toLowerCase();

  if (['refunded', 'chargedback', 'chargeback'].includes(s)) return 'refunded';
  if (['canceled', 'cancelled'].includes(s) || ['canceled', 'cancelled', 'expired'].includes(sub)) return 'canceled';
  if (['refused', 'late', 'overdue', 'expired', 'unpaid'].includes(s) || ['late', 'overdue', 'past_due'].includes(sub)) {
    return 'suspended';
  }
  if (['waiting_payment', 'pending', 'processing'].includes(s) || sub === 'waiting_payment') return 'pending';
  if (['paid', 'approved', 'completed', 'active'].includes(s) || sub === 'active') return 'active';
  return null;
}

export async function fetchKiwifySalesPage(
  cfg: ResolvedKiwifyApiConfig,
  opts: { startDate?: string; endDate?: string; pageNumber?: number; pageSize?: number } = {},
): Promise<{ sales: KiwifySaleRecord[]; hasMore: boolean }> {
  if (!cfg.configured) {
    throw new Error('Configure Client ID, Client Secret e Account ID da Kiwify antes de sincronizar.');
  }

  const token = await fetchKiwifyOAuthToken(cfg);
  const now = new Date();
  const startDefault = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDefault = now.toISOString().slice(0, 10);

  const url = new URL(`${KIWIFY_API_BASE}/v1/sales`);
  url.searchParams.set('start_date', opts.startDate || startDefault);
  url.searchParams.set('end_date', opts.endDate || endDefault);
  url.searchParams.set('page_number', String(opts.pageNumber || 1));
  url.searchParams.set('page_size', String(opts.pageSize || 50));
  if (cfg.productId) {
    url.searchParams.set('product_id', cfg.productId);
  }

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-kiwify-account-id': cfg.accountId,
    },
  });

  const text = await resp.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* ignora */
  }

  if (!resp.ok) {
    const errMsg =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.error === 'string' && json.error) ||
      `Erro ao consultar vendas na Kiwify (HTTP ${resp.status}).`;
    throw new Error(errMsg);
  }

  const rawList = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json.sales)
      ? json.sales
      : Array.isArray(json)
        ? (json as unknown[])
        : [];

  const sales: KiwifySaleRecord[] = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    const customer = (r.customer ?? r.Customer ?? {}) as Record<string, unknown>;
    const product = (r.product ?? r.Product ?? {}) as Record<string, unknown>;
    const subscription = (r.subscription ?? r.Subscription ?? {}) as Record<string, unknown>;

    const email = String(customer.email ?? r.customer_email ?? r.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;

    const name =
      String(customer.name ?? customer.full_name ?? r.customer_name ?? 'Aluno Kiwify').trim().slice(0, 120) ||
      'Aluno Kiwify';
    const orderId = String(r.id ?? r.order_id ?? r.reference ?? '').trim().slice(0, 80);
    const productId = String(product.id ?? product.product_id ?? r.product_id ?? '').trim();
    const productName = String(product.name ?? product.product_name ?? r.product_name ?? 'CongelaFit Premium').trim();
    const rawStatus = String(r.status ?? r.order_status ?? '').trim().toLowerCase();
    const subStatus = String(subscription.status ?? '').trim().toLowerCase();
    const subscriptionId = String(subscription.id ?? r.subscription_id ?? '').trim() || undefined;
    const nextPaymentAt = String(subscription.next_payment ?? '').trim() || undefined;
    const updatedAt = String(r.updated_at ?? r.approved_date ?? r.created_at ?? '').trim() || undefined;

    if (cfg.productId && productId && productId !== cfg.productId) {
      continue;
    }

    sales.push({
      orderId,
      email,
      name,
      productId,
      productName,
      rawStatus,
      mappedStatus: mapKiwifySaleStatus(rawStatus, subStatus),
      subscriptionId,
      nextPaymentAt,
      updatedAt,
    });
  }

  const pagination = (json.pagination ?? {}) as Record<string, unknown>;
  const hasMore =
    Boolean(pagination.next_page) ||
    (typeof pagination.count === 'number' && sales.length >= (opts.pageSize || 50));

  return { sales, hasMore };
}
