import crypto from 'node:crypto';
import type { Database, MemberStatus, StoredUser, WebhookLog } from './types.ts';

/**
 * Regras do webhook da Kiwify, sem dependência do Express (testável).
 *
 * Pontos importantes da documentação oficial (docs.kiwify.com.br, "Receiving webhooks"):
 * - A Kiwify NÃO envia o token. Ela acrescenta `?signature=<hex>` = HMAC-SHA1(corpo cru, token do webhook).
 * - Em eventos `subscription_*`, `order_status` é o do pedido mais recente (ex.: "paid" num cancelamento).
 *   Por isso o TIPO DO EVENTO manda; `order_status` só é usado quando o tipo do evento não vem.
 * - O mesmo evento pode chegar mais de uma vez: deduplicar por `order_id` + `webhook_event_type`.
 * - Reembolso/chargeback cancelam a assinatura; no chargeback `customer_access` NÃO é zerado,
 *   então o acesso é removido pelo evento `chargeback`.
 */

export const DEFAULT_ACCESS_DAYS = 365;
const MAX_PROCESSED_EVENTS = 5000;
const MAX_LOGS = 200;

export type KiwifyKind =
  | 'approved'
  | 'renewed'
  | 'refunded'
  | 'chargeback'
  | 'canceled'
  | 'late'
  | 'rejected'
  | 'pending'
  | 'trial'
  | 'unknown';

export interface NormalizedKiwifyEvent {
  /** Chave de deduplicação: `<order_id ou subscription_id>:<evento>`. Vazia se não houver id. */
  dedupeKey: string;
  event: string;
  kind: KiwifyKind;
  orderStatus: string;
  orderId: string;
  subscriptionId: string;
  productId: string;
  productName: string;
  email: string;
  name: string;
  phone: string;
  /** Valor pago em centavos, quando informado. */
  amountCents?: number;
  /** Data de aprovação em ISO UTC (a Kiwify envia em horário de Brasília). */
  approvedAt?: string;
  /** `Subscription.customer_access.access_until`, em ISO UTC, quando existir. */
  accessUntil?: string;
  /** `Subscription.customer_access.has_access`, quando existir. */
  hasAccess?: boolean;
}

const EVENT_KIND: Record<string, KiwifyKind> = {
  order_approved: 'approved',
  order_paid: 'approved',
  compra_aprovada: 'approved',
  subscription_renewed: 'renewed',
  assinatura_renovada: 'renewed',
  order_refunded: 'refunded',
  compra_reembolsada: 'refunded',
  chargeback: 'chargeback',
  order_chargedback: 'chargeback',
  subscription_canceled: 'canceled',
  assinatura_cancelada: 'canceled',
  subscription_late: 'late',
  assinatura_atrasada: 'late',
  order_rejected: 'rejected',
  compra_recusada: 'rejected',
  billet_created: 'pending',
  pix_created: 'pending',
  boleto_gerado: 'pending',
  pix_gerado: 'pending',
  subscription_trial_started: 'trial',
  subscription_trial_canceled: 'trial',
};

const STATUS_KIND: Record<string, KiwifyKind> = {
  paid: 'approved',
  approved: 'approved',
  refunded: 'refunded',
  chargedback: 'chargeback',
  refused: 'rejected',
  waiting_payment: 'pending',
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, max = 300): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '';
}

/** "YYYY-MM-DD HH:mm" em horário de Brasília (UTC-3, sem horário de verão desde 2019) → ISO UTC. */
export function brasiliaToIso(value: unknown): string | undefined {
  const s = str(value, 40);
  if (!s) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}:${m[3] ?? '00'}-03:00`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function isoOrUndefined(value: unknown): string | undefined {
  const s = str(value, 40);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function normalizeKiwifyPayload(rawPayload: Record<string, unknown>): NormalizedKiwifyEvent {
  // Alguns envios chegam embrulhados em `data`.
  const payload =
    rawPayload.data && typeof rawPayload.data === 'object' && !Array.isArray(rawPayload.data)
      ? { ...rawPayload, ...asRecord(rawPayload.data) }
      : rawPayload;

  const customer = asRecord(payload.Customer ?? payload.customer);
  const product = asRecord(payload.Product ?? payload.product);
  const subscription = asRecord(payload.Subscription ?? payload.subscription);
  const commissions = asRecord(payload.Commissions ?? payload.commissions);
  const access = asRecord(subscription.customer_access);

  const orderStatus = str(payload.order_status, 40).toLowerCase();
  const event = str(payload.webhook_event_type ?? payload.event, 60).toLowerCase();
  const orderId = str(payload.order_id ?? payload.order_ref, 80);
  const subscriptionId = str(payload.subscription_id ?? subscription.id, 80);

  // O tipo do evento manda. `order_status` só vale quando o tipo não veio.
  let kind: KiwifyKind = EVENT_KIND[event] ?? 'unknown';
  if (kind === 'unknown' && !event) kind = STATUS_KIND[orderStatus] ?? 'unknown';

  const idForKey = orderId || subscriptionId;
  const chargeAmount = Number(commissions.charge_amount);

  return {
    dedupeKey: idForKey && event ? `${idForKey}:${event}` : '',
    event: event || (kind === 'unknown' ? 'unknown' : kind),
    kind,
    orderStatus,
    orderId,
    subscriptionId,
    productId: str(product.product_id ?? payload.product_id, 80),
    productName: str(product.product_name ?? payload.product_name, 120),
    email: str(customer.email ?? payload.email, 200).toLowerCase(),
    name: str(customer.full_name ?? customer.first_name ?? customer.name ?? payload.name, 120),
    phone: str(customer.mobile ?? customer.phone, 40),
    amountCents: Number.isFinite(chargeAmount) && chargeAmount > 0 ? Math.round(chargeAmount) : undefined,
    approvedAt: brasiliaToIso(payload.approved_date),
    accessUntil: isoOrUndefined(access.access_until),
    hasAccess: typeof access.has_access === 'boolean' ? access.has_access : undefined,
  };
}

/** O membro pode usar o app agora? Admin sempre pode. Sem `accessUntil` (contas antigas) = sem prazo. */
export function isAccessValid(user: Pick<StoredUser, 'role' | 'status' | 'accessUntil'>, nowMs = Date.now()): boolean {
  if (user.role === 'admin') return true;
  if (user.status !== 'active') return false;
  if (!user.accessUntil) return true;
  const until = Date.parse(user.accessUntil);
  return Number.isNaN(until) ? true : until > nowMs;
}

export interface AccessDecision {
  /** Novo status, ou undefined para não mexer. */
  status?: MemberStatus;
  /** Novo fim do acesso (ISO), `null` para limpar, undefined para não mexer. */
  accessUntil?: string | null;
  /** Criar o membro se ele ainda não existir. */
  createIfMissing: boolean;
  note: string;
}

export function addDays(baseIso: string | number, days: number): string {
  const base = typeof baseIso === 'number' ? baseIso : Date.parse(baseIso);
  return new Date(base + days * 86_400_000).toISOString();
}

export function decideAccess(
  ev: NormalizedKiwifyEvent,
  user: StoredUser | undefined,
  nowMs: number,
  accessDays: number,
): AccessDecision {
  switch (ev.kind) {
    case 'approved':
    case 'renewed': {
      // Se a Kiwify informa o fim do período (assinatura), vale esse valor.
      if (ev.accessUntil) {
        return { status: 'active', accessUntil: ev.accessUntil, createIfMissing: true, note: 'Acesso liberado até o fim do período informado pela Kiwify.' };
      }
      // Compra única com "N dias de acesso": conta a partir da aprovação; renovação antecipada soma ao que sobra.
      const approved = ev.approvedAt ? Date.parse(ev.approvedAt) : nowMs;
      const currentUntil = user?.accessUntil ? Date.parse(user.accessUntil) : NaN;
      const base = !Number.isNaN(currentUntil) && currentUntil > approved ? currentUntil : approved;
      return { status: 'active', accessUntil: addDays(base, accessDays), createIfMissing: true, note: `Acesso liberado por ${accessDays} dias.` };
    }
    case 'refunded':
    case 'chargeback':
      return {
        status: 'refunded',
        accessUntil: new Date(nowMs).toISOString(),
        createIfMissing: false,
        note: ev.kind === 'chargeback' ? 'Chargeback: acesso removido.' : 'Reembolso: acesso removido.',
      };
    case 'canceled': {
      // Cancelamento comum: o cliente já pagou o período e mantém o acesso até o fim dele.
      // Reembolso (has_access=false) é tratado como perda de acesso na data informada.
      if (ev.hasAccess === false) {
        return { status: 'refunded', accessUntil: ev.accessUntil ?? new Date(nowMs).toISOString(), createIfMissing: false, note: 'Assinatura cancelada sem acesso: acesso removido.' };
      }
      if (ev.accessUntil) {
        return { accessUntil: ev.accessUntil, createIfMissing: false, note: 'Cancelamento registrado; acesso segue até o fim do período pago.' };
      }
      return { createIfMissing: false, note: 'Cancelamento registrado; acesso segue até o fim do período pago.' };
    }
    case 'late':
    case 'rejected':
      return { createIfMissing: false, note: 'Pagamento recusado: acesso existente não é alterado e nenhum acesso novo é liberado.' };
    case 'pending':
      // Cria o membro como pendente só se ainda não existir; nunca rebaixa quem já tem acesso.
      return user
        ? { createIfMissing: false, note: 'Pagamento pendente; membro já existente não é alterado.' }
        : { status: 'pending', createIfMissing: true, note: 'Pagamento pendente (Pix/boleto gerado).' };
    default:
      return { createIfMissing: false, note: `Evento sem efeito no acesso (${ev.event || 'sem tipo'}).` };
  }
}

export interface ApplyOptions {
  nowMs?: number;
  accessDays?: number;
  /** IDs de produto (Kiwify) que dão acesso ao app. Vazio = qualquer produto que chegue neste webhook. */
  productIds?: string[];
  /** Resultado da checagem de autenticação feita pelo chamador. */
  authorized: boolean;
  authReason: string;
}

export interface ApplyResult {
  ok: boolean;
  statusCode: number;
  message: string;
  duplicate?: boolean;
}

function pushLog(db: Database, log: WebhookLog): void {
  db.webhookLogs = [log, ...db.webhookLogs].slice(0, MAX_LOGS);
}

/** Aplica um evento da Kiwify ao banco (em memória). Quem chama é responsável por salvar. */
export function applyKiwifyEvent(db: Database, rawPayload: Record<string, unknown>, opts: ApplyOptions): ApplyResult {
  const nowMs = opts.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const accessDays = opts.accessDays ?? DEFAULT_ACCESS_DAYS;
  const ev = normalizeKiwifyPayload(rawPayload);

  const log: WebhookLog = {
    id: crypto.randomUUID(),
    receivedAt: nowIso,
    event: ev.event || 'unknown',
    orderId: ev.orderId || '—',
    email: ev.email || '—',
    status: ev.orderStatus || '—',
    accepted: opts.authorized,
    detail: opts.authReason,
  };

  if (!opts.authorized) {
    pushLog(db, log);
    return { ok: false, statusCode: 401, message: opts.authReason };
  }

  // Deduplicação: o mesmo evento pode chegar mais de uma vez (reenvios da Kiwify).
  if (ev.dedupeKey && db.processedEvents[ev.dedupeKey]) {
    log.detail = 'Evento repetido ignorado (já processado).';
    pushLog(db, log);
    return { ok: true, statusCode: 200, message: log.detail, duplicate: true };
  }

  if (opts.productIds && opts.productIds.length > 0 && ev.productId && !opts.productIds.includes(ev.productId)) {
    log.detail = `Produto fora da lista que libera o app (${ev.productName || ev.productId}); ignorado.`;
    pushLog(db, log);
    return { ok: true, statusCode: 200, message: log.detail };
  }

  if (!ev.email || !ev.email.includes('@')) {
    log.accepted = false;
    log.detail = 'Payload sem e-mail de cliente válido.';
    pushLog(db, log);
    return { ok: false, statusCode: 400, message: log.detail };
  }

  const existing = db.users.find((u) => u.email === ev.email);
  const decision = decideAccess(ev, existing, nowMs, accessDays);

  if (existing) {
    if (existing.role !== 'admin') {
      if (decision.status) existing.status = decision.status;
      if (decision.accessUntil !== undefined) existing.accessUntil = decision.accessUntil ?? undefined;
    }
    if (ev.name && (!existing.name || existing.name === 'Membro Kiwify')) existing.name = ev.name;
    if (ev.orderId) existing.kiwifyOrderId = ev.orderId;
    if (ev.subscriptionId) existing.kiwifySubscriptionId = ev.subscriptionId;
    if (ev.productName) existing.kiwifyProduct = ev.productName;
    existing.lastKiwifyEvent = ev.event;
    existing.updatedAt = nowIso;
    log.detail = `${decision.note} Membro atualizado (${existing.status}).`;
  } else if (decision.createIfMissing && decision.status) {
    const created: StoredUser = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      email: ev.email,
      name: ev.name || 'Membro Kiwify',
      passwordHash: '',
      passwordSalt: '',
      role: 'member',
      status: decision.status,
      accessUntil: decision.accessUntil ?? undefined,
      needsPasswordSetup: true,
      kiwifyOrderId: ev.orderId || undefined,
      kiwifySubscriptionId: ev.subscriptionId || undefined,
      kiwifyProduct: ev.productName || undefined,
      lastKiwifyEvent: ev.event,
      loginCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.users.push(created);
    log.detail = `${decision.note} Novo membro registrado (${decision.status}).`;
  } else {
    log.detail = decision.note;
  }

  if (ev.dedupeKey) {
    db.processedEvents[ev.dedupeKey] = nowIso;
    const keys = Object.keys(db.processedEvents);
    if (keys.length > MAX_PROCESSED_EVENTS) {
      keys
        .sort((a, b) => db.processedEvents[a].localeCompare(db.processedEvents[b]))
        .slice(0, keys.length - MAX_PROCESSED_EVENTS)
        .forEach((k) => delete db.processedEvents[k]);
    }
  }
  pushLog(db, log);
  return { ok: true, statusCode: 200, message: log.detail };
}

function timingMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** HMAC-SHA1 hexadecimal do corpo cru, com o token do webhook da Kiwify como chave. */
export function kiwifySignature(rawBody: Buffer | string, signingToken: string): string {
  return crypto.createHmac('sha1', signingToken).update(rawBody).digest('hex');
}

export interface AuthInput {
  rawBody: Buffer;
  /** `?signature=` enviado pela Kiwify. */
  signature: string;
  /** Segredo colocado no caminho/consulta/cabeçalho da URL do webhook. */
  urlToken: string;
  /** Segredo da URL cadastrado no app. */
  expectedUrlToken: string;
  /** Token de assinatura do webhook na Kiwify (variável de ambiente KIWIFY_SIGNING_TOKEN). Opcional. */
  signingToken?: string;
}

export function authorizeKiwifyRequest(input: AuthInput): { authorized: boolean; reason: string } {
  const { rawBody, signature, urlToken, expectedUrlToken, signingToken } = input;

  if (signingToken && signature) {
    // Com o token de assinatura configurado, uma assinatura presente TEM de bater.
    return timingMatches(signature, kiwifySignature(rawBody, signingToken))
      ? { authorized: true, reason: 'Assinatura HMAC da Kiwify válida.' }
      : { authorized: false, reason: 'Assinatura HMAC da Kiwify inválida.' };
  }
  if (timingMatches(urlToken, expectedUrlToken)) {
    return { authorized: true, reason: 'Token da URL do webhook válido.' };
  }
  if (urlToken) return { authorized: false, reason: 'Token do webhook da Kiwify inválido.' };
  return { authorized: false, reason: 'Token ou assinatura do webhook ausente.' };
}
