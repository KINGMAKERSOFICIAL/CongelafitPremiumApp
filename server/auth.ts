import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { isAccessValid } from './kiwify.ts';
import type { StoredUser } from './types.ts';

export const SESSION_COOKIE = 'cf_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

let cachedSecret: string | null = null;

export function getSessionSecret(dataDir: string): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    cachedSecret = process.env.SESSION_SECRET;
    return cachedSecret;
  }
  const secretFile = path.join(dataDir, 'session.key');
  try {
    if (fs.existsSync(secretFile)) {
      const val = fs.readFileSync(secretFile, 'utf8').trim();
      if (val.length >= 32) {
        cachedSecret = val;
        return cachedSecret;
      }
    }
  } catch {
    /* gera novo segredo abaixo */
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  cachedSecret = generated;
  return cachedSecret;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash: derived, salt: usedSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!hash || !salt) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  uid: string;
  exp: number;
}

export function signSession(userId: string, secret: string): string {
  const payload: SessionPayload = { uid: userId, exp: Date.now() + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined, secret: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function extractToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE];
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function publicUser(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    affiliateLink: u.affiliateLink ?? '',
    kiwifyProduct: u.kiwifyProduct ?? '',
    accessUntil: u.accessUntil ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  };
}

export interface AuthedRequest extends Request {
  user?: StoredUser;
}

export function createAuthMiddleware(
  getDb: () => { users: StoredUser[] },
  secret: string,
) {
  const attachUser = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    const session = verifySession(token, secret);
    if (session) {
      const user = getDb().users.find((u) => u.id === session.uid);
      if (user && isAccessValid(user)) {
        req.user = user;
      }
    }
    next();
  };

  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sessão expirada ou acesso não autorizado.' });
      return;
    }
    next();
  };

  const requireAdmin = (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Sessão expirada ou acesso não autorizado.' });
      return;
    }
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Acesso restrito ao administrador.' });
      return;
    }
    next();
  };

  return { attachUser, requireAuth, requireAdmin };
}
