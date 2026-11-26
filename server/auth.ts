import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { sanitizeHostHeader } from './security.ts';
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

function deriveEncryptionKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(`congelafit:secrets:${secret}`).digest();
}

export function encryptSecret(plain: string, secret: string): string {
  const clean = plain.trim();
  if (!clean) return '';
  const iv = crypto.randomBytes(12);
  const key = deriveEncryptionKey(secret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(encoded: string | undefined, secret: string): string {
  if (!encoded || !encoded.includes('.')) return '';
  try {
    const [ivB64, tagB64, dataB64] = encoded.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const key = deriveEncryptionKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

const PASS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const GENERIC_FIRST_NAMES = new Set(['membro', 'cliente', 'aluno', 'aluna', 'usuario', 'usuaria']);

/**
 * Gera a senha inicial de novos usuários no formato `<primeironome>12345` (ex.: `dener12345`).
 * Remove acentos/pontuação, converte para minúsculas e garante pelo menos 6 caracteres.
 */
export function generateInitialMemberPassword(name?: string, email?: string): string {
  const normalizeToken = (raw: string): string =>
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const rawName = (name ?? '').trim();
  const firstWord = rawName.split(/[\s-]+/)[0] ?? '';
  let base = normalizeToken(firstWord);

  if (!base || base.length < 2 || GENERIC_FIRST_NAMES.has(base)) {
    const emailLocal = (email ?? '').split('@')[0] ?? '';
    const emailFirst = emailLocal.split(/[._+\-\d]+/).find((p) => p.length >= 2) ?? emailLocal;
    const fromEmail = normalizeToken(emailFirst).replace(/[0-9]+$/g, '');
    if (fromEmail.length >= 2 && !GENERIC_FIRST_NAMES.has(fromEmail)) {
      base = fromEmail;
    } else if (!base || base.length < 2) {
      base = 'membro';
    }
  }

  return `${base.slice(0, 24)}12345`;
}

export function generateReadablePassword(length = 10): string {
  const chars: string[] = [];
  // Garante pelo menos 1 maiúscula, 1 minúscula e 1 número
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  chars.push(upper[crypto.randomInt(upper.length)]);
  chars.push(lower[crypto.randomInt(lower.length)]);
  chars.push(digits[crypto.randomInt(digits.length)]);
  while (chars.length < length) {
    chars.push(PASS_CHARS[crypto.randomInt(PASS_CHARS.length)]);
  }
  // Embaralha com Fisher-Yates usando randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
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

export function extractToken(req: Request): { token?: string; viaBearer: boolean } {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return { token: bearer, viaBearer: true };
  }
  const cookies = parseCookies(req.headers.cookie);
  return { token: cookies[SESSION_COOKIE], viaBearer: false };
}

function isHttpsRequest(req: Request): boolean {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  return req.secure || proto === 'https' || process.env.NODE_ENV === 'production';
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const secure = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    ...(secure ? { partitioned: true } : {}),
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    ...(secure ? { partitioned: true } : {}),
  });
}

export function publicUser(u: StoredUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    mustChangePassword: Boolean(u.mustChangePassword),
    affiliateLink: u.affiliateLink ?? '',
    kiwifyProduct: u.kiwifyProduct ?? '',
    kiwifySubscriptionId: u.kiwifySubscriptionId ?? '',
    nextPaymentAt: u.nextPaymentAt ?? null,
    suspendedReason: u.suspendedReason ?? '',
    accessEmailSentAt: u.accessEmailSentAt ?? null,
    accessEmailStatus: u.accessEmailStatus ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  };
}

export interface AuthedRequest extends Request {
  user?: StoredUser;
  inactiveUser?: StoredUser;
  viaBearer?: boolean;
}

function isValidMutationOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  const host =
    sanitizeHostHeader(req.headers['x-forwarded-host'] as string | undefined) ||
    sanitizeHostHeader(req.get('host'));

  if (origin) {
    if (!host) return false;
    try {
      return new URL(origin).host.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }
  return req.headers['x-requested-with'] === 'XMLHttpRequest';
}

export function createAuthMiddleware(
  getDb: () => { users: StoredUser[] },
  secret: string,
) {
  const attachUser = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const { token, viaBearer } = extractToken(req);
    req.viaBearer = viaBearer;
    const session = verifySession(token, secret);
    if (session) {
      const user = getDb().users.find((u) => u.id === session.uid);
      if (user) {
        if (user.status === 'active') {
          req.user = user;
        } else {
          req.inactiveUser = user;
        }
      }
    }
    next();
  };

  const verifyCsrfIfCookie = (req: AuthedRequest, res: Response): boolean => {
    if (req.viaBearer || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (isValidMutationOrigin(req)) return true;
    res.status(403).json({ error: 'Origem da requisição não autorizada.' });
    return false;
  };

  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      if (req.inactiveUser) {
        clearSessionCookie(req, res);
        res.status(401).json({
          code: 'ACCOUNT_SUSPENDED',
          error:
            req.inactiveUser.suspendedReason ||
            'Seu acesso foi suspenso ou cancelado na Kiwify. Regularize o pagamento para entrar.',
        });
        return;
      }
      res.status(401).json({ error: 'Sessão expirada ou acesso não autorizado.' });
      return;
    }
    if (!verifyCsrfIfCookie(req, res)) return;
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
    if (!verifyCsrfIfCookie(req, res)) return;
    next();
  };

  return { attachUser, requireAuth, requireAdmin };
}
