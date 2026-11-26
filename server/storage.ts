import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import type { Database, DailyMetric, StoredUser } from './types.ts';

export const DATA_DIR = path.resolve(process.cwd(), '.congelafit-data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDatabase(): Database {
  const now = new Date().toISOString();
  const adminEmail = (process.env.ADMIN_EMAIL || 'suportekingmakers@gmail.com').trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'CongelaAdmin2026!';
  const { hash, salt } = hashPassword(adminPass);
  const adminUser: StoredUser = {
    id: 'admin-1',
    email: adminEmail,
    name: 'Administrador CongelaFit',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
    status: 'active',
    needsPasswordSetup: false,
    loginCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  return {
    users: [adminUser],
    settings: {
      officialSiteUrl: (process.env.SITE_URL || 'https://www.congelafit.com.br').replace(/\/+$/, ''),
      appBaseUrl: (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
      kiwifyWebhookToken: process.env.KIWIFY_WEBHOOK_TOKEN || crypto.randomBytes(16).toString('hex'),
      kiwifyCheckoutUrl: process.env.KIWIFY_CHECKOUT_URL || 'https://www.congelafit.com.br',
      kiwifyAffiliateInviteUrl: process.env.KIWIFY_AFFILIATE_INVITE_URL || 'https://kiwify.com.br/',
      emailProvider: 'auto',
      smtpPort: 587,
      smtpSecure: false,
      emailFromName: 'CongelaFit Premium',
      sendSuspensionEmail: true,
      updatedAt: now,
    },
    recipeImages: {},
    affiliateProducts: [],
    webhookLogs: [],
    emailLogs: [],
    analytics: {
      totalLogins: 0,
      recipeViews: {},
      whatsappReferralShares: 0,
      daily: {},
    },
  };
}

let dbCache: Database | null = null;

export function loadDb(): Database {
  if (dbCache) return dbCache;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Database>;
      const def = defaultDatabase();
      const mergedSettings = { ...def.settings, ...(parsed.settings ?? {}) };
      // Domínios anteriores (.store ou sem www) → domínio oficial (https://www.congelafit.com.br) quando exatamente igual ao padrão antigo.
      const LEGACY_SITES = new Set([
        'https://congelafit.com.br',
        'https://congelafit.com.br/',
        'https://congelafit.store',
        'https://congelafit.store/',
        'https://www.congelafit.store',
        'https://www.congelafit.store/',
      ]);
      const LEGACY_APP_URLS = new Set([
        'https://app.congelafit.store',
        'https://app.congelafit.store/',
      ]);
      if (!mergedSettings.officialSiteUrl || LEGACY_SITES.has(mergedSettings.officialSiteUrl)) {
        mergedSettings.officialSiteUrl = 'https://www.congelafit.com.br';
      }
      if (LEGACY_SITES.has(mergedSettings.kiwifyCheckoutUrl)) {
        mergedSettings.kiwifyCheckoutUrl = 'https://www.congelafit.com.br';
      }
      if (mergedSettings.appBaseUrl && LEGACY_SITES.has(mergedSettings.appBaseUrl)) {
        mergedSettings.appBaseUrl = 'https://www.congelafit.com.br';
      }
      if (mergedSettings.appBaseUrl && LEGACY_APP_URLS.has(mergedSettings.appBaseUrl)) {
        mergedSettings.appBaseUrl = 'https://app.congelafit.com.br';
      }
      if (!mergedSettings.kiwifyCheckoutUrl || mergedSettings.kiwifyCheckoutUrl === 'https://pay.kiwify.com.br/') {
        mergedSettings.kiwifyCheckoutUrl = 'https://www.congelafit.com.br';
      }
      if (
        !mergedSettings.kiwifyAffiliateInviteUrl ||
        mergedSettings.kiwifyAffiliateInviteUrl === 'https://dashboard.kiwify.com.br/'
      ) {
        mergedSettings.kiwifyAffiliateInviteUrl = 'https://kiwify.com.br/';
      }
      if (!mergedSettings.emailTemplates || typeof mergedSettings.emailTemplates !== 'object') {
        mergedSettings.emailTemplates = {};
      }
      const merged: Database = {
        users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : def.users,
        settings: mergedSettings,
        recipeImages: parsed.recipeImages && typeof parsed.recipeImages === 'object' ? parsed.recipeImages : {},
        affiliateProducts: Array.isArray(parsed.affiliateProducts) ? parsed.affiliateProducts : [],
        webhookLogs: Array.isArray(parsed.webhookLogs) ? parsed.webhookLogs : [],
        emailLogs: Array.isArray(parsed.emailLogs) ? parsed.emailLogs : [],
        analytics: {
          totalLogins: parsed.analytics?.totalLogins ?? 0,
          recipeViews: parsed.analytics?.recipeViews ?? {},
          whatsappReferralShares: parsed.analytics?.whatsappReferralShares ?? 0,
          daily: parsed.analytics?.daily ?? {},
        },
      };
      // Garante que existe ao menos um admin válido
      if (!merged.users.some((u) => u.role === 'admin')) {
        merged.users.unshift(def.users[0]);
      }
      dbCache = merged;
      return merged;
    } catch {
      try {
        fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}.bak`);
      } catch {
        /* ignora falha de backup */
      }
    }
  }
  const initial = defaultDatabase();
  dbCache = initial;
  saveDb(initial);
  return initial;
}

export function saveDb(db: Database): void {
  dbCache = db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

export function touchDailyMetric(db: Database, field: keyof DailyMetric): void {
  const day = todayISO();
  if (!db.analytics.daily[day]) {
    db.analytics.daily[day] = { logins: 0, recipeViews: 0, productClicks: 0, referralShares: 0 };
  }
  db.analytics.daily[day][field] += 1;
  // Mantém no máximo 60 dias recentes
  const keys = Object.keys(db.analytics.daily).sort();
  if (keys.length > 60) {
    for (const oldKey of keys.slice(0, keys.length - 60)) {
      delete db.analytics.daily[oldKey];
    }
  }
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function saveUploadedImage(prefix: string, dataUrl: string): string {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Formato de imagem inválido. Use PNG, JPG, WebP ou GIF.');
  }
  const mime = match[1].toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) {
    throw new Error('Tipo de imagem não suportado. Envie PNG, JPG, WebP ou GIF.');
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
  const filename = `${safePrefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

export function deleteUploadedFileIfLocal(url: string | undefined): void {
  if (!url || !url.startsWith('/uploads/')) return;
  const base = path.basename(url);
  const full = path.join(UPLOADS_DIR, base);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignora */
  }
}
