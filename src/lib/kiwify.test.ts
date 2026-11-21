import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyKiwifyEvent,
  authorizeKiwifyRequest,
  brasiliaToIso,
  isAccessValid,
  kiwifySignature,
  normalizeKiwifyPayload,
} from '../../server/kiwify.ts';
import type { Database, StoredUser } from '../../server/types.ts';

const NOW = Date.parse('2026-11-21T15:00:00.000Z');
const OPTS = { authorized: true, authReason: 'ok', nowMs: NOW, accessDays: 365 };

function emptyDb(): Database {
  return {
    users: [],
    settings: {
      kiwifyWebhookToken: 'segredo-da-url',
      kiwifyCheckoutUrl: '',
      kiwifyAffiliateInviteUrl: '',
      updatedAt: '',
    },
    recipeImages: {},
    affiliateProducts: [],
    webhookLogs: [],
    processedEvents: {},
    analytics: { totalLogins: 0, recipeViews: {}, whatsappReferralShares: 0, daily: {} },
  };
}

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    order_id: 'ord-1',
    order_status: 'paid',
    webhook_event_type: 'order_approved',
    approved_date: '2026-11-21 12:00',
    Product: { product_id: 'prod-app', product_name: 'APP CONGELA FIT' },
    Customer: { full_name: 'Maria Teste', email: 'Maria@Teste.com', mobile: '+5561999990000' },
    Commissions: { charge_amount: 6990 },
    ...over,
  };
}

function member(db: Database): StoredUser {
  const u = db.users.find((x) => x.email === 'maria@teste.com');
  if (!u) throw new Error('membro não criado');
  return u;
}

describe('assinatura HMAC da Kiwify', () => {
  it('bate com o vetor de teste oficial da documentação', () => {
    const body =
      '{"order_id":"9b1c2d3e-0000-4000-8000-000000000001","order_status":"paid","webhook_event_type":"order_approved"}';
    expect(kiwifySignature(body, 'kiwify-token-de-teste')).toBe('bf18f352a4f981b91dfa3f6d8742a81080ab8c86');
  });

  const body = Buffer.from('{"a":1}');
  const signing = 'token-da-kiwify';
  const good = kiwifySignature(body, signing);

  it('aceita assinatura válida', () => {
    const r = authorizeKiwifyRequest({ rawBody: body, signature: good, urlToken: '', expectedUrlToken: 'u', signingToken: signing });
    expect(r.authorized).toBe(true);
  });

  it('recusa assinatura inválida mesmo com o token da URL certo', () => {
    const r = authorizeKiwifyRequest({ rawBody: body, signature: 'deadbeef', urlToken: 'u', expectedUrlToken: 'u', signingToken: signing });
    expect(r.authorized).toBe(false);
  });

  it('aceita só o token da URL quando não há assinatura (teste manual)', () => {
    const r = authorizeKiwifyRequest({ rawBody: body, signature: '', urlToken: 'u', expectedUrlToken: 'u', signingToken: signing });
    expect(r.authorized).toBe(true);
  });

  it('sem token de assinatura configurado, segue valendo o token da URL (como antes)', () => {
    const r = authorizeKiwifyRequest({ rawBody: body, signature: good, urlToken: 'u', expectedUrlToken: 'u' });
    expect(r.authorized).toBe(true);
  });

  it('recusa quando não há credencial ou ela está errada', () => {
    expect(authorizeKiwifyRequest({ rawBody: body, signature: '', urlToken: '', expectedUrlToken: 'u' }).authorized).toBe(false);
    expect(authorizeKiwifyRequest({ rawBody: body, signature: '', urlToken: 'x', expectedUrlToken: 'u' }).authorized).toBe(false);
  });
});

describe('normalização do payload', () => {
  it('lê cliente, produto, valor e converte a data de Brasília para UTC', () => {
    const ev = normalizeKiwifyPayload(payload());
    expect(ev.kind).toBe('approved');
    expect(ev.email).toBe('maria@teste.com');
    expect(ev.productId).toBe('prod-app');
    expect(ev.amountCents).toBe(6990);
    expect(ev.approvedAt).toBe('2026-11-21T15:00:00.000Z');
    expect(ev.dedupeKey).toBe('ord-1:order_approved');
  });

  it('o tipo do evento manda: cancelamento com order_status "paid" continua sendo cancelamento', () => {
    const ev = normalizeKiwifyPayload(payload({ webhook_event_type: 'subscription_canceled' }));
    expect(ev.kind).toBe('canceled');
  });

  it('usa order_status só quando o tipo do evento não veio', () => {
    const ev = normalizeKiwifyPayload(payload({ webhook_event_type: undefined, order_status: 'refunded' }));
    expect(ev.kind).toBe('refunded');
  });

  it('aceita payload embrulhado em "data" e nomes em português', () => {
    const ev = normalizeKiwifyPayload({ data: payload({ webhook_event_type: 'compra_reembolsada' }) });
    expect(ev.kind).toBe('refunded');
  });

  it('brasiliaToIso devolve undefined para lixo', () => {
    expect(brasiliaToIso('')).toBeUndefined();
    expect(brasiliaToIso('não é data')).toBeUndefined();
  });
});

describe('compra aprovada', () => {
  it('cria o membro ativo com 365 dias de acesso a partir da aprovação', () => {
    const db = emptyDb();
    const r = applyKiwifyEvent(db, payload(), OPTS);
    expect(r.statusCode).toBe(200);
    const u = member(db);
    expect(u.status).toBe('active');
    expect(u.needsPasswordSetup).toBe(true);
    expect(u.accessUntil).toBe(addDays('2026-11-21T15:00:00.000Z', 365));
    expect(u.kiwifyOrderId).toBe('ord-1');
    expect(isAccessValid(u, NOW)).toBe(true);
  });

  it('renovação antecipada soma ao que sobra do acesso', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    const firstEnd = member(db).accessUntil!;
    applyKiwifyEvent(db, payload({ order_id: 'ord-2', approved_date: '2026-12-01 10:00' }), OPTS);
    expect(member(db).accessUntil).toBe(addDays(firstEnd, 365));
  });

  it('recompra depois de vencido conta a partir da nova aprovação', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    const later = Date.parse('2028-01-10T12:00:00.000Z');
    applyKiwifyEvent(db, payload({ order_id: 'ord-3', approved_date: '2028-01-10 09:00' }), { ...OPTS, nowMs: later });
    const u = member(db);
    expect(u.status).toBe('active');
    expect(u.accessUntil).toBe(addDays('2028-01-10T12:00:00.000Z', 365));
  });

  it('com assinatura, vale o fim do período informado pela Kiwify', () => {
    const db = emptyDb();
    applyKiwifyEvent(
      db,
      payload({
        webhook_event_type: 'subscription_renewed',
        Subscription: { customer_access: { has_access: true, access_until: '2027-05-01T00:00:00.000Z' } },
      }),
      OPTS,
    );
    expect(member(db).accessUntil).toBe('2027-05-01T00:00:00.000Z');
  });
});

describe('duplicidade (idempotência)', () => {
  it('o mesmo evento repetido não muda nada nem estende o acesso de novo', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    const before = JSON.stringify(db.users);
    const again = applyKiwifyEvent(db, payload(), { ...OPTS, nowMs: NOW + 60_000 });
    expect(again.duplicate).toBe(true);
    expect(db.users).toHaveLength(1);
    expect(JSON.stringify(db.users)).toBe(before);
  });

  it('eventos diferentes do mesmo pedido são processados', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    const r = applyKiwifyEvent(db, payload({ webhook_event_type: 'order_refunded', order_status: 'refunded' }), OPTS);
    expect(r.duplicate).toBeUndefined();
    expect(member(db).status).toBe('refunded');
  });
});

describe('cancelamento, reembolso e chargeback', () => {
  it('cancelamento comum NÃO reativa nem derruba: acesso segue até o fim do período pago', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    const end = member(db).accessUntil;
    applyKiwifyEvent(db, payload({ webhook_event_type: 'subscription_canceled', order_id: 'ord-1' }), OPTS);
    const u = member(db);
    expect(u.status).toBe('active');
    expect(u.accessUntil).toBe(end);
    expect(isAccessValid(u, NOW)).toBe(true);
  });

  it('cancelamento de quem estava refundado não reativa o acesso (regressão do bug antigo)', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    applyKiwifyEvent(db, payload({ webhook_event_type: 'order_refunded', order_status: 'refunded' }), OPTS);
    applyKiwifyEvent(db, payload({ webhook_event_type: 'subscription_canceled' }), OPTS);
    expect(member(db).status).toBe('refunded');
    expect(isAccessValid(member(db), NOW)).toBe(false);
  });

  it('cancelamento com has_access=false (reembolso) remove o acesso', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    applyKiwifyEvent(
      db,
      payload({
        webhook_event_type: 'subscription_canceled',
        Subscription: { customer_access: { has_access: false, access_until: '2026-11-22T00:00:00.000Z' } },
      }),
      OPTS,
    );
    expect(isAccessValid(member(db), NOW + 2 * 86_400_000)).toBe(false);
  });

  it('reembolso remove o acesso na hora e preserva o cadastro', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    applyKiwifyEvent(db, payload({ webhook_event_type: 'order_refunded', order_status: 'refunded' }), OPTS);
    const u = member(db);
    expect(u.status).toBe('refunded');
    expect(isAccessValid(u, NOW + 1000)).toBe(false);
    expect(db.users).toHaveLength(1);
  });

  it('chargeback remove o acesso', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    applyKiwifyEvent(db, payload({ webhook_event_type: 'chargeback', order_status: 'chargedback' }), OPTS);
    expect(member(db).status).toBe('refunded');
  });
});

describe('pagamento recusado e pendente', () => {
  it('recusado não libera acesso nem cria membro', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload({ webhook_event_type: 'order_rejected', order_status: 'refused' }), OPTS);
    expect(db.users).toHaveLength(0);
  });

  it('recusado de renovação não derruba quem já pagou', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload(), OPTS);
    applyKiwifyEvent(db, payload({ order_id: 'ord-9', webhook_event_type: 'subscription_late', order_status: 'refused' }), OPTS);
    applyKiwifyEvent(db, payload({ order_id: 'ord-9', webhook_event_type: 'order_rejected', order_status: 'refused' }), OPTS);
    expect(member(db).status).toBe('active');
  });

  it('Pix gerado cria membro pendente (sem acesso) e não rebaixa quem já é ativo', () => {
    const db = emptyDb();
    applyKiwifyEvent(db, payload({ webhook_event_type: 'pix_created', order_status: 'waiting_payment' }), OPTS);
    expect(member(db).status).toBe('pending');
    expect(isAccessValid(member(db), NOW)).toBe(false);
    applyKiwifyEvent(db, payload({ order_id: 'ord-5' }), OPTS);
    applyKiwifyEvent(db, payload({ order_id: 'ord-6', webhook_event_type: 'pix_created', order_status: 'waiting_payment' }), OPTS);
    expect(member(db).status).toBe('active');
  });
});

describe('proteções', () => {
  it('não processa nada quando a chamada não está autorizada', () => {
    const db = emptyDb();
    const r = applyKiwifyEvent(db, payload(), { ...OPTS, authorized: false, authReason: 'Token inválido' });
    expect(r.statusCode).toBe(401);
    expect(db.users).toHaveLength(0);
    expect(db.webhookLogs[0].accepted).toBe(false);
  });

  it('recusa evento sem e-mail', () => {
    const db = emptyDb();
    const r = applyKiwifyEvent(db, payload({ Customer: {} }), OPTS);
    expect(r.statusCode).toBe(400);
  });

  it('ignora produtos que não liberam o app quando há lista configurada', () => {
    const db = emptyDb();
    const r = applyKiwifyEvent(db, payload({ Product: { product_id: 'outro', product_name: 'Guia X' } }), { ...OPTS, productIds: ['prod-app'] });
    expect(r.statusCode).toBe(200);
    expect(db.users).toHaveLength(0);
  });

  it('nunca altera o administrador', () => {
    const db = emptyDb();
    db.users.push({
      id: 'admin-1', email: 'maria@teste.com', name: 'Admin', passwordHash: 'x', passwordSalt: 'y', role: 'admin',
      status: 'active', needsPasswordSetup: false, loginCount: 0, createdAt: '', updatedAt: '',
    });
    applyKiwifyEvent(db, payload({ webhook_event_type: 'order_refunded', order_status: 'refunded' }), OPTS);
    expect(db.users[0].status).toBe('active');
    expect(isAccessValid(db.users[0], NOW + 1e12)).toBe(true);
  });

  it('conta antiga sem prazo continua com acesso; com prazo vencido perde', () => {
    const base = { role: 'member' as const, status: 'active' as const };
    expect(isAccessValid({ ...base, accessUntil: undefined }, NOW)).toBe(true);
    expect(isAccessValid({ ...base, accessUntil: '2026-01-01T00:00:00.000Z' }, NOW)).toBe(false);
  });
});
