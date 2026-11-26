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

const BLOCKED_PATH_PREFIXES = [
  '/.congelafit-data',
  '/.env',
  '/.git',
  '/.svn',
  '/.hg',
  '/.htaccess',
  '/.htpasswd',
  '/server/',
  '/package.json',
  '/package-lock.json',
  '/tsconfig.json',
  '/vite.config',
  '/wp-admin',
  '/wp-login',
  '/wp-content',
  '/wp-includes',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/adminer',
  '/actuator',
  '/cgi-bin',
];

const BLOCKED_EXT_RE = /\.(sqlite|sqlite3|sqlite-wal|sqlite-shm|db|bak|sql|tar|gz|zip|rar|7z|log|php|asp|aspx|jsp|env|ini|pem|key|map)$/i;

const EXTRACTOR_UA_RE =
  /(httrack|webcopier|teleport|offline explorer|cyotek|sitesucker|blackwidow|webzip|backstreet|wget|curl\/|python-requests|python-urllib|aiohttp|httpx|scrapy|go-http-client|libwww-perl|nikto|sqlmap|nmap|masscan|dirbuster|gobuster|feroxbuster|wpscan|nuclei|zgrab|nessus|acunetix|harvest)/i;

export function isBlockedProbePath(rawUrl: string): boolean {
  const pathOnly = rawUrl.split('?')[0]?.trim().toLowerCase() ?? '';
  if (!pathOnly) return false;
  if (pathOnly.includes('..') || pathOnly.includes('%2e%2e') || pathOnly.includes('\0')) {
    return true;
  }
  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`) || pathOnly.startsWith(prefix)) {
      return true;
    }
  }
  if (BLOCKED_EXT_RE.test(pathOnly)) {
    return true;
  }
  return false;
}

export function isBlockedExtractorUserAgent(ua: string | undefined): boolean {
  if (!ua) return false;
  return EXTRACTOR_UA_RE.test(ua);
}

export interface BlockedSecurityEvent {
  eventType: 'probe_path' | 'extractor_ua' | 'brute_force' | 'invalid_content_type';
  ip: string;
  path: string;
  userAgent: string;
  detail: string;
}

export function extractClientIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return fwd || req.ip || 'unknown';
}

export function createBlockExtractorAndProbeMiddleware(onBlock?: (ev: BlockedSecurityEvent) => void) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawUrl = req.originalUrl || req.url || '';
    const pathOnly = (req.path || rawUrl).split('?')[0]?.toLowerCase() ?? '';
    const ua = req.get('user-agent') ?? '';
    const ip = extractClientIp(req);

    if (isBlockedProbePath(rawUrl)) {
      onBlock?.({
        eventType: 'probe_path',
        ip,
        path: pathOnly,
        userAgent: ua,
        detail: `Tentativa de acesso a rota protegida: ${pathOnly}`,
      });
      res.status(403).type('text/plain').send('Acesso bloqueado pela proteção do CongelaFit.');
      return;
    }

    // Webhook da Kiwify e healthcheck podem receber chamadas server-to-server
    const isWebhookOrHealth =
      pathOnly === '/api/health' ||
      pathOnly === '/api/webhooks/kiwify' ||
      pathOnly.startsWith('/api/webhooks/kiwify/');

    if (!isWebhookOrHealth && isBlockedExtractorUserAgent(ua)) {
      onBlock?.({
        eventType: 'extractor_ua',
        ip,
        path: pathOnly,
        userAgent: ua,
        detail: `Ferramenta de extração/scanner bloqueada (${ua.slice(0, 60)})`,
      });
      res.status(403).json({ error: 'Extração automatizada bloqueada pela segurança do CongelaFit.' });
      return;
    }

    next();
  };
}

export const blockExtractorAndProbeMiddleware = createBlockExtractorAndProbeMiddleware();

export function createLoginBruteForceGuard(onBlock?: (ev: BlockedSecurityEvent) => void) {
  const attempts = new Map<string, { fails: number; lockedUntil: number; firstFailAt: number }>();
  const WINDOW_MS = 15 * 60_000;
  const LOCK_MS = 10 * 60_000;
  const MAX_FAILS = 5;

  const keyFor = (req: Request, email: string) => `${extractClientIp(req)}|${email.toLowerCase()}`;

  const checkLocked = (req: Request, email: string): { locked: boolean; retryAfterSec: number } => {
    const now = Date.now();
    if (attempts.size > 3000) {
      for (const [k, v] of attempts) {
        if (v.lockedUntil <= now && now - v.firstFailAt > WINDOW_MS) attempts.delete(k);
      }
    }
    const entry = attempts.get(keyFor(req, email));
    if (entry && entry.lockedUntil > now) {
      return { locked: true, retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)) };
    }
    return { locked: false, retryAfterSec: 0 };
  };

  const recordFailure = (req: Request, email: string) => {
    const now = Date.now();
    const k = keyFor(req, email);
    const cur = attempts.get(k);
    if (!cur || now - cur.firstFailAt > WINDOW_MS) {
      attempts.set(k, { fails: 1, lockedUntil: 0, firstFailAt: now });
      return;
    }
    cur.fails += 1;
    if (cur.fails >= MAX_FAILS) {
      cur.lockedUntil = now + LOCK_MS;
      onBlock?.({
        eventType: 'brute_force',
        ip: extractClientIp(req),
        path: req.path || '/api/auth/login',
        userAgent: req.get('user-agent') ?? '',
        detail: `Bloqueio temporário após ${cur.fails} tentativas inválidas`,
      });
    }
  };

  const clearFailures = (req: Request, email: string) => {
    attempts.delete(keyFor(req, email));
  };

  return { checkLocked, recordFailure, clearFailures };
}

export function requireJsonMutationMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    next();
    return;
  }
  const pathOnly = (req.path || req.originalUrl || '').split('?')[0]?.toLowerCase() ?? '';
  if (
    pathOnly === '/webhooks/kiwify' ||
    pathOnly.startsWith('/webhooks/kiwify/') ||
    pathOnly === '/api/webhooks/kiwify' ||
    pathOnly.startsWith('/api/webhooks/kiwify/') ||
    pathOnly === '/auth/logout' ||
    pathOnly === '/api/auth/logout'
  ) {
    next();
    return;
  }
  const contentLength = Number(req.headers['content-length'] || '0');
  if (contentLength === 0 && !req.headers['transfer-encoding']) {
    next();
    return;
  }
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('application/json')) {
    res.status(415).json({ error: 'Formato de requisição não aceito.' });
    return;
  }
  next();
}

export function applySecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; form-action 'self'");

  const pathOnly = (req.path || req.originalUrl || '').toLowerCase();
  if (pathOnly.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }

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
