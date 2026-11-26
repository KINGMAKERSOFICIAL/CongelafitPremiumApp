import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createAuthMiddleware, signSession } from '../../server/auth';
import {
  createLoginBruteForceGuard,
  isBlockedExtractorUserAgent,
  isBlockedProbePath,
} from '../../server/security';
import type { StoredUser } from '../../server/types';
import { computeUserStateSummary, createUserDatabase, detectDeviceType } from '../../server/userDb';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'congelafit-userdb-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop()!;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
});

function sampleUser(overrides: Partial<StoredUser> = {}): StoredUser {
  const now = new Date().toISOString();
  return {
    id: 'usr-1',
    email: 'maria@exemplo.com',
    name: 'Maria Silva',
    passwordHash: 'hash',
    passwordSalt: 'salt',
    role: 'member',
    status: 'active',
    needsPasswordSetup: false,
    loginCount: 3,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Banco de dados criptografado do usuário e painel detalhado', () => {
  it('persiste e criptografa dados de cada usuário sem expor texto puro no SQLite', () => {
    const dir = makeTempDir();
    const secret = 'segredo-super-forte-teste-1234567890';
    const userDb = createUserDatabase(dir, secret);

    const payload = {
      fav: JSON.stringify(['r-frango-1', 'r-sopa-2']),
      fz: JSON.stringify([
        {
          id: 'fz1',
          recipeId: 'r-frango-1',
          name: 'Frango Desfiado Segredo',
          portions: 4,
          unit: 'porção',
          frozenOn: '2026-11-20',
          months: 3,
          note: 'Sem pimenta',
        },
      ]),
      plan: JSON.stringify({
        '2026-11-26': { almoco: ['r-frango-1'], jantar: ['r-sopa-2'] },
      }),
      'shop.rec': JSON.stringify([{ id: 'r-frango-1', factor: 2 }]),
      'shop.man': JSON.stringify([{ id: 'm1', text: '1 kg de tomate' }]),
      'shop.chk': JSON.stringify(['tomate']),
      'ing:r-frango-1': JSON.stringify([0, 1]),
      'chave_maliciosa': JSON.stringify(['ignorar']),
    };

    const saved = userDb.saveUserAppState('usr-1', payload);
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.state.summary.favoritesCount).toBe(2);
      expect(saved.state.summary.freezerItemsCount).toBe(1);
      expect(saved.state.summary.freezerPortionsCount).toBe(4);
      expect(saved.state.summary.plannedMealsCount).toBe(2);
      expect(saved.state.summary.shoppingRecipesCount).toBe(1);
      expect(saved.state.summary.shoppingManualCount).toBe(1);
      expect(saved.state.summary.marksCount).toBe(1);
    }

    // Garante isolamento entre usuários
    const otherUser = userDb.getUserAppState('usr-2');
    expect(Object.keys(otherUser.entries)).toHaveLength(0);

    // Garante que chave não permitida foi descartada e dados legítimos voltaram íntegros
    const reloaded = userDb.getUserAppState('usr-1');
    expect(reloaded.entries.fav).toBe(payload.fav);
    expect(reloaded.entries.fz).toBe(payload.fz);
    expect(reloaded.entries['chave_maliciosa']).toBeUndefined();

    // Verifica diretamente no arquivo SQLite que o conteúdo está criptografado
    const rawSql = new DatabaseSync(userDb.dbPath);
    const row = rawSql.prepare('SELECT encrypted_payload FROM user_app_state WHERE user_id = ?').get('usr-1') as {
      encrypted_payload: string;
    };
    expect(row.encrypted_payload).not.toContain('Frango Desfiado Segredo');
    expect(row.encrypted_payload).not.toContain('r-frango-1');
    expect(row.encrypted_payload.split('.')).toHaveLength(3);
    rawSql.close();
    userDb.close();
  });

  it('rejeita formatos inválidos de entrada no armazenamento do usuário', () => {
    const dir = makeTempDir();
    const userDb = createUserDatabase(dir, 'segredo-super-forte-teste-1234567890');
    const bad = userDb.saveUserAppState('usr-1', ['nao-eh-objeto']);
    expect(bad.ok).toBe(false);
    userDb.close();
  });

  it('calcula métricas detalhadas por usuário, adoção de recursos e histórico individual', () => {
    const dir = makeTempDir();
    const userDb = createUserDatabase(dir, 'segredo-super-forte-teste-1234567890');

    const u1 = sampleUser({ id: 'usr-1', name: 'Ana Paula', email: 'ana@teste.com', loginCount: 5 });
    const u2 = sampleUser({ id: 'usr-2', name: 'Carlos Eduardo', email: 'carlos@teste.com', loginCount: 0, lastLoginAt: undefined });

    userDb.saveUserAppState('usr-1', {
      fav: JSON.stringify(['r1']),
      fz: JSON.stringify([{ id: 'f1', name: 'Escondidinho', portions: 3, unit: 'porção', frozenOn: '2026-11-25', months: 3, note: '' }]),
    });

    userDb.recordUserActivity({
      userId: 'usr-1',
      eventType: 'login',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
    });
    userDb.recordUserActivity({
      userId: 'usr-1',
      eventType: 'recipe_view',
      targetId: 'r1',
      targetLabel: 'Escondidinho Fit',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
    });
    userDb.recordUserActivity({
      userId: 'usr-1',
      eventType: 'freezer_update',
      targetId: 'r1',
      targetLabel: 'Escondidinho',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
    });

    const analytics = userDb.getDetailedUserAnalytics([u1, u2]);
    expect(analytics.summaryAdditions.activeLast7Days).toBe(1);
    expect(analytics.summaryAdditions.totalFreezerItems).toBe(1);
    expect(analytics.summaryAdditions.totalFreezerPortions).toBe(3);

    const anaInsight = analytics.userInsights.find((x) => x.id === 'usr-1')!;
    const carlosInsight = analytics.userInsights.find((x) => x.id === 'usr-2')!;
    expect(anaInsight.lastDevice).toBe('Celular');
    expect(anaInsight.recipesViewedCount).toBe(1);
    expect(anaInsight.freezerItemsCount).toBe(1);
    expect(anaInsight.engagementLevel).toBe('Muito ativo');
    expect(carlosInsight.engagementLevel).toBe('Nunca acessou');

    const detail = userDb.getSingleUserActivityDetail(u1);
    expect(detail.recentEvents.length).toBe(3);
    expect(detail.topRecipes[0]).toEqual({ id: 'r1', label: 'Escondidinho Fit', count: 1 });

    // Limpeza ao excluir membro
    userDb.deleteUserAppData('usr-1');
    expect(Object.keys(userDb.getUserAppState('usr-1').entries)).toHaveLength(0);
    userDb.close();
  });

  it('resume corretamente estado vazio e detecta dispositivo', () => {
    const empty = computeUserStateSummary({});
    expect(empty.freezerItemsCount).toBe(0);
    expect(detectDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('Tablet');
    expect(detectDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0')).toBe('Computador');
  });
});

describe('Bloqueio contra extratores, clonadores e sondas de invasão', () => {
  it('bloqueia caminhos sensíveis, bancos de dados, backups e path traversal', () => {
    expect(isBlockedProbePath('/.env')).toBe(true);
    expect(isBlockedProbePath('/.git/config')).toBe(true);
    expect(isBlockedProbePath('/.congelafit-data/db.json')).toBe(true);
    expect(isBlockedProbePath('/.congelafit-data/user-app-data.sqlite')).toBe(true);
    expect(isBlockedProbePath('/server/auth.ts')).toBe(true);
    expect(isBlockedProbePath('/assets/index.js.map')).toBe(true);
    expect(isBlockedProbePath('/../../etc/passwd')).toBe(true);
    expect(isBlockedProbePath('/wp-login.php')).toBe(true);

    expect(isBlockedProbePath('/api/user/data')).toBe(false);
    expect(isBlockedProbePath('/receita/123')).toBe(false);
    expect(isBlockedProbePath('/assets/index-abc123.js')).toBe(false);
  });

  it('bloqueia ferramentas automatizadas de extração/scanner e libera navegadores comuns', () => {
    expect(isBlockedExtractorUserAgent('HTTrack 3.0')).toBe(true);
    expect(isBlockedExtractorUserAgent('Wget/1.21.3')).toBe(true);
    expect(isBlockedExtractorUserAgent('curl/8.4.0')).toBe(true);
    expect(isBlockedExtractorUserAgent('python-requests/2.31.0')).toBe(true);
    expect(isBlockedExtractorUserAgent('sqlmap/1.8')).toBe(true);
    expect(isBlockedExtractorUserAgent('Scrapy/2.11')).toBe(true);

    expect(
      isBlockedExtractorUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      ),
    ).toBe(false);
    expect(
      isBlockedExtractorUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });

  it('registra eventos de segurança bloqueados e contabiliza no resumo administrativo', () => {
    const dir = makeTempDir();
    const userDb = createUserDatabase(dir, 'segredo-super-forte-teste-1234567890');
    userDb.recordSecurityEvent({
      eventType: 'probe_path',
      ip: '198.51.100.10',
      path: '/.env',
      userAgent: 'curl/8.4.0',
      detail: 'Tentativa de acesso a /.env',
    });
    userDb.recordSecurityEvent({
      eventType: 'brute_force',
      ip: '198.51.100.11',
      path: '/api/auth/login',
      userAgent: 'Mozilla/5.0',
      detail: 'Bloqueio após 5 tentativas',
    });

    const summary = userDb.getSecuritySummary();
    expect(summary.totalBlocked).toBe(2);
    expect(summary.blockedLast24h).toBe(2);
    expect(summary.recentEvents).toHaveLength(2);
    expect(summary.recentEvents[0].eventType).toBe('brute_force');
    userDb.close();
  });

  it('bloqueia tentativas repetidas de força bruta no login e libera após limpeza', () => {
    const blockedEvents: string[] = [];
    const guard = createLoginBruteForceGuard((ev) => blockedEvents.push(ev.eventType));
    const fakeReq = {
      headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0' },
      ip: '203.0.113.9',
      path: '/api/auth/login',
      get: (name: string) => (name.toLowerCase() === 'user-agent' ? 'Mozilla/5.0' : undefined),
    } as unknown as Request;

    for (let i = 0; i < 4; i++) {
      guard.recordFailure(fakeReq, 'cliente@teste.com');
      expect(guard.checkLocked(fakeReq, 'cliente@teste.com').locked).toBe(false);
    }

    guard.recordFailure(fakeReq, 'cliente@teste.com');
    const locked = guard.checkLocked(fakeReq, 'cliente@teste.com');
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterSec).toBeGreaterThan(0);
    expect(blockedEvents).toEqual(['brute_force']);

    guard.clearFailures(fakeReq, 'cliente@teste.com');
    expect(guard.checkLocked(fakeReq, 'cliente@teste.com').locked).toBe(false);
  });

  it('revoga sessões antigas imediatamente quando o hash da senha é alterado', () => {
    const secret = 'segredo-sessao-super-forte-123456';
    const user = sampleUser({ id: 'usr-9', passwordHash: 'aabbcc112233445566778899' });
    const token = signSession(user.id, secret, user.passwordHash.slice(0, 12));
    const { attachUser } = createAuthMiddleware(() => ({ users: [user] }), secret);

    const makeReq = () =>
      ({
        headers: { authorization: `Bearer ${token}` },
      }) as unknown as { headers: { authorization: string }; user?: StoredUser };

    const req1 = makeReq();
    attachUser(req1 as unknown as Request, {} as Response, () => {});
    expect(req1.user?.id).toBe('usr-9');

    // Simula troca ou redefinição de senha do usuário
    user.passwordHash = 'ffeedd998877665544332211';
    const req2 = makeReq();
    attachUser(req2 as unknown as Request, {} as Response, () => {});
    expect(req2.user).toBeUndefined();
  });
});
