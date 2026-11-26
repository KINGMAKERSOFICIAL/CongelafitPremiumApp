import type { NextFunction, Request, Response } from 'express';

const HOST_HEADER_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9-]{1,63}(?::\d{1,5})?$/;

export function sanitizeHostHeader(raw: string | undefined): string {
  if (!raw) return '';
  const first = raw.split(',')[0]?.trim().toLowerCase() ?? '';
  if (!first || first.length > 253) return '';
  if (!HOST_HEADER_RE.test(first)) return '';
  return first;
}

export function extractSafeOriginParts(
  req: Request,
  configuredUrls: Array<string | undefined> = [],
): { requestOrigin: string; publicOrigin: string; host: string } {
  const envOrigin = (process.env.APP_URL || process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const rawProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim().toLowerCase();
  const proto = rawProto === 'http' || rawProto === 'https' ? rawProto : req.protocol === 'http' ? 'http' : 'https';

  const fwdHost = sanitizeHostHeader(req.headers['x-forwarded-host'] as string | undefined);
  const directHost = sanitizeHostHeader(req.get('host'));
  const host = fwdHost || directHost;

  let requestOrigin = '';
  if (envOrigin) {
    try {
      const u = new URL(envOrigin);
      if (u.protocol === 'http:' || u.protocol === 'https:') requestOrigin = u.origin;
    } catch {
      /* ignora env inválida */
    }
  }
  if (!requestOrigin && host) {
    requestOrigin = `${proto}://${host}`;
  }

  // Fallback seguro para o domínio oficial caso não haja host válido
  if (!requestOrigin) {
    for (const candidate of configuredUrls) {
      if (!candidate) continue;
      try {
        const u = new URL(candidate);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          requestOrigin = u.origin;
          break;
        }
      } catch {
        /* ignora */
      }
    }
  }
  if (!requestOrigin) requestOrigin = 'https://www.congelafit.com.br';

  const publicOrigin = requestOrigin.includes('://ais-dev-')
    ? requestOrigin.replace('://ais-dev-', '://ais-pre-')
    : requestOrigin;

  return { requestOrigin, publicOrigin, host };
}

export function isAllowedDomainOrigin(
  origin: string,
  currentHost: string,
  extraAllowedUrls: Array<string | undefined> = [],
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const originHost = parsed.host.toLowerCase();
  const originHostname = parsed.hostname.toLowerCase();

  // Mesma origem do servidor atual
  if (currentHost && originHost === currentHost.toLowerCase()) return true;

  // Domínio oficial CongelaFit e subdomínios
  if (originHostname === 'congelafit.com.br' || originHostname.endsWith('.congelafit.com.br')) {
    return true;
  }

  // URLs configuradas pelo Administrador (site oficial, appBaseUrl, env APP_URL)
  for (const raw of extraAllowedUrls) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.host.toLowerCase() === originHost) return true;
    } catch {
      /* ignora */
    }
  }

  return false;
}

export function applySecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  if (req.secure || proto === 'https' || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function applyCorsPolicy(
  getExtraAllowedUrls: () => Array<string | undefined>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }
    const host = sanitizeHostHeader(req.headers['x-forwarded-host'] as string | undefined) || sanitizeHostHeader(req.get('host'));
    const allowed = isAllowedDomainOrigin(origin, host, getExtraAllowedUrls());
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
      return;
    }
    if (req.method === 'OPTIONS') {
      res.status(403).json({ error: 'Origem não autorizada pelo domínio do CongelaFit.' });
      return;
    }
    next();
  };
}

export function createRateLimiter(opts: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    // Limpa entradas antigas periodicamente para evitar crescimento ilimitado
    if (hits.size > 2000) {
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }

    const fwdIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const key = fwdIp || req.ip || 'unknown';
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    if (entry.count >= opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: opts.message });
      return;
    }

    entry.count += 1;
    next();
  };
}
