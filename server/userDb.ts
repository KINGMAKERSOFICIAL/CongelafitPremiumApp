import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decryptSecret, encryptSecret } from './auth.ts';
import type { StoredUser } from './types.ts';

export type UserActivityType =
  | 'login'
  | 'recipe_view'
  | 'favorite_toggle'
  | 'freezer_update'
  | 'planner_update'
  | 'shopping_update'
  | 'shopping_share'
  | 'shopping_pdf'
  | 'guide_view'
  | 'product_click'
  | 'referral_share'
  | 'app_install';

export const ALLOWED_ACTIVITY_TYPES: ReadonlySet<UserActivityType> = new Set([
  'login',
  'recipe_view',
  'favorite_toggle',
  'freezer_update',
  'planner_update',
  'shopping_update',
  'shopping_share',
  'shopping_pdf',
  'guide_view',
  'product_click',
  'referral_share',
  'app_install',
]);

export const ACTIVITY_LABELS: Record<UserActivityType, string> = {
  login: 'Entrou no app',
  recipe_view: 'Abriu receita',
  favorite_toggle: 'Favoritou receita',
  freezer_update: 'Atualizou Meu Freezer',
  planner_update: 'Editou Planner da semana',
  shopping_update: 'Atualizou Lista de compras',
  shopping_share: 'Compartilhou Lista de compras',
  shopping_pdf: 'Gerou PDF da Lista',
  guide_view: 'Leu guia prático',
  product_click: 'Clicou em item recomendado',
  referral_share: 'Indicou o CongelaFit',
  app_install: 'Instalou o aplicativo',
};

const ALLOWED_DATA_KEY_RE = /^(fav|fz|plan|shop\.[a-z]+|ing:[\w-]+|step:[\w-]+|prefs)$/;
const MAX_KEYS = 1500;
const MAX_VALUE_CHARS = 180_000;
const MAX_TOTAL_CHARS = 512_000;
const MAX_ACTIVITY_ROWS = 15_000;
const KEEP_ACTIVITY_ROWS = 12_000;

export interface UserStateSummary {
  favoritesCount: number;
  freezerItemsCount: number;
  freezerPortionsCount: number;
  plannedMealsCount: number;
  shoppingRecipesCount: number;
  shoppingManualCount: number;
  shoppingCheckedCount: number;
  marksCount: number;
}

export interface UserAppStateRecord {
  entries: Record<string, string>;
  summary: UserStateSummary;
  version: number;
  updatedAt: string | null;
}

export interface UserActivityRow {
  id: number;
  userId: string;
  eventType: UserActivityType;
  label: string;
  targetId: string;
  targetLabel: string;
  deviceType: string;
  createdAt: string;
}

export interface UserInsightItem {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  status: StoredUser['status'];
  loginCount: number;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  lastDevice: string;
  engagementLevel: 'Muito ativo' | 'Ativo' | 'Pouco ativo' | 'Nunca acessou';
  totalEvents: number;
  recipesViewedCount: number;
  uniqueRecipesCount: number;
  favoritesCount: number;
  freezerItemsCount: number;
  freezerPortionsCount: number;
  plannedMealsCount: number;
  shoppingItemsCount: number;
  shoppingSharesCount: number;
  guidesViewedCount: number;
  productClicksCount: number;
  cloudUpdatedAt: string | null;
  topRecipes: Array<{ id: string; count: number }>;
}

export interface FeatureAdoptionItem {
  key: string;
  label: string;
  usersCount: number;
  totalUsers: number;
}

export interface DetailedUserAnalyticsResult {
  summaryAdditions: {
    activeLast7Days: number;
    totalTrackedEvents: number;
    totalFreezerItems: number;
    totalFreezerPortions: number;
    totalPlannedMeals: number;
    totalFavorites: number;
    totalShoppingItems: number;
    usersWithCloudData: number;
  };
  featureAdoption: FeatureAdoptionItem[];
  topActions: Array<{ type: UserActivityType; label: string; count: number }>;
  userInsights: UserInsightItem[];
  securityStats: SecurityAuditSummary;
}

export interface SecurityEventItem {
  id: number;
  eventType: string;
  ip: string;
  path: string;
  userAgent: string;
  detail: string;
  createdAt: string;
}

export interface SecurityAuditSummary {
  totalBlocked: number;
  blockedLast24h: number;
  recentEvents: SecurityEventItem[];
}

export interface SingleUserActivityDetail {
  user: {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'member';
    status: StoredUser['status'];
    loginCount: number;
    lastLoginAt: string | null;
    createdAt: string;
    kiwifyProduct: string;
  };
  summary: UserStateSummary;
  cloudUpdatedAt: string | null;
  totalEvents: number;
  lastActivityAt: string | null;
  lastDevice: string;
  actionBreakdown: Array<{ type: UserActivityType; label: string; count: number }>;
  topRecipes: Array<{ id: string; label: string; count: number }>;
  recentEvents: UserActivityRow[];
}

export function detectDeviceType(userAgent: string | undefined): 'Celular' | 'Tablet' | 'Computador' {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return 'Computador';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'Tablet';
  if (/iphone|ipod|android.*mobile|windows phone|blackberry|iemobile|opera mini|mobile/i.test(ua)) {
    return 'Celular';
  }
  return 'Computador';
}

export function sanitizeUserEntries(
  raw: unknown,
): { ok: true; entries: Record<string, string> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Formato de dados inválido.' };
  }
  const source = raw as Record<string, unknown>;
  const entries: Record<string, string> = {};
  let count = 0;
  let totalChars = 0;

  for (const [key, val] of Object.entries(source)) {
    if (!ALLOWED_DATA_KEY_RE.test(key)) continue;
    if (typeof val !== 'string') continue;
    if (val.length > MAX_VALUE_CHARS) {
      return { ok: false, error: `Registro ${key} excedeu o limite de tamanho.` };
    }
    try {
      JSON.parse(val);
    } catch {
      continue;
    }
    count += 1;
    if (count > MAX_KEYS) {
      return { ok: false, error: 'Quantidade máxima de registros atingida.' };
    }
    totalChars += key.length + val.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return { ok: false, error: 'Limite máximo de armazenamento por usuário excedido.' };
    }
    entries[key] = val;
  }

  return { ok: true, entries };
}

export function computeUserStateSummary(entries: Record<string, string>): UserStateSummary {
  let favoritesCount = 0;
  let freezerItemsCount = 0;
  let freezerPortionsCount = 0;
  let plannedMealsCount = 0;
  let shoppingRecipesCount = 0;
  let shoppingManualCount = 0;
  let shoppingCheckedCount = 0;
  let marksCount = 0;

  if (entries.fav) {
    try {
      const parsed = JSON.parse(entries.fav);
      if (Array.isArray(parsed)) favoritesCount = parsed.length;
    } catch {
      /* ignora */
    }
  }

  if (entries.fz) {
    try {
      const parsed = JSON.parse(entries.fz);
      if (Array.isArray(parsed)) {
        freezerItemsCount = parsed.length;
        for (const item of parsed) {
          if (item && typeof item === 'object' && typeof (item as { portions?: unknown }).portions === 'number') {
            const p = (item as { portions: number }).portions;
            if (Number.isFinite(p) && p > 0) freezerPortionsCount += Math.round(p);
          }
        }
      }
    } catch {
      /* ignora */
    }
  }

  if (entries.plan) {
    try {
      const parsed = JSON.parse(entries.plan);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const daySlots of Object.values(parsed as Record<string, unknown>)) {
          if (!daySlots || typeof daySlots !== 'object' || Array.isArray(daySlots)) continue;
          for (const slotRecipes of Object.values(daySlots as Record<string, unknown>)) {
            if (Array.isArray(slotRecipes)) plannedMealsCount += slotRecipes.length;
          }
        }
      }
    } catch {
      /* ignora */
    }
  }

  if (entries['shop.rec']) {
    try {
      const parsed = JSON.parse(entries['shop.rec']);
      if (Array.isArray(parsed)) shoppingRecipesCount = parsed.length;
    } catch {
      /* ignora */
    }
  }

  if (entries['shop.man']) {
    try {
      const parsed = JSON.parse(entries['shop.man']);
      if (Array.isArray(parsed)) shoppingManualCount = parsed.length;
    } catch {
      /* ignora */
    }
  }

  if (entries['shop.chk']) {
    try {
      const parsed = JSON.parse(entries['shop.chk']);
      if (Array.isArray(parsed)) shoppingCheckedCount = parsed.length;
    } catch {
      /* ignora */
    }
  }

  for (const key of Object.keys(entries)) {
    if (key.startsWith('ing:') || key.startsWith('step:')) {
      marksCount += 1;
    }
  }

  return {
    favoritesCount,
    freezerItemsCount,
    freezerPortionsCount,
    plannedMealsCount,
    shoppingRecipesCount,
    shoppingManualCount,
    shoppingCheckedCount,
    marksCount,
  };
}

function emptySummary(): UserStateSummary {
  return {
    favoritesCount: 0,
    freezerItemsCount: 0,
    freezerPortionsCount: 0,
    plannedMealsCount: 0,
    shoppingRecipesCount: 0,
    shoppingManualCount: 0,
    shoppingCheckedCount: 0,
    marksCount: 0,
  };
}

function parseSummaryJson(raw: unknown): UserStateSummary {
  if (typeof raw !== 'string' || !raw) return emptySummary();
  try {
    const p = JSON.parse(raw) as Partial<UserStateSummary>;
    return {
      favoritesCount: Number(p.favoritesCount) || 0,
      freezerItemsCount: Number(p.freezerItemsCount) || 0,
      freezerPortionsCount: Number(p.freezerPortionsCount) || 0,
      plannedMealsCount: Number(p.plannedMealsCount) || 0,
      shoppingRecipesCount: Number(p.shoppingRecipesCount) || 0,
      shoppingManualCount: Number(p.shoppingManualCount) || 0,
      shoppingCheckedCount: Number(p.shoppingCheckedCount) || 0,
      marksCount: Number(p.marksCount) || 0,
    };
  } catch {
    return emptySummary();
  }
}

export function createUserDatabase(dataDir: string, secret: string) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const dbPath = path.join(dataDir, 'user-app-data.sqlite');
  const db = new DatabaseSync(dbPath);
  try {
    fs.chmodSync(dbPath, 0o600);
  } catch {
    /* ignora se sistema de arquivos não suportar chmod */
  }

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS user_app_state (
      user_id TEXT PRIMARY KEY,
      encrypted_payload TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      target_label TEXT NOT NULL DEFAULT '',
      device_type TEXT NOT NULL DEFAULT 'Computador',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_uae_user_created
      ON user_activity_events (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_uae_event_type
      ON user_activity_events (event_type);

    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sec_created
      ON security_events (created_at DESC);
  `);

  const selectStateStmt = db.prepare(
    'SELECT encrypted_payload, summary_json, version, updated_at FROM user_app_state WHERE user_id = ?',
  );
  const upsertStateStmt = db.prepare(`
    INSERT INTO user_app_state (user_id, encrypted_payload, summary_json, version, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      summary_json = excluded.summary_json,
      version = user_app_state.version + 1,
      updated_at = excluded.updated_at
  `);
  const deleteStateStmt = db.prepare('DELETE FROM user_app_state WHERE user_id = ?');
  const deleteEventsStmt = db.prepare('DELETE FROM user_activity_events WHERE user_id = ?');

  const insertEventStmt = db.prepare(`
    INSERT INTO user_activity_events (user_id, event_type, target_id, target_label, device_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const countEventsStmt = db.prepare('SELECT COUNT(*) AS total FROM user_activity_events');
  const pruneEventsStmt = db.prepare(`
    DELETE FROM user_activity_events
    WHERE id NOT IN (
      SELECT id FROM user_activity_events ORDER BY id DESC LIMIT ?
    )
  `);

  const selectAllSummariesStmt = db.prepare(
    'SELECT user_id, summary_json, updated_at FROM user_app_state',
  );
  const selectAllEventsStmt = db.prepare(
    'SELECT id, user_id, event_type, target_id, target_label, device_type, created_at FROM user_activity_events ORDER BY id DESC',
  );
  const selectUserEventsStmt = db.prepare(
    'SELECT id, user_id, event_type, target_id, target_label, device_type, created_at FROM user_activity_events WHERE user_id = ? ORDER BY id DESC LIMIT 120',
  );
  const selectUserCountsStmt = db.prepare(
    'SELECT event_type, COUNT(*) AS cnt FROM user_activity_events WHERE user_id = ? GROUP BY event_type ORDER BY cnt DESC',
  );
  const insertSecurityStmt = db.prepare(`
    INSERT INTO security_events (event_type, ip, path, user_agent, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const countSecurityStmt = db.prepare('SELECT COUNT(*) AS total FROM security_events');
  const countSecuritySinceStmt = db.prepare('SELECT COUNT(*) AS total FROM security_events WHERE created_at >= ?');
  const selectSecurityRecentStmt = db.prepare(
    'SELECT id, event_type, ip, path, user_agent, detail, created_at FROM security_events ORDER BY id DESC LIMIT 25',
  );
  const pruneSecurityStmt = db.prepare(`
    DELETE FROM security_events
    WHERE id NOT IN (SELECT id FROM security_events ORDER BY id DESC LIMIT 2000)
  `);

  function getUserAppState(userId: string): UserAppStateRecord {
    const row = selectStateStmt.get(userId) as
      | { encrypted_payload: string; summary_json: string; version: number; updated_at: string }
      | undefined;
    if (!row) {
      return { entries: {}, summary: emptySummary(), version: 0, updatedAt: null };
    }
    const decrypted = decryptSecret(row.encrypted_payload, secret);
    let entries: Record<string, string> = {};
    if (decrypted) {
      try {
        const parsed = JSON.parse(decrypted) as { entries?: unknown };
        const clean = sanitizeUserEntries(parsed.entries ?? parsed);
        if (clean.ok) entries = clean.entries;
      } catch {
        entries = {};
      }
    }
    return {
      entries,
      summary: parseSummaryJson(row.summary_json),
      version: Number(row.version) || 1,
      updatedAt: row.updated_at || null,
    };
  }

  function saveUserAppState(
    userId: string,
    rawEntries: unknown,
  ): { ok: true; state: UserAppStateRecord } | { ok: false; error: string } {
    const clean = sanitizeUserEntries(rawEntries);
    if (!clean.ok) return clean;
    const summary = computeUserStateSummary(clean.entries);
    const now = new Date().toISOString();
    const payloadJson = JSON.stringify({ entries: clean.entries });
    const encrypted = encryptSecret(payloadJson, secret);
    if (!encrypted) {
      return { ok: false, error: 'Falha ao proteger os dados antes de salvar.' };
    }
    upsertStateStmt.run(userId, encrypted, JSON.stringify(summary), 1, now);
    const saved = selectStateStmt.get(userId) as { version: number; updated_at: string } | undefined;
    return {
      ok: true,
      state: {
        entries: clean.entries,
        summary,
        version: Number(saved?.version) || 1,
        updatedAt: saved?.updated_at ?? now,
      },
    };
  }

  function deleteUserAppData(userId: string): void {
    deleteStateStmt.run(userId);
    deleteEventsStmt.run(userId);
  }

  function recordUserActivity(opts: {
    userId: string;
    eventType: UserActivityType;
    targetId?: string;
    targetLabel?: string;
    userAgent?: string;
    createdAt?: string;
  }): void {
    if (!opts.userId || !ALLOWED_ACTIVITY_TYPES.has(opts.eventType)) return;
    const targetId = (opts.targetId ?? '').trim().slice(0, 120);
    const targetLabel = (opts.targetLabel ?? '').trim().slice(0, 180);
    const deviceType = detectDeviceType(opts.userAgent);
    const createdAt = opts.createdAt || new Date().toISOString();

    insertEventStmt.run(opts.userId, opts.eventType, targetId, targetLabel, deviceType, createdAt);

    const countRow = countEventsStmt.get() as { total: number } | undefined;
    if ((countRow?.total ?? 0) > MAX_ACTIVITY_ROWS) {
      pruneEventsStmt.run(KEEP_ACTIVITY_ROWS);
    }
  }

  function recordSecurityEvent(opts: {
    eventType: string;
    ip?: string;
    path?: string;
    userAgent?: string;
    detail?: string;
  }): void {
    const eventType = (opts.eventType || 'blocked').slice(0, 60);
    const ip = (opts.ip || '').slice(0, 80);
    const reqPath = (opts.path || '').slice(0, 200);
    const ua = (opts.userAgent || '').slice(0, 200);
    const detail = (opts.detail || '').slice(0, 240);
    const now = new Date().toISOString();
    insertSecurityStmt.run(eventType, ip, reqPath, ua, detail, now);
    const row = countSecurityStmt.get() as { total: number } | undefined;
    if ((row?.total ?? 0) > 2500) {
      pruneSecurityStmt.run();
    }
  }

  function getSecuritySummary(): SecurityAuditSummary {
    const totalRow = countSecurityStmt.get() as { total: number } | undefined;
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentCountRow = countSecuritySinceStmt.get(sinceIso) as { total: number } | undefined;
    const rows = selectSecurityRecentStmt.all() as Array<{
      id: number;
      event_type: string;
      ip: string;
      path: string;
      user_agent: string;
      detail: string;
      created_at: string;
    }>;
    return {
      totalBlocked: Number(totalRow?.total) || 0,
      blockedLast24h: Number(recentCountRow?.total) || 0,
      recentEvents: rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        ip: r.ip,
        path: r.path,
        userAgent: r.user_agent,
        detail: r.detail,
        createdAt: r.created_at,
      })),
    };
  }

  function getDetailedUserAnalytics(users: StoredUser[]): DetailedUserAnalyticsResult {
    const summaryMap = new Map<string, { summary: UserStateSummary; updatedAt: string }>();
    const summaryRows = selectAllSummariesStmt.all() as Array<{
      user_id: string;
      summary_json: string;
      updated_at: string;
    }>;
    for (const r of summaryRows) {
      summaryMap.set(r.user_id, {
        summary: parseSummaryJson(r.summary_json),
        updatedAt: r.updated_at,
      });
    }

    const eventRows = selectAllEventsStmt.all() as Array<{
      id: number;
      user_id: string;
      event_type: string;
      target_id: string;
      target_label: string;
      device_type: string;
      created_at: string;
    }>;

    const eventsByUser = new Map<string, typeof eventRows>();
    const actionTotals = new Map<UserActivityType, number>();
    const featureUsers = {
      recipes: new Set<string>(),
      favorites: new Set<string>(),
      freezer: new Set<string>(),
      planner: new Set<string>(),
      shopping: new Set<string>(),
      guides: new Set<string>(),
      products: new Set<string>(),
    };

    for (const ev of eventRows) {
      let arr = eventsByUser.get(ev.user_id);
      if (!arr) {
        arr = [];
        eventsByUser.set(ev.user_id, arr);
      }
      arr.push(ev);

      if (ALLOWED_ACTIVITY_TYPES.has(ev.event_type as UserActivityType)) {
        const t = ev.event_type as UserActivityType;
        actionTotals.set(t, (actionTotals.get(t) ?? 0) + 1);
        if (t === 'recipe_view') featureUsers.recipes.add(ev.user_id);
        if (t === 'favorite_toggle') featureUsers.favorites.add(ev.user_id);
        if (t === 'freezer_update') featureUsers.freezer.add(ev.user_id);
        if (t === 'planner_update') featureUsers.planner.add(ev.user_id);
        if (t === 'shopping_update' || t === 'shopping_share' || t === 'shopping_pdf') {
          featureUsers.shopping.add(ev.user_id);
        }
        if (t === 'guide_view') featureUsers.guides.add(ev.user_id);
        if (t === 'product_click') featureUsers.products.add(ev.user_id);
      }
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let activeLast7Days = 0;
    let totalFreezerItems = 0;
    let totalFreezerPortions = 0;
    let totalPlannedMeals = 0;
    let totalFavorites = 0;
    let totalShoppingItems = 0;
    let usersWithCloudData = 0;

    const members = users.filter((u) => u.role !== 'admin');
    const userInsights: UserInsightItem[] = members.map((u) => {
      const stateInfo = summaryMap.get(u.id);
      const sum = stateInfo?.summary ?? emptySummary();
      const userEvents = eventsByUser.get(u.id) ?? [];

      if (sum.favoritesCount > 0) featureUsers.favorites.add(u.id);
      if (sum.freezerItemsCount > 0) featureUsers.freezer.add(u.id);
      if (sum.plannedMealsCount > 0) featureUsers.planner.add(u.id);
      if (sum.shoppingRecipesCount + sum.shoppingManualCount > 0) featureUsers.shopping.add(u.id);

      const hasCloudData =
        Boolean(stateInfo) &&
        sum.favoritesCount +
          sum.freezerItemsCount +
          sum.plannedMealsCount +
          sum.shoppingRecipesCount +
          sum.shoppingManualCount +
          sum.marksCount >
          0;
      if (hasCloudData) usersWithCloudData += 1;

      totalFreezerItems += sum.freezerItemsCount;
      totalFreezerPortions += sum.freezerPortionsCount;
      totalPlannedMeals += sum.plannedMealsCount;
      totalFavorites += sum.favoritesCount;
      totalShoppingItems += sum.shoppingRecipesCount + sum.shoppingManualCount;

      let recipesViewedCount = 0;
      let shoppingSharesCount = 0;
      let guidesViewedCount = 0;
      let productClicksCount = 0;
      const recipeCounts = new Map<string, number>();

      for (const ev of userEvents) {
        if (ev.event_type === 'recipe_view') {
          recipesViewedCount += 1;
          if (ev.target_id) {
            recipeCounts.set(ev.target_id, (recipeCounts.get(ev.target_id) ?? 0) + 1);
          }
        } else if (ev.event_type === 'shopping_share' || ev.event_type === 'referral_share') {
          shoppingSharesCount += 1;
        } else if (ev.event_type === 'guide_view') {
          guidesViewedCount += 1;
        } else if (ev.event_type === 'product_click') {
          productClicksCount += 1;
        }
      }

      const lastEventAt = userEvents[0]?.created_at ?? null;
      const lastLoginAt = u.lastLoginAt ?? null;
      const candidateTimes = [lastEventAt, lastLoginAt, stateInfo?.updatedAt ?? null].filter(
        (x): x is string => Boolean(x),
      );
      candidateTimes.sort((a, b) => b.localeCompare(a));
      const lastActivityAt = candidateTimes[0] ?? null;

      if (lastActivityAt && Date.parse(lastActivityAt) >= sevenDaysAgo) {
        activeLast7Days += 1;
      }

      const totalEvents = userEvents.length;
      const score =
        totalEvents +
        (u.loginCount ?? 0) * 2 +
        sum.freezerItemsCount * 2 +
        sum.plannedMealsCount +
        sum.favoritesCount;
      let engagementLevel: UserInsightItem['engagementLevel'] = 'Nunca acessou';
      if (score >= 15) engagementLevel = 'Muito ativo';
      else if (score >= 4) engagementLevel = 'Ativo';
      else if (score > 0 || (u.loginCount ?? 0) > 0 || Boolean(lastActivityAt)) {
        engagementLevel = 'Pouco ativo';
      }

      const topRecipes = [...recipeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ id, count }));

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        loginCount: u.loginCount ?? 0,
        lastLoginAt,
        lastActivityAt,
        lastDevice: userEvents[0]?.device_type || '—',
        engagementLevel,
        totalEvents,
        recipesViewedCount,
        uniqueRecipesCount: recipeCounts.size,
        favoritesCount: sum.favoritesCount,
        freezerItemsCount: sum.freezerItemsCount,
        freezerPortionsCount: sum.freezerPortionsCount,
        plannedMealsCount: sum.plannedMealsCount,
        shoppingItemsCount: sum.shoppingRecipesCount + sum.shoppingManualCount,
        shoppingSharesCount,
        guidesViewedCount,
        productClicksCount,
        cloudUpdatedAt: stateInfo?.updatedAt ?? null,
        topRecipes,
      };
    });

    userInsights.sort((a, b) => {
      if (a.lastActivityAt && b.lastActivityAt) {
        return b.lastActivityAt.localeCompare(a.lastActivityAt);
      }
      if (a.lastActivityAt) return -1;
      if (b.lastActivityAt) return 1;
      return b.loginCount - a.loginCount;
    });

    const memberIdSet = new Set(members.map((m) => m.id));
    const countMemberSet = (s: Set<string>) => {
      let c = 0;
      for (const id of s) if (memberIdSet.has(id)) c += 1;
      return c;
    };
    const totalMembers = members.length;

    const featureAdoption: FeatureAdoptionItem[] = [
      { key: 'recipes', label: 'Receitas', usersCount: countMemberSet(featureUsers.recipes), totalUsers: totalMembers },
      { key: 'favorites', label: 'Favoritas', usersCount: countMemberSet(featureUsers.favorites), totalUsers: totalMembers },
      { key: 'freezer', label: 'Meu Freezer', usersCount: countMemberSet(featureUsers.freezer), totalUsers: totalMembers },
      { key: 'planner', label: 'Planner Semanal', usersCount: countMemberSet(featureUsers.planner), totalUsers: totalMembers },
      { key: 'shopping', label: 'Lista de Compras', usersCount: countMemberSet(featureUsers.shopping), totalUsers: totalMembers },
      { key: 'guides', label: 'Guias Práticos', usersCount: countMemberSet(featureUsers.guides), totalUsers: totalMembers },
      { key: 'products', label: 'Itens Recomendados', usersCount: countMemberSet(featureUsers.products), totalUsers: totalMembers },
    ];

    const topActions = [...actionTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        label: ACTIVITY_LABELS[type] ?? type,
        count,
      }));

    return {
      summaryAdditions: {
        activeLast7Days,
        totalTrackedEvents: eventRows.length,
        totalFreezerItems,
        totalFreezerPortions,
        totalPlannedMeals,
        totalFavorites,
        totalShoppingItems,
        usersWithCloudData,
      },
      featureAdoption,
      topActions,
      userInsights,
      securityStats: getSecuritySummary(),
    };
  }

  function getSingleUserActivityDetail(user: StoredUser): SingleUserActivityDetail {
    const state = getUserAppState(user.id);
    const rows = selectUserEventsStmt.all(user.id) as Array<{
      id: number;
      user_id: string;
      event_type: string;
      target_id: string;
      target_label: string;
      device_type: string;
      created_at: string;
    }>;

    const breakdownRows = selectUserCountsStmt.all(user.id) as Array<{ event_type: string; cnt: number }>;
    const actionBreakdown = breakdownRows
      .filter((r) => ALLOWED_ACTIVITY_TYPES.has(r.event_type as UserActivityType))
      .map((r) => {
        const t = r.event_type as UserActivityType;
        return {
          type: t,
          label: ACTIVITY_LABELS[t] ?? t,
          count: Number(r.cnt) || 0,
        };
      });

    const recipeMap = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      if (r.event_type === 'recipe_view' && r.target_id) {
        const cur = recipeMap.get(r.target_id);
        recipeMap.set(r.target_id, {
          label: r.target_label || cur?.label || r.target_id,
          count: (cur?.count ?? 0) + 1,
        });
      }
    }
    const topRecipes = [...recipeMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, info]) => ({ id, label: info.label, count: info.count }));

    const recentEvents: UserActivityRow[] = rows.slice(0, 80).map((r) => {
      const t = (ALLOWED_ACTIVITY_TYPES.has(r.event_type as UserActivityType)
        ? r.event_type
        : 'recipe_view') as UserActivityType;
      return {
        id: r.id,
        userId: r.user_id,
        eventType: t,
        label: ACTIVITY_LABELS[t] ?? t,
        targetId: r.target_id,
        targetLabel: r.target_label,
        deviceType: r.device_type,
        createdAt: r.created_at,
      };
    });

    const totalEvents = actionBreakdown.reduce((acc, a) => acc + a.count, 0);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        loginCount: user.loginCount ?? 0,
        lastLoginAt: user.lastLoginAt ?? null,
        createdAt: user.createdAt,
        kiwifyProduct: user.kiwifyProduct ?? '',
      },
      summary: state.summary,
      cloudUpdatedAt: state.updatedAt,
      totalEvents,
      lastActivityAt: rows[0]?.created_at ?? user.lastLoginAt ?? state.updatedAt ?? null,
      lastDevice: rows[0]?.device_type || '—',
      actionBreakdown,
      topRecipes,
      recentEvents,
    };
  }

  function close(): void {
    try {
      db.close();
    } catch {
      /* ignora */
    }
  }

  return {
    dbPath,
    getUserAppState,
    saveUserAppState,
    deleteUserAppData,
    recordUserActivity,
    recordSecurityEvent,
    getSecuritySummary,
    getDetailedUserAnalytics,
    getSingleUserActivityDetail,
    close,
  };
}

let cachedUserDb: ReturnType<typeof createUserDatabase> | null = null;

export function getUserDb(dataDir: string, secret: string) {
  if (!cachedUserDb) {
    cachedUserDb = createUserDatabase(dataDir, secret);
  }
  return cachedUserDb;
}
