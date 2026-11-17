import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  clearSessionCookie,
  createAuthMiddleware,
  getSessionSecret,
  hashPassword,
  publicUser,
  setSessionCookie,
  signSession,
  verifyPassword,
  type AuthedRequest,
} from './server/auth.ts';
import {
  DATA_DIR,
  UPLOADS_DIR,
  deleteUploadedFileIfLocal,
  loadDb,
  saveDb,
  saveUploadedImage,
  touchDailyMetric,
} from './server/storage.ts';
import type { AffiliateProduct, MemberStatus, StoredUser } from './server/types.ts';

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

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function cleanText(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function processKiwifyEvent(
  payload: Record<string, unknown>,
  accepted: boolean,
  detailReason: string,
): { ok: boolean; statusCode: number; message: string } {
  const db = loadDb();
  const now = new Date().toISOString();

  const customer = (payload.Customer ?? payload.customer ?? {}) as Record<string, unknown>;
  const product = (payload.Product ?? payload.product ?? {}) as Record<string, unknown>;
  const subscription = (payload.Subscription ?? payload.subscription ?? {}) as Record<string, unknown>;

  const email = normalizeEmail(customer.email ?? payload.email);
  const name = cleanText(customer.full_name ?? customer.name ?? payload.name, 120) || 'Membro Kiwify';
  const orderId = cleanText(payload.order_id ?? payload.order_ref ?? '', 80);
  const productName = cleanText(product.product_name ?? payload.product_name ?? 'CongelaFit Premium', 120);
  const rawStatus = cleanText(payload.order_status ?? subscription.status ?? '', 40).toLowerCase();
  const eventType = cleanText(payload.webhook_event_type ?? payload.event ?? rawStatus ?? 'webhook', 60).toLowerCase();

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
    ['order_approved', 'order_paid', 'subscription_renewed', 'compra_aprovada'].includes(eventType) ||
    ['paid', 'approved', 'completed', 'active'].includes(rawStatus)
  ) {
    targetStatus = 'active';
  } else if (
    ['order_refunded', 'order_chargedback', 'compra_reembolsada', 'chargeback'].includes(eventType) ||
    ['refunded', 'chargedback'].includes(rawStatus)
  ) {
    targetStatus = 'refunded';
  } else if (
    ['subscription_canceled', 'subscription_late', 'subscription_expired', 'assinatura_cancelada', 'assinatura_atrasada'].includes(eventType) ||
    ['canceled', 'cancelled', 'expired', 'refused'].includes(rawStatus)
  ) {
    targetStatus = 'canceled';
  } else if (['waiting_payment', 'boleto_gerado', 'pix_gerado'].includes(eventType) || rawStatus === 'waiting_payment') {
    targetStatus = 'pending';
  }

  const existing = db.users.find((u) => u.email === email);
  if (existing) {
    if (existing.role !== 'admin' && targetStatus) {
      existing.status = targetStatus;
    }
    if (name && (!existing.name || existing.name === 'Membro Kiwify')) existing.name = name;
    if (orderId) existing.kiwifyOrderId = orderId;
    if (productName) existing.kiwifyProduct = productName;
    existing.updatedAt = now;
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
      kiwifyOrderId: orderId || undefined,
      kiwifyProduct: productName || undefined,
      loginCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(newUser);
    logEntry.detail = `Novo membro registrado (${targetStatus}).`;
  } else {
    logEntry.detail = `Evento registrado sem alteração de status (${eventType}).`;
  }

  db.webhookLogs = [logEntry, ...db.webhookLogs].slice(0, 100);
  saveDb(db);
  return { ok: true, statusCode: 200, message: logEntry.detail };
}

async function startServer() {
  const dbInit = loadDb();
  const secret = getSessionSecret(DATA_DIR);
  const { attachUser, requireAuth, requireAdmin } = createAuthMiddleware(() => loadDb(), secret);

  const app = express();
  app.set('trust proxy', 1);

  // Mantém rawBody para validação opcional de assinatura HMAC-SHA1 da Kiwify
  app.use(
    express.json({
      limit: '8mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
  app.use('/api', attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, members: dbInit.users.length });
  });

  // ───────── Autenticação e Área de Membros ─────────
  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    const db = loadDb();
    res.json({
      user: req.user ? publicUser(req.user) : null,
      config: {
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
      res.status(403).json({ error: 'Seu pagamento na Kiwify ainda está pendente de confirmação.' });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Seu acesso pela Kiwify está inativo, cancelado ou reembolsado.' });
      return;
    }
    if (user.needsPasswordSetup || !user.passwordHash) {
      res.status(409).json({
        code: 'NEEDS_PASSWORD_SETUP',
        error: 'Compra confirmada! Como é seu primeiro acesso, crie sua senha na aba "Primeiro acesso".',
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
    setSessionCookie(res, token);
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
    setSessionCookie(res, token);
    res.json({ token, user: publicUser(user) });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
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
  const handleKiwifyWebhook = (req: express.Request, res: express.Response) => {
    const db = loadDb();
    const expectedToken = db.settings.kiwifyWebhookToken;
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const sigQuery = typeof req.query.signature === 'string' ? req.query.signature.trim() : '';
    const tokenParam =
      (typeof req.params.token === 'string' ? req.params.token : '') ||
      (typeof req.query.token === 'string' ? req.query.token : '') ||
      (typeof req.headers['x-kiwify-token'] === 'string' ? req.headers['x-kiwify-token'] : '') ||
      (typeof req.headers['x-webhook-token'] === 'string' ? req.headers['x-webhook-token'] : '') ||
      (typeof req.body?.token === 'string' ? req.body.token : '');

    let authorized = false;
    let reason = 'Token/assinatura da Kiwify válido.';

    if (sigQuery) {
      const expectedSig = crypto.createHmac('sha1', expectedToken).update(rawBody).digest('hex');
      const a = Buffer.from(sigQuery);
      const b = Buffer.from(expectedSig);
      authorized = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!authorized) reason = 'Assinatura HMAC da Kiwify inválida.';
    } else if (tokenParam) {
      const a = Buffer.from(tokenParam);
      const b = Buffer.from(expectedToken);
      authorized = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!authorized) reason = 'Token do webhook da Kiwify inválido.';
    } else {
      authorized = false;
      reason = 'Token ou assinatura do webhook ausente.';
    }

    const payload = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const result = processKiwifyEvent(payload, authorized, reason);
    res.status(result.statusCode).json({ ok: result.ok, message: result.message });
  };

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
        inactiveMembers: members.filter((m) => m.status === 'refunded' || m.status === 'canceled').length,
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

  app.get('/api/admin/kiwify', requireAdmin, (_req, res) => {
    const db = loadDb();
    res.json({
      settings: db.settings,
      webhookLogs: db.webhookLogs,
    });
  });

  app.put('/api/admin/kiwify', requireAdmin, (req, res) => {
    const db = loadDb();
    const token = cleanText(req.body?.kiwifyWebhookToken, 120);
    const checkoutUrl = cleanText(req.body?.kiwifyCheckoutUrl, 500);
    const affiliateInviteUrl = cleanText(req.body?.kiwifyAffiliateInviteUrl, 500);

    if (token.length < 6) {
      res.status(400).json({ error: 'O token do webhook precisa ter pelo menos 6 caracteres.' });
      return;
    }
    if (checkoutUrl && !isValidHttpUrl(checkoutUrl)) {
      res.status(400).json({ error: 'Link de checkout da Kiwify inválido.' });
      return;
    }
    if (affiliateInviteUrl && !isValidHttpUrl(affiliateInviteUrl)) {
      res.status(400).json({ error: 'Link de afiliação da Kiwify inválido.' });
      return;
    }

    db.settings.kiwifyWebhookToken = token;
    db.settings.kiwifyCheckoutUrl = checkoutUrl;
    db.settings.kiwifyAffiliateInviteUrl = affiliateInviteUrl;
    db.settings.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ settings: db.settings });
  });

  app.post('/api/admin/kiwify/test', requireAdmin, (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanText(req.body?.name, 120) || 'Cliente Teste Kiwify';
    const event = cleanText(req.body?.event, 40) || 'order_approved';
    const statusMap: Record<string, string> = {
      order_approved: 'paid',
      subscription_renewed: 'paid',
      order_refunded: 'refunded',
      subscription_canceled: 'canceled',
    };
    const result = processKiwifyEvent(
      {
        order_id: `TEST-${Date.now().toString(36).toUpperCase()}`,
        order_status: statusMap[event] ?? 'paid',
        webhook_event_type: event,
        Customer: { email, full_name: name },
        Product: { product_name: 'CongelaFit Premium' },
      },
      true,
      'Simulação manual pelo Admin.',
    );
    res.status(result.statusCode).json({ ok: result.ok, message: result.message });
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

  app.post('/api/admin/members', requireAdmin, (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanText(req.body?.name, 120) || 'Membro CongelaFit';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (password && password.length < 6) {
      res.status(400).json({ error: 'A senha inicial precisa ter pelo menos 6 caracteres (ou deixe em branco para primeiro acesso).' });
      return;
    }
    const db = loadDb();
    if (db.users.some((u) => u.email === email)) {
      res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      return;
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
      kiwifyProduct: 'Liberação manual Admin',
      loginCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(created);
    saveDb(db);
    res.status(201).json({ member: { ...publicUser(created), needsPasswordSetup: created.needsPasswordSetup } });
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
    if (typeof req.body?.status === 'string' && ['active', 'pending', 'refunded', 'canceled'].includes(req.body.status)) {
      target.status = req.body.status as MemberStatus;
    }
    if (req.body?.resetPassword === true) {
      target.passwordHash = '';
      target.passwordSalt = '';
      target.needsPasswordSetup = true;
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
