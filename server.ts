import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  clearSessionCookie,
  createAuthMiddleware,
  encryptSecret,
  generateReadablePassword,
  getSessionSecret,
  hashPassword,
  publicUser,
  setSessionCookie,
  signSession,
  verifyPassword,
  type AuthedRequest,
} from './server/auth.ts';
import { fetchKiwifyOAuthToken, fetchKiwifySalesPage, resolveKiwifyApiConfig } from './server/kiwifyApi.ts';
import {
  buildCredentialsEmail,
  buildReactivatedEmail,
  buildSuspendedEmail,
  buildTestEmail,
  dispatchEmail,
  resolveEmailConfig,
  sendCredentialsEmail,
  sendReactivatedEmail,
  sendSuspendedEmail,
  sendTestEmail,
} from './server/mailer.ts';
import {
  DATA_DIR,
  UPLOADS_DIR,
  deleteUploadedFileIfLocal,
  loadDb,
  saveDb,
  saveUploadedImage,
  touchDailyMetric,
} from './server/storage.ts';
import type { AffiliateProduct, EmailProviderMode, MemberStatus, StoredUser } from './server/types.ts';

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function detectHostedOrigins(req: express.Request): { requestOrigin: string; publicOrigin: string } {
  const envOrigin = (process.env.APP_URL || process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const protoHeader = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const proto = protoHeader || req.protocol || 'https';
  const hostHeader = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  const host = hostHeader || req.get('host') || '';
  const detected = host ? `${proto}://${host}` : '';
  const requestOrigin = envOrigin || detected;
  const publicOrigin = requestOrigin.includes('://ais-dev-')
    ? requestOrigin.replace('://ais-dev-', '://ais-pre-')
    : requestOrigin;
  return { requestOrigin, publicOrigin };
}

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function cleanText(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function resolveLoginUrl(settingsBaseUrl: string | undefined, fallbackOrigin?: string): string {
  const base = (settingsBaseUrl || fallbackOrigin || 'https://www.congelafit.com.br').trim().replace(/\/+$/, '');
  return isValidHttpUrl(base) ? base : 'https://www.congelafit.com.br';
}

function appendEmailLog(db: ReturnType<typeof loadDb>, log: Parameters<typeof dispatchEmail>[0] extends never ? never : import('./server/types.ts').EmailLog) {
  db.emailLogs = [log, ...db.emailLogs].slice(0, 150);
}

async function provisionMemberAccess(opts: {
  user: StoredUser;
  secret: string;
  loginUrl: string;
  isReset?: boolean;
  sendWelcomeEvenIfPasswordExists?: boolean;
}): Promise<{
  generatedPassword?: string;
  emailStatus?: 'sent' | 'failed' | 'outbox';
  emailProvider?: 'smtp' | 'resend' | 'outbox';
  emailError?: string;
}> {
  const db = loadDb();
  const shouldGenerate = opts.isReset || opts.user.needsPasswordSetup || !opts.user.passwordHash;
  let generatedPassword: string | undefined;

  if (shouldGenerate) {
    generatedPassword = generateReadablePassword(10);
    const { hash, salt } = hashPassword(generatedPassword);
    opts.user.passwordHash = hash;
    opts.user.passwordSalt = salt;
    opts.user.needsPasswordSetup = false;
    opts.user.mustChangePassword = true;
    opts.user.updatedAt = new Date().toISOString();
    saveDb(db);
  }

  if (generatedPassword) {
    const res = await sendCredentialsEmail({
      settings: db.settings,
      secret: opts.secret,
      to: opts.user.email,
      name: opts.user.name,
      password: generatedPassword,
      loginUrl: opts.loginUrl,
      productName: opts.user.kiwifyProduct,
      isReset: opts.isReset,
    });
    opts.user.accessEmailSentAt = res.log.sentAt;
    opts.user.accessEmailStatus = res.status;
    opts.user.accessEmailError = res.error;
    appendEmailLog(db, res.log);
    saveDb(db);
    return {
      generatedPassword,
      emailStatus: res.status,
      emailProvider: res.provider,
      emailError: res.error,
    };
  }

  if (opts.sendWelcomeEvenIfPasswordExists) {
    const res = await sendReactivatedEmail({
      settings: db.settings,
      secret: opts.secret,
      to: opts.user.email,
      name: opts.user.name,
      loginUrl: opts.loginUrl,
    });
    opts.user.accessEmailSentAt = res.log.sentAt;
    opts.user.accessEmailStatus = res.status;
    opts.user.accessEmailError = res.error;
    appendEmailLog(db, res.log);
    saveDb(db);
    return {
      emailStatus: res.status,
      emailProvider: res.provider,
      emailError: res.error,
    };
  }

  return {};
}

function suspensionReasonFor(status: MemberStatus, eventType: string): string {
  if (status === 'pending') return 'Pagamento na Kiwify aguardando confirmação.';
  if (status === 'refunded') return 'Compra reembolsada ou contestada (chargeback) na Kiwify.';
  if (status === 'canceled') return 'Assinatura cancelada ou expirada na Kiwify.';
  if (status === 'suspended') {
    if (eventType.includes('late') || eventType.includes('atrasada') || eventType.includes('overdue')) {
      return 'Assinatura em atraso na Kiwify. Regularize o pagamento para reativar.';
    }
    return 'Pagamento não aprovado ou expirado na Kiwify.';
  }
  return '';
}

async function processKiwifyEvent(
  rawPayload: Record<string, unknown>,
  accepted: boolean,
  detailReason: string,
  opts: { secret: string; fallbackOrigin?: string },
): Promise<{
  ok: boolean;
  statusCode: number;
  message: string;
  generatedPassword?: string;
  emailStatus?: 'sent' | 'failed' | 'outbox';
  emailProvider?: 'smtp' | 'resend' | 'outbox';
}> {
  const db = loadDb();
  const now = new Date().toISOString();
  const payload =
    rawPayload.data && typeof rawPayload.data === 'object' && !Array.isArray(rawPayload.data)
      ? ({ ...rawPayload, ...(rawPayload.data as Record<string, unknown>) } as Record<string, unknown>)
      : rawPayload;

  const customer = (payload.Customer ?? payload.customer ?? {}) as Record<string, unknown>;
  const product = (payload.Product ?? payload.product ?? {}) as Record<string, unknown>;
  const subscription = (payload.Subscription ?? payload.subscription ?? {}) as Record<string, unknown>;

  const email = normalizeEmail(customer.email ?? payload.email);
  const name =
    cleanText(customer.full_name ?? customer.first_name ?? customer.name ?? payload.name, 120) || 'Membro Kiwify';
  const orderId = cleanText(payload.order_id ?? payload.order_ref ?? '', 80);
  const productName = cleanText(product.product_name ?? payload.product_name ?? 'CongelaFit Premium', 120);
  const rawStatus = cleanText(payload.order_status ?? subscription.status ?? '', 40).toLowerCase();
  const subStatus = cleanText(subscription.status ?? '', 40).toLowerCase();
  const eventType = cleanText(payload.webhook_event_type ?? payload.event ?? rawStatus ?? 'webhook', 60).toLowerCase();
  const subscriptionId = cleanText(subscription.id ?? payload.subscription_id ?? '', 80);
  const nextPaymentAt = cleanText(subscription.next_payment ?? '', 60);

  const logEntry = {
    id: crypto.randomUUID(),
    receivedAt: now,
    event: eventType || 'unknown',
    orderId: orderId || '—',
    email: email || '—',
    status: rawStatus || '—',
    accepted,
    detail: detailReason,
  };

  if (!accepted) {
    db.webhookLogs = [logEntry, ...db.webhookLogs].slice(0, 100);
    saveDb(db);
    return { ok: false, statusCode: 401, message: detailReason };
  }

  if (!email || !email.includes('@')) {
    logEntry.accepted = false;
    logEntry.detail = 'Payload sem e-mail de cliente válido.';
    db.webhookLogs = [logEntry, ...db.webhookLogs].slice(0, 100);
    saveDb(db);
    return { ok: false, statusCode: 400, message: logEntry.detail };
  }

  let targetStatus: MemberStatus | null = null;
  if (
    ['order_approved', 'order_paid', 'subscription_renewed', 'compra_aprovada', 'assinatura_renovada'].includes(
      eventType,
    ) ||
    ['paid', 'approved', 'completed', 'active'].includes(rawStatus)
  ) {
    targetStatus = 'active';
  } else if (
    ['order_refunded', 'order_chargedback', 'compra_reembolsada', 'chargeback'].includes(eventType) ||
    ['refunded', 'chargedback'].includes(rawStatus)
  ) {
    targetStatus = 'refunded';
  } else if (
    [
      'subscription_late',
      'assinatura_atrasada',
      'subscription_overdue',
      'order_rejected',
      'order_refused',
      'compra_recusada',
      'pix_expired',
      'pix_expirado',
      'billet_expired',
      'boleto_expirado',
    ].includes(eventType) ||
    ['refused', 'late', 'overdue', 'unpaid'].includes(rawStatus) ||
    ['late', 'overdue', 'past_due'].includes(subStatus)
  ) {
    targetStatus = 'suspended';
  } else if (
    ['subscription_canceled', 'subscription_expired', 'assinatura_cancelada', 'assinatura_expirada'].includes(
      eventType,
    ) ||
    ['canceled', 'cancelled', 'expired'].includes(rawStatus) ||
    ['canceled', 'cancelled', 'expired'].includes(subStatus)
  ) {
    targetStatus = 'canceled';
  } else if (
    ['waiting_payment', 'boleto_gerado', 'pix_gerado', 'pix_created', 'billet_created', 'order_pending'].includes(
      eventType,
    ) ||
    rawStatus === 'waiting_payment'
  ) {
    targetStatus = 'pending';
  }

  const loginUrl = resolveLoginUrl(db.settings.appBaseUrl, opts.fallbackOrigin);
  const existing = db.users.find((u) => u.email === email);
  let targetUser: StoredUser | null = existing ?? null;
  let wasNonActive = false;

  if (existing) {
    wasNonActive = existing.status !== 'active';
    if (existing.role !== 'admin' && targetStatus) {
      existing.status = targetStatus;
      existing.suspendedReason = targetStatus === 'active' ? '' : suspensionReasonFor(targetStatus, eventType);
    }
    if (name && (!existing.name || existing.name === 'Membro Kiwify')) existing.name = name;
    if (orderId) existing.kiwifyOrderId = orderId;
    if (productName) existing.kiwifyProduct = productName;
    if (subscriptionId) existing.kiwifySubscriptionId = subscriptionId;
    if (nextPaymentAt) existing.nextPaymentAt = nextPaymentAt;
    existing.updatedAt = now;
    targetUser = existing;
    logEntry.detail = `Membro atualizado (${existing.status}).`;
  } else if (targetStatus) {
    const newUser: StoredUser = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      email,
      name,
      passwordHash: '',
      passwordSalt: '',
      role: 'member',
      status: targetStatus,
      needsPasswordSetup: true,
      mustChangePassword: false,
      kiwifyOrderId: orderId || undefined,
      kiwifySubscriptionId: subscriptionId || undefined,
      kiwifyProduct: productName || undefined,
      nextPaymentAt: nextPaymentAt || undefined,
      suspendedReason: targetStatus === 'active' ? '' : suspensionReasonFor(targetStatus, eventType),
      loginCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(newUser);
    targetUser = newUser;
    logEntry.detail = `Novo membro registrado (${targetStatus}).`;
  } else {
    logEntry.detail = `Evento registrado sem alteração de status (${eventType}).`;
  }

  db.webhookLogs = [logEntry, ...db.webhookLogs].slice(0, 100);
  saveDb(db);

  let provisionResult: Awaited<ReturnType<typeof provisionMemberAccess>> = {};
  if (targetUser && targetUser.role !== 'admin') {
    if (targetStatus === 'active') {
      provisionResult = await provisionMemberAccess({
        user: targetUser,
        secret: opts.secret,
        loginUrl,
        sendWelcomeEvenIfPasswordExists: wasNonActive,
      });
      if (provisionResult.generatedPassword) {
        logEntry.detail = `Acesso gerado e e-mail (${provisionResult.emailStatus ?? 'ok'}) para ${targetUser.email}.`;
        saveDb(db);
      }
    } else if (
      (targetStatus === 'suspended' || targetStatus === 'canceled') &&
      !wasNonActive &&
      db.settings.sendSuspensionEmail !== false
    ) {
      const suspRes = await sendSuspendedEmail({
        settings: db.settings,
        secret: opts.secret,
        to: targetUser.email,
        name: targetUser.name,
        reason: targetUser.suspendedReason || 'Pagamento não identificado na Kiwify.',
        checkoutUrl: db.settings.kiwifyCheckoutUrl || db.settings.officialSiteUrl || 'https://www.congelafit.com.br',
      });
      appendEmailLog(db, suspRes.log);
      saveDb(db);
    }
  }

  return {
    ok: true,
    statusCode: 200,
    message: logEntry.detail,
    generatedPassword: provisionResult.generatedPassword,
    emailStatus: provisionResult.emailStatus,
    emailProvider: provisionResult.emailProvider,
  };
}

async function startServer() {
  const dbInit = loadDb();
  const secret = getSessionSecret(DATA_DIR);
  const { attachUser, requireAuth, requireAdmin } = createAuthMiddleware(() => loadDb(), secret);

  const app = express();
  app.set('trust proxy', 1);

  // Mantém rawBody para validação de assinatura HMAC-SHA1 da Kiwify
  app.use(
    express.json({
      limit: '8mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
  app.use('/api', attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, members: dbInit.users.length });
  });

  // ───────── Autenticação e Área de Membros ─────────
  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    const db = loadDb();
    let authNotice = '';
    if (!req.user && req.inactiveUser) {
      clearSessionCookie(req, res);
      authNotice =
        req.inactiveUser.suspendedReason ||
        'Seu acesso foi suspenso ou cancelado na Kiwify. Regularize o pagamento para continuar usando o app.';
    }
    res.json({
      user: req.user ? publicUser(req.user) : null,
      authNotice,
      config: {
        officialSiteUrl: db.settings.officialSiteUrl || 'https://www.congelafit.com.br',
        kiwifyCheckoutUrl: db.settings.kiwifyCheckoutUrl,
        kiwifyAffiliateInviteUrl: db.settings.kiwifyAffiliateInviteUrl,
      },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }

    const db = loadDb();
    const user = db.users.find((u) => u.email === email);
    if (!user) {
      res.status(401).json({ error: 'E-mail não encontrado na área de membros.' });
      return;
    }
    if (user.status === 'pending') {
      res.status(403).json({
        error: 'Seu pagamento na Kiwify ainda está aguardando confirmação. Assim que compensar, enviaremos sua senha por e-mail.',
      });
      return;
    }
    if (user.status === 'suspended') {
      res.status(403).json({
        error:
          user.suspendedReason ||
          'Seu acesso foi suspenso por falta de pagamento na Kiwify. Regularize a cobrança para liberar novamente.',
      });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({
        error: user.suspendedReason || 'Seu acesso pela Kiwify está cancelado ou reembolsado.',
      });
      return;
    }
    if (user.needsPasswordSetup || !user.passwordHash) {
      res.status(409).json({
        code: 'NEEDS_PASSWORD_SETUP',
        error: 'Compra confirmada! Como você ainda não tem senha definida, crie uma agora na aba "Primeiro acesso".',
      });
      return;
    }
    if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      return;
    }

    const now = new Date().toISOString();
    user.lastLoginAt = now;
    user.loginCount = (user.loginCount ?? 0) + 1;
    user.updatedAt = now;
    db.analytics.totalLogins += 1;
    touchDailyMetric(db, 'logins');
    saveDb(db);

    const token = signSession(user.id, secret);
    setSessionCookie(req, res, token);
    res.json({ token, user: publicUser(user) });
  });

  app.post('/api/auth/first-access', (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const name = cleanText(req.body?.name, 120);

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe o e-mail usado na compra da Kiwify.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
      return;
    }

    const db = loadDb();
    const user = db.users.find((u) => u.email === email);
    if (!user) {
      res.status(404).json({
        error: 'Nenhuma compra aprovada encontrada para este e-mail. Verifique se digitou o mesmo e-mail da Kiwify.',
      });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Este acesso não está ativo na Kiwify no momento.' });
      return;
    }
    if (!user.needsPasswordSetup && user.passwordHash) {
      res.status(409).json({ error: 'Este e-mail já possui senha cadastrada. Faça login na aba "Entrar".' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();
    user.passwordHash = hash;
    user.passwordSalt = salt;
    if (name) user.name = name;
    user.needsPasswordSetup = false;
    user.lastLoginAt = now;
    user.loginCount = (user.loginCount ?? 0) + 1;
    user.updatedAt = now;
    db.analytics.totalLogins += 1;
    touchDailyMetric(db, 'logins');
    saveDb(db);

    const token = signSession(user.id, secret);
    setSessionCookie(req, res, token);
    res.json({ token, user: publicUser(user) });
  });

  const forgotCooldown = new Map<string, number>();
  app.post('/api/auth/forgot-password', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    const last = forgotCooldown.get(email) ?? 0;
    if (Date.now() - last < 60_000) {
      res.status(429).json({ error: 'Aguarde 1 minuto antes de solicitar outro envio para este e-mail.' });
      return;
    }
    forgotCooldown.set(email, Date.now());

    const db = loadDb();
    const emailCfg = resolveEmailConfig(db.settings, secret);
    const user = db.users.find((u) => u.email === email);
    const origins = detectHostedOrigins(req);
    const loginUrl = resolveLoginUrl(db.settings.appBaseUrl, origins.publicOrigin);

    if (user && user.role === 'member' && user.status === 'active' && emailCfg.provider !== 'outbox') {
      await provisionMemberAccess({
        user,
        secret,
        loginUrl,
        isReset: true,
      });
    }

    res.json({
      ok: true,
      emailConfigured: emailCfg.provider !== 'outbox',
      message:
        emailCfg.provider !== 'outbox'
          ? 'Se o seu e-mail estiver ativo na plataforma, enviamos uma nova senha temporária para sua caixa de entrada.'
          : 'O envio automático de e-mail ainda não foi ativado pelo administrador. Solicite uma nova senha ao suporte.',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/password', requireAuth, (req: AuthedRequest, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    const db = loadDb();
    const user = db.users.find((u) => u.id === req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
      res.status(401).json({ error: 'Senha atual incorreta.' });
      return;
    }
    const { hash, salt } = hashPassword(newPassword);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.mustChangePassword = false;
    user.needsPasswordSetup = false;
    user.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/auth/affiliate-link', requireAuth, (req: AuthedRequest, res) => {
    const affiliateLink = cleanText(req.body?.affiliateLink, 500);
    if (affiliateLink && !isValidHttpUrl(affiliateLink)) {
      res.status(400).json({ error: 'Informe um link válido começando com https:// ou http://.' });
      return;
    }
    const db = loadDb();
    const user = db.users.find((u) => u.id === req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    user.affiliateLink = affiliateLink;
    user.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ user: publicUser(user) });
  });

  // ───────── Webhook da Kiwify (público para chamadas server-to-server da Kiwify) ─────────
  const handleKiwifyWebhookProbe = (req: express.Request, res: express.Response) => {
    const db = loadDb();
    const origins = detectHostedOrigins(req);
    res.json({
      ok: true,
      service: 'CongelaFit Premium Kiwify Webhook',
      platform: 'https://kiwify.com.br/',
      site: db.settings.officialSiteUrl || 'https://www.congelafit.com.br',
      hostedOrigin: origins.publicOrigin,
      endpoint: '/api/webhooks/kiwify',
    });
  };

  const handleKiwifyWebhook = async (req: express.Request, res: express.Response) => {
    const db = loadDb();
    const expectedToken = db.settings.kiwifyWebhookToken;
    const rawBody =
      (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const sigQuery =
      (typeof req.query.signature === 'string' ? req.query.signature.trim() : '') ||
      (typeof req.headers['x-kiwify-signature'] === 'string' ? req.headers['x-kiwify-signature'].trim() : '');
    const tokenParam =
      (typeof req.params.token === 'string' ? req.params.token.trim() : '') ||
      (typeof req.query.token === 'string' ? req.query.token.trim() : '') ||
      (typeof req.headers['x-kiwify-token'] === 'string' ? req.headers['x-kiwify-token'].trim() : '') ||
      (typeof req.headers['x-webhook-token'] === 'string' ? req.headers['x-webhook-token'].trim() : '') ||
      (typeof req.body?.token === 'string' ? req.body.token.trim() : '');

    const timingMatches = (provided: string, expected: string) => {
      if (!provided || !expected) return false;
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    };

    const tokenMatches = timingMatches(tokenParam, expectedToken);
    const hmacMatches = sigQuery
      ? timingMatches(sigQuery, crypto.createHmac('sha1', expectedToken).update(rawBody).digest('hex')) ||
        timingMatches(
          sigQuery,
          crypto
            .createHmac('sha1', expectedToken)
            .update(JSON.stringify(req.body ?? {}))
            .digest('hex'),
        )
      : false;

    const authorized = tokenMatches || hmacMatches;
    let reason = 'Token/assinatura da Kiwify válido.';
    if (!authorized) {
      if (sigQuery && !hmacMatches) reason = 'Assinatura HMAC da Kiwify inválida.';
      else if (tokenParam && !tokenMatches) reason = 'Token do webhook da Kiwify inválido.';
      else reason = 'Token ou assinatura do webhook ausente.';
    }

    const origins = detectHostedOrigins(req);
    const payload = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const result = await processKiwifyEvent(payload, authorized, reason, {
      secret,
      fallbackOrigin: origins.publicOrigin,
    });
    res.status(result.statusCode).json({ ok: result.ok, message: result.message });
  };

  app.get('/api/webhooks/kiwify', handleKiwifyWebhookProbe);
  app.get('/api/webhooks/kiwify/:token', handleKiwifyWebhookProbe);
  app.post('/api/webhooks/kiwify', handleKiwifyWebhook);
  app.post('/api/webhooks/kiwify/:token', handleKiwifyWebhook);

  // ───────── Dados públicos para membros logados ─────────
  app.get('/api/recipe-images', requireAuth, (_req, res) => {
    const db = loadDb();
    const map: Record<string, string> = {};
    for (const [id, info] of Object.entries(db.recipeImages)) {
      map[id] = info.url;
    }
    res.json({ images: map, details: db.recipeImages });
  });

  app.get('/api/products', requireAuth, (_req, res) => {
    const db = loadDb();
    res.json({ products: db.affiliateProducts.filter((p) => p.active) });
  });

  app.post('/api/analytics/event', requireAuth, (req, res) => {
    const type = cleanText(req.body?.type, 40);
    const id = cleanText(req.body?.id, 120);
    const db = loadDb();

    if (type === 'recipe_view' && id) {
      db.analytics.recipeViews[id] = (db.analytics.recipeViews[id] ?? 0) + 1;
      touchDailyMetric(db, 'recipeViews');
      saveDb(db);
    } else if (type === 'product_click' && id) {
      const prod = db.affiliateProducts.find((p) => p.id === id);
      if (prod) prod.clicks = (prod.clicks ?? 0) + 1;
      touchDailyMetric(db, 'productClicks');
      saveDb(db);
    } else if (type === 'referral_share') {
      db.analytics.whatsappReferralShares += 1;
      touchDailyMetric(db, 'referralShares');
      saveDb(db);
    }
    res.json({ ok: true });
  });

  // ───────── Rotas exclusivas do ADMIN ─────────
  app.get('/api/admin/analytics', requireAdmin, (_req, res) => {
    const db = loadDb();
    const members = db.users.filter((u) => u.role !== 'admin');
    const topRecipes = Object.entries(db.analytics.recipeViews)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, views]) => ({ id, views }));
    const totalRecipeViews = Object.values(db.analytics.recipeViews).reduce((s, n) => s + n, 0);
    const totalProductClicks = db.affiliateProducts.reduce((s, p) => s + (p.clicks ?? 0), 0);
    const daily = Object.entries(db.analytics.daily)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, m]) => ({ date, ...m }));

    res.json({
      summary: {
        totalMembers: members.length,
        activeMembers: members.filter((m) => m.status === 'active').length,
        pendingMembers: members.filter((m) => m.status === 'pending').length,
        inactiveMembers: members.filter(
          (m) => m.status === 'suspended' || m.status === 'refunded' || m.status === 'canceled',
        ).length,
        totalLogins: db.analytics.totalLogins,
        totalRecipeViews,
        totalProductClicks,
        whatsappReferralShares: db.analytics.whatsappReferralShares,
        customRecipeImages: Object.keys(db.recipeImages).length,
        activeProducts: db.affiliateProducts.filter((p) => p.active).length,
      },
      topRecipes,
      products: db.affiliateProducts
        .slice()
        .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0))
        .map((p) => ({ id: p.id, title: p.title, category: p.category, clicks: p.clicks ?? 0, active: p.active })),
      daily,
    });
  });

  app.get('/api/admin/kiwify', requireAdmin, (req, res) => {
    const db = loadDb();
    const hosting = detectHostedOrigins(req);
    const emailCfg = resolveEmailConfig(db.settings, secret);
    const apiCfg = resolveKiwifyApiConfig(db.settings, secret);
    res.json({
      settings: {
        officialSiteUrl: db.settings.officialSiteUrl || 'https://www.congelafit.com.br',
        appBaseUrl: db.settings.appBaseUrl ?? '',
        kiwifyWebhookToken: db.settings.kiwifyWebhookToken,
        kiwifyCheckoutUrl: db.settings.kiwifyCheckoutUrl,
        kiwifyAffiliateInviteUrl: db.settings.kiwifyAffiliateInviteUrl,
        kiwifyClientId: db.settings.kiwifyClientId ?? '',
        kiwifyAccountId: db.settings.kiwifyAccountId ?? '',
        kiwifyProductId: db.settings.kiwifyProductId ?? '',
        kiwifyLastSyncAt: db.settings.kiwifyLastSyncAt ?? null,
        hasKiwifyClientSecret: Boolean(db.settings.kiwifyClientSecretEnc || process.env.KIWIFY_CLIENT_SECRET),
        emailProvider: db.settings.emailProvider ?? 'auto',
        smtpHost: db.settings.smtpHost ?? '',
        smtpPort: db.settings.smtpPort ?? 587,
        smtpSecure: Boolean(db.settings.smtpSecure),
        smtpUser: db.settings.smtpUser ?? '',
        hasSmtpPass: Boolean(db.settings.smtpPassEnc || process.env.SMTP_PASS),
        hasResendKey: Boolean(db.settings.resendApiKeyEnc || process.env.RESEND_API_KEY),
        emailFromName: db.settings.emailFromName ?? 'CongelaFit Premium',
        emailFromAddress: db.settings.emailFromAddress ?? '',
        sendSuspensionEmail: db.settings.sendSuspensionEmail !== false,
        activeEmailProvider: emailCfg.provider,
        envEmailConfigured: emailCfg.envConfigured,
        envKiwifyApiConfigured: apiCfg.envConfigured,
        kiwifyApiConfigured: apiCfg.configured,
        updatedAt: db.settings.updatedAt,
      },
      webhookLogs: db.webhookLogs,
      emailLogs: db.emailLogs,
      hosting: {
        ...hosting,
        defaultSiteUrl: 'https://www.congelafit.com.br',
        kiwifySiteUrl: 'https://kiwify.com.br/',
      },
    });
  });

  app.put('/api/admin/kiwify', requireAdmin, (req, res) => {
    const db = loadDb();
    const officialSiteUrl = cleanText(req.body?.officialSiteUrl, 300).replace(/\/+$/, '');
    const appBaseUrl = cleanText(req.body?.appBaseUrl, 300).replace(/\/+$/, '');
    const token = cleanText(req.body?.kiwifyWebhookToken, 120);
    const checkoutUrl = cleanText(req.body?.kiwifyCheckoutUrl, 500);
    const affiliateInviteUrl = cleanText(req.body?.kiwifyAffiliateInviteUrl, 500);

    if (officialSiteUrl && !isValidHttpUrl(officialSiteUrl)) {
      res.status(400).json({ error: 'Domínio oficial inválido (use https://...).' });
      return;
    }
    if (appBaseUrl && !isValidHttpUrl(appBaseUrl)) {
      res.status(400).json({ error: 'URL de hospedagem do app inválida (use https://...).' });
      return;
    }
    if (token.length < 6) {
      res.status(400).json({ error: 'O token do webhook precisa ter pelo menos 6 caracteres.' });
      return;
    }
    if (checkoutUrl && !isValidHttpUrl(checkoutUrl)) {
      res.status(400).json({ error: 'Link de checkout/site do CongelaFit inválido.' });
      return;
    }
    if (affiliateInviteUrl && !isValidHttpUrl(affiliateInviteUrl)) {
      res.status(400).json({ error: 'Link de afiliação da Kiwify inválido.' });
      return;
    }

    if (officialSiteUrl) db.settings.officialSiteUrl = officialSiteUrl;
    db.settings.appBaseUrl = appBaseUrl;
    db.settings.kiwifyWebhookToken = token;
    db.settings.kiwifyCheckoutUrl = checkoutUrl;
    db.settings.kiwifyAffiliateInviteUrl = affiliateInviteUrl;

    // Credenciais opcionais da API Pública da Kiwify
    if (typeof req.body?.kiwifyClientId === 'string') {
      db.settings.kiwifyClientId = cleanText(req.body.kiwifyClientId, 160);
    }
    if (typeof req.body?.kiwifyAccountId === 'string') {
      db.settings.kiwifyAccountId = cleanText(req.body.kiwifyAccountId, 160);
    }
    if (typeof req.body?.kiwifyProductId === 'string') {
      db.settings.kiwifyProductId = cleanText(req.body.kiwifyProductId, 160);
    }
    if (typeof req.body?.kiwifyClientSecret === 'string' && req.body.kiwifyClientSecret.trim()) {
      db.settings.kiwifyClientSecretEnc = encryptSecret(req.body.kiwifyClientSecret, secret);
    } else if (req.body?.clearKiwifyClientSecret === true) {
      db.settings.kiwifyClientSecretEnc = '';
    }

    // Configurações de envio de e-mail (SMTP / Resend)
    if (
      typeof req.body?.emailProvider === 'string' &&
      ['auto', 'smtp', 'resend', 'outbox'].includes(req.body.emailProvider)
    ) {
      db.settings.emailProvider = req.body.emailProvider as EmailProviderMode;
    }
    if (typeof req.body?.smtpHost === 'string') db.settings.smtpHost = cleanText(req.body.smtpHost, 200);
    if (req.body?.smtpPort !== undefined) {
      const port = Number(req.body.smtpPort);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        res.status(400).json({ error: 'Porta SMTP inválida.' });
        return;
      }
      db.settings.smtpPort = Math.round(port);
    }
    if (typeof req.body?.smtpSecure === 'boolean') db.settings.smtpSecure = req.body.smtpSecure;
    if (typeof req.body?.smtpUser === 'string') db.settings.smtpUser = cleanText(req.body.smtpUser, 200);
    if (typeof req.body?.smtpPass === 'string' && req.body.smtpPass.trim()) {
      db.settings.smtpPassEnc = encryptSecret(req.body.smtpPass, secret);
    } else if (req.body?.clearSmtpPass === true) {
      db.settings.smtpPassEnc = '';
    }
    if (typeof req.body?.resendApiKey === 'string' && req.body.resendApiKey.trim()) {
      db.settings.resendApiKeyEnc = encryptSecret(req.body.resendApiKey, secret);
    } else if (req.body?.clearResendApiKey === true) {
      db.settings.resendApiKeyEnc = '';
    }
    if (typeof req.body?.emailFromName === 'string') {
      db.settings.emailFromName = cleanText(req.body.emailFromName, 120) || 'CongelaFit Premium';
    }
    if (typeof req.body?.emailFromAddress === 'string') {
      db.settings.emailFromAddress = cleanText(req.body.emailFromAddress, 200);
    }
    if (typeof req.body?.sendSuspensionEmail === 'boolean') {
      db.settings.sendSuspensionEmail = req.body.sendSuspensionEmail;
    }

    db.settings.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ ok: true });
  });

  app.get('/api/admin/email/preview', requireAdmin, (req, res) => {
    const db = loadDb();
    const origins = detectHostedOrigins(req);
    const loginUrl = resolveLoginUrl(db.settings.appBaseUrl, origins.publicOrigin);
    const officialSiteUrl = db.settings.officialSiteUrl || 'https://www.congelafit.com.br';
    const rawType = typeof req.query.type === 'string' ? req.query.type : 'welcome';
    const logoSrc = '/icons/logo-mark.png';

    const rendered =
      rawType === 'reset'
        ? buildCredentialsEmail({
            to: 'aluna@exemplo.com',
            name: 'Maria Silva',
            password: 'Fit892Kiwify',
            loginUrl,
            officialSiteUrl,
            productName: 'CongelaFit Premium',
            isReset: true,
            logoSrc,
          })
        : rawType === 'reactivated'
          ? buildReactivatedEmail({
              to: 'aluna@exemplo.com',
              name: 'Maria Silva',
              loginUrl,
              officialSiteUrl,
              logoSrc,
            })
          : rawType === 'suspended'
            ? buildSuspendedEmail({
                name: 'Maria Silva',
                reason: 'Assinatura em atraso na Kiwify. Regularize o pagamento para reativar.',
                checkoutUrl: db.settings.kiwifyCheckoutUrl || officialSiteUrl,
                officialSiteUrl,
                logoSrc,
              })
            : rawType === 'test'
              ? buildTestEmail({
                  loginUrl,
                  officialSiteUrl,
                  logoSrc,
                })
              : buildCredentialsEmail({
                  to: 'aluna@exemplo.com',
                  name: 'Maria Silva',
                  password: 'Fit892Kiwify',
                  loginUrl,
                  officialSiteUrl,
                  productName: 'CongelaFit Premium',
                  isReset: false,
                  logoSrc,
                });

    res.json(rendered);
  });

  app.post('/api/admin/email/test', requireAdmin, async (req: AuthedRequest, res) => {
    const db = loadDb();
    const to = normalizeEmail(req.body?.to) || req.user!.email;
    if (!to || !to.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail de destino válido para o teste.' });
      return;
    }
    const origins = detectHostedOrigins(req);
    const loginUrl = resolveLoginUrl(db.settings.appBaseUrl, origins.publicOrigin);
    const result = await sendTestEmail({
      settings: db.settings,
      secret,
      to,
      loginUrl,
    });
    appendEmailLog(db, result.log);
    saveDb(db);
    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      status: result.status,
      provider: result.provider,
      error: result.error,
    });
  });

  app.post('/api/admin/kiwify/test-connection', requireAdmin, async (_req, res) => {
    const db = loadDb();
    const cfg = resolveKiwifyApiConfig(db.settings, secret);
    if (!cfg.configured) {
      res.status(400).json({ error: 'Preencha Client ID, Client Secret e Account ID da API da Kiwify e salve antes de testar.' });
      return;
    }
    try {
      await fetchKiwifyOAuthToken(cfg);
      const { sales } = await fetchKiwifySalesPage(cfg, { pageNumber: 1, pageSize: 5 });
      res.json({
        ok: true,
        message: `Conexão autenticada com a API da Kiwify! (${sales.length} venda(s) recentes encontradas na primeira página).`,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao conectar na API da Kiwify.' });
    }
  });

  app.post('/api/admin/kiwify/sync', requireAdmin, async (req, res) => {
    const db = loadDb();
    const cfg = resolveKiwifyApiConfig(db.settings, secret);
    if (!cfg.configured) {
      res.status(400).json({ error: 'Configure Client ID, Client Secret e Account ID da Kiwify para sincronizar vendas.' });
      return;
    }
    try {
      const origins = detectHostedOrigins(req);
      const loginUrl = resolveLoginUrl(db.settings.appBaseUrl, origins.publicOrigin);
      let page = 1;
      let totalProcessed = 0;
      let activated = 0;
      let suspended = 0;
      let emailsSent = 0;

      while (page <= 5) {
        const { sales, hasMore } = await fetchKiwifySalesPage(cfg, { pageNumber: page, pageSize: 50 });
        for (const sale of sales) {
          totalProcessed++;
          if (!sale.mappedStatus) continue;
          const now = new Date().toISOString();
          const existing = db.users.find((u) => u.email === sale.email);
          if (existing) {
            const prevStatus = existing.status;
            if (existing.role !== 'admin') {
              existing.status = sale.mappedStatus;
              existing.suspendedReason =
                sale.mappedStatus === 'active' ? '' : suspensionReasonFor(sale.mappedStatus, sale.rawStatus);
            }
            if (sale.orderId) existing.kiwifyOrderId = sale.orderId;
            if (sale.productName) existing.kiwifyProduct = sale.productName;
            if (sale.subscriptionId) existing.kiwifySubscriptionId = sale.subscriptionId;
            if (sale.nextPaymentAt) existing.nextPaymentAt = sale.nextPaymentAt;
            existing.updatedAt = now;
            saveDb(db);

            if (existing.role !== 'admin' && sale.mappedStatus === 'active') {
              if (prevStatus !== 'active') activated++;
              const prov = await provisionMemberAccess({
                user: existing,
                secret,
                loginUrl,
                sendWelcomeEvenIfPasswordExists: prevStatus !== 'active',
              });
              if (prov.emailStatus === 'sent') emailsSent++;
            } else if (
              existing.role !== 'admin' &&
              (sale.mappedStatus === 'suspended' || sale.mappedStatus === 'canceled' || sale.mappedStatus === 'refunded') &&
              prevStatus === 'active'
            ) {
              suspended++;
            }
          } else {
            const newUser: StoredUser = {
              id: `usr-${crypto.randomBytes(6).toString('hex')}`,
              email: sale.email,
              name: sale.name,
              passwordHash: '',
              passwordSalt: '',
              role: 'member',
              status: sale.mappedStatus,
              needsPasswordSetup: true,
              kiwifyOrderId: sale.orderId || undefined,
              kiwifySubscriptionId: sale.subscriptionId || undefined,
              kiwifyProduct: sale.productName || undefined,
              nextPaymentAt: sale.nextPaymentAt || undefined,
              suspendedReason:
                sale.mappedStatus === 'active' ? '' : suspensionReasonFor(sale.mappedStatus, sale.rawStatus),
              loginCount: 0,
              createdAt: now,
              updatedAt: now,
            };
            db.users.push(newUser);
            saveDb(db);
            if (sale.mappedStatus === 'active') {
              activated++;
              const prov = await provisionMemberAccess({ user: newUser, secret, loginUrl });
              if (prov.emailStatus === 'sent') emailsSent++;
            } else {
              suspended++;
            }
          }
        }
        if (!hasMore || sales.length === 0) break;
        page++;
      }

      db.settings.kiwifyLastSyncAt = new Date().toISOString();
      saveDb(db);
      res.json({
        ok: true,
        message: `Sincronização concluída: ${totalProcessed} venda(s) analisada(s), ${activated} liberação(ões), ${suspended} suspensão(ões)/cancelamento(s), ${emailsSent} e-mail(s) enviado(s).`,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao sincronizar vendas da Kiwify.' });
    }
  });

  app.post('/api/admin/kiwify/test', requireAdmin, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanText(req.body?.name, 120) || 'Cliente Teste Kiwify';
    const event = cleanText(req.body?.event, 40) || 'order_approved';
    const statusMap: Record<string, string> = {
      order_approved: 'paid',
      subscription_renewed: 'paid',
      waiting_payment: 'waiting_payment',
      subscription_late: 'late',
      order_rejected: 'refused',
      order_refunded: 'refunded',
      subscription_canceled: 'canceled',
    };
    const origins = detectHostedOrigins(req);
    const result = await processKiwifyEvent(
      {
        order_id: `TEST-${Date.now().toString(36).toUpperCase()}`,
        order_status: statusMap[event] ?? 'paid',
        webhook_event_type: event,
        Customer: { email, full_name: name },
        Product: { product_name: 'CongelaFit Premium' },
      },
      true,
      'Simulação manual pelo Admin.',
      { secret, fallbackOrigin: origins.publicOrigin },
    );
    res.status(result.statusCode).json({
      ok: result.ok,
      message: result.message,
      generatedPassword: result.generatedPassword,
      emailStatus: result.emailStatus,
      emailProvider: result.emailProvider,
    });
  });

  app.get('/api/admin/members', requireAdmin, (_req, res) => {
    const db = loadDb();
    const members = db.users
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((u) => ({
        ...publicUser(u),
        needsPasswordSetup: u.needsPasswordSetup,
        loginCount: u.loginCount ?? 0,
        kiwifyOrderId: u.kiwifyOrderId ?? '',
      }));
    res.json({ members });
  });

  app.post('/api/admin/members', requireAdmin, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanText(req.body?.name, 120) || 'Membro CongelaFit';
    let password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    const autoGenerate = req.body?.autoGeneratePassword === true;
    const sendEmail = req.body?.sendEmail === true;

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (password && password.length < 6) {
      res.status(400).json({ error: 'A senha inicial precisa ter pelo menos 6 caracteres.' });
      return;
    }
    const db = loadDb();
    if (db.users.some((u) => u.email === email)) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      return;
    }

    let generatedPassword: string | undefined;
    if (autoGenerate || (sendEmail && !password)) {
      password = generateReadablePassword(10);
      generatedPassword = password;
    }

    const now = new Date().toISOString();
    const creds = password ? hashPassword(password) : { hash: '', salt: '' };
    const created: StoredUser = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      email,
      name,
      passwordHash: creds.hash,
      passwordSalt: creds.salt,
      role: 'member',
      status: 'active',
      needsPasswordSetup: !password,
      mustChangePassword: Boolean(generatedPassword),
      kiwifyProduct: 'Liberação manual Admin',
      loginCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(created);
    saveDb(db);

    let emailResult: { status: string; provider: string; error?: string } | undefined;
    if (sendEmail && password) {
      const origins = detectHostedOrigins(req);
      const loginUrl = resolveLoginUrl(db.settings.appBaseUrl, origins.publicOrigin);
      const disp = await sendCredentialsEmail({
        settings: db.settings,
        secret,
        to: created.email,
        name: created.name,
        password,
        loginUrl,
        productName: created.kiwifyProduct,
      });
      created.accessEmailSentAt = disp.log.sentAt;
      created.accessEmailStatus = disp.status;
      created.accessEmailError = disp.error;
      appendEmailLog(db, disp.log);
      saveDb(db);
      emailResult = { status: disp.status, provider: disp.provider, error: disp.error };
    }

    res.status(201).json({
      member: { ...publicUser(created), needsPasswordSetup: created.needsPasswordSetup },
      generatedPassword: generatedPassword ?? (password && sendEmail ? password : undefined),
      emailResult,
    });
  });

  app.post('/api/admin/members/:id/send-access', requireAdmin, async (req, res) => {
    const db = loadDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Membro não encontrado.' });
      return;
    }
    if (target.role === 'admin') {
      res.status(400).json({ error: 'Use a tela Mais -> Alterar senha para atualizar a senha do Administrador.' });
      return;
    }
    if (req.body?.activate === true || target.status !== 'active') {
      target.status = 'active';
      target.suspendedReason = '';
    }
    const origins = detectHostedOrigins(req);
    const loginUrl = resolveLoginUrl(db.settings.appBaseUrl, origins.publicOrigin);
    const result = await provisionMemberAccess({
      user: target,
      secret,
      loginUrl,
      isReset: true,
    });
    res.json({
      ok: true,
      generatedPassword: result.generatedPassword,
      emailStatus: result.emailStatus,
      emailProvider: result.emailProvider,
      emailError: result.emailError,
      member: { ...publicUser(target), needsPasswordSetup: target.needsPasswordSetup },
    });
  });

  app.patch('/api/admin/members/:id', requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Membro não encontrado.' });
      return;
    }
    if (target.id === req.user!.id && req.body?.status && req.body.status !== 'active') {
      res.status(400).json({ error: 'Não é possível desativar sua própria conta de administrador.' });
      return;
    }
    if (
      typeof req.body?.status === 'string' &&
      ['active', 'pending', 'suspended', 'refunded', 'canceled'].includes(req.body.status)
    ) {
      target.status = req.body.status as MemberStatus;
      target.suspendedReason =
        target.status === 'active'
          ? ''
          : cleanText(req.body?.reason, 200) ||
            (target.status === 'suspended'
              ? 'Acesso suspenso pelo administrador (pagamento pendente).'
              : suspensionReasonFor(target.status, ''));
    }
    if (req.body?.resetPassword === true) {
      target.passwordHash = '';
      target.passwordSalt = '';
      target.needsPasswordSetup = true;
      target.mustChangePassword = false;
    }
    target.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ member: { ...publicUser(target), needsPasswordSetup: target.needsPasswordSetup } });
  });

  app.delete('/api/admin/members/:id', requireAdmin, (req: AuthedRequest, res) => {
    const db = loadDb();
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'Não é possível excluir a conta em uso.' });
      return;
    }
    const before = db.users.length;
    db.users = db.users.filter((u) => u.id !== req.params.id);
    if (db.users.length === before) {
      res.status(404).json({ error: 'Membro não encontrado.' });
      return;
    }
    saveDb(db);
    res.json({ ok: true });
  });

  // Trocar imagem de receita (por link hospedado ou upload de imagem normal)
  app.post('/api/admin/recipes/:id/image', requireAdmin, (req, res) => {
    const id = cleanText(req.params.id, 120);
    const mode = req.body?.mode === 'upload' ? 'upload' : 'link';
    if (!id) {
      res.status(400).json({ error: 'Receita inválida.' });
      return;
    }
    const db = loadDb();
    const prev = db.recipeImages[id];
    let finalUrl = '';

    try {
      if (mode === 'upload') {
        const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : '';
        finalUrl = saveUploadedImage(`recipe-${id}`, dataUrl);
      } else {
        const url = cleanText(req.body?.url, 1000);
        if (!isValidHttpUrl(url)) {
          res.status(400).json({ error: 'Informe um link de imagem válido (https://... ou http://...).' });
          return;
        }
        finalUrl = url;
      }
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao processar imagem.' });
      return;
    }

    if (prev?.mode === 'upload') {
      deleteUploadedFileIfLocal(prev.url);
    }

    db.recipeImages[id] = {
      url: finalUrl,
      mode,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    res.json({ id, override: db.recipeImages[id] });
  });

  app.delete('/api/admin/recipes/:id/image', requireAdmin, (req, res) => {
    const id = cleanText(req.params.id, 120);
    const db = loadDb();
    const prev = db.recipeImages[id];
    if (prev?.mode === 'upload') {
      deleteUploadedFileIfLocal(prev.url);
    }
    delete db.recipeImages[id];
    saveDb(db);
    res.json({ ok: true });
  });

  // Produtos afiliados (Itens para o dia a dia)
  app.get('/api/admin/products', requireAdmin, (_req, res) => {
    const db = loadDb();
    res.json({ products: db.affiliateProducts });
  });

  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const title = cleanText(req.body?.title, 120);
    const description = cleanText(req.body?.description, 400);
    const category = cleanText(req.body?.category, 60) || 'Cozinha e Marmitas';
    const priceLabel = cleanText(req.body?.priceLabel, 40);
    const badge = cleanText(req.body?.badge, 40);
    const affiliateUrl = cleanText(req.body?.affiliateUrl, 1000);
    const active = req.body?.active !== false;

    if (!title) {
      res.status(400).json({ error: 'Informe o nome do item.' });
      return;
    }
    if (!isValidHttpUrl(affiliateUrl)) {
      res.status(400).json({ error: 'Informe um link de afiliado válido (https://...).' });
      return;
    }

    let imageUrl = cleanText(req.body?.imageUrl, 1000);
    if (typeof req.body?.imageDataUrl === 'string' && req.body.imageDataUrl.startsWith('data:image/')) {
      try {
        imageUrl = saveUploadedImage('product', req.body.imageDataUrl);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Imagem inválida.' });
        return;
      }
    } else if (imageUrl && !isValidHttpUrl(imageUrl)) {
      res.status(400).json({ error: 'Link da imagem inválido.' });
      return;
    }

    const now = new Date().toISOString();
    const item: AffiliateProduct = {
      id: `prd-${crypto.randomBytes(5).toString('hex')}`,
      title,
      description,
      category,
      priceLabel,
      imageUrl,
      affiliateUrl,
      badge: badge || undefined,
      active,
      clicks: 0,
      createdAt: now,
      updatedAt: now,
    };
    const db = loadDb();
    db.affiliateProducts.unshift(item);
    saveDb(db);
    res.status(201).json({ product: item });
  });

  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const db = loadDb();
    const item = db.affiliateProducts.find((p) => p.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Produto não encontrado.' });
      return;
    }
    const title = cleanText(req.body?.title, 120);
    const affiliateUrl = cleanText(req.body?.affiliateUrl, 1000);
    if (!title) {
      res.status(400).json({ error: 'Informe o nome do item.' });
      return;
    }
    if (!isValidHttpUrl(affiliateUrl)) {
      res.status(400).json({ error: 'Link de afiliado inválido.' });
      return;
    }

    let nextImageUrl = cleanText(req.body?.imageUrl, 1000);
    if (typeof req.body?.imageDataUrl === 'string' && req.body.imageDataUrl.startsWith('data:image/')) {
      try {
        deleteUploadedFileIfLocal(item.imageUrl);
        nextImageUrl = saveUploadedImage('product', req.body.imageDataUrl);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Imagem inválida.' });
        return;
      }
    } else if (nextImageUrl && !nextImageUrl.startsWith('/uploads/') && !isValidHttpUrl(nextImageUrl)) {
      res.status(400).json({ error: 'Link da imagem inválido.' });
      return;
    } else if (!nextImageUrl && item.imageUrl.startsWith('/uploads/')) {
      deleteUploadedFileIfLocal(item.imageUrl);
    }

    item.title = title;
    item.description = cleanText(req.body?.description, 400);
    item.category = cleanText(req.body?.category, 60) || 'Cozinha e Marmitas';
    item.priceLabel = cleanText(req.body?.priceLabel, 40);
    item.badge = cleanText(req.body?.badge, 40) || undefined;
    item.affiliateUrl = affiliateUrl;
    item.imageUrl = nextImageUrl;
    if (typeof req.body?.active === 'boolean') item.active = req.body.active;
    item.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ product: item });
  });

  app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
    const db = loadDb();
    const target = db.affiliateProducts.find((p) => p.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Produto não encontrado.' });
      return;
    }
    deleteUploadedFileIfLocal(target.imageUrl);
    db.affiliateProducts = db.affiliateProducts.filter((p) => p.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // ───────── Frontend Vite (dev) ou dist/ (produção) ─────────
  const distDir = path.resolve(process.cwd(), 'dist');
  if (!isProd || !fs.existsSync(distDir)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CongelaFit Premium rodando em http://0.0.0.0:${PORT}`);
  });
}

void startServer();
