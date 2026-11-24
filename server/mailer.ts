import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { decryptSecret } from './auth.ts';
import type { AppSettings, EmailLog } from './types.ts';

export interface ResolvedEmailConfig {
  provider: 'smtp' | 'resend' | 'outbox';
  fromName: string;
  fromAddress: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  resendApiKey: string;
  envConfigured: boolean;
}

export function resolveEmailConfig(settings: AppSettings, secret: string): ResolvedEmailConfig {
  const envSmtpHost = (process.env.SMTP_HOST || '').trim();
  const envSmtpPort = Number(process.env.SMTP_PORT || 0);
  const envSmtpSecure = process.env.SMTP_SECURE === 'true';
  const envSmtpUser = (process.env.SMTP_USER || '').trim();
  const envSmtpPass = process.env.SMTP_PASS || '';
  const envFrom = (process.env.SMTP_FROM || '').trim();
  const envResendKey = (process.env.RESEND_API_KEY || '').trim();

  const smtpHost = envSmtpHost || (settings.smtpHost || '').trim();
  const smtpPort = envSmtpPort || Number(settings.smtpPort || 587);
  const smtpSecure = envSmtpHost ? envSmtpSecure : Boolean(settings.smtpSecure);
  const smtpUser = envSmtpUser || (settings.smtpUser || '').trim();
  const smtpPass = envSmtpPass || decryptSecret(settings.smtpPassEnc, secret);
  const resendApiKey = envResendKey || decryptSecret(settings.resendApiKeyEnc, secret);

  const fromName = (settings.emailFromName || 'CongelaFit Premium').trim();
  const fromAddress = envFrom || (settings.emailFromAddress || '').trim() || smtpUser || 'no-reply@congelafit.com.br';

  const hasSmtp = Boolean(smtpHost && smtpUser && smtpPass);
  const hasResend = Boolean(resendApiKey && fromAddress);

  const requested = settings.emailProvider || 'auto';
  let provider: 'smtp' | 'resend' | 'outbox' = 'outbox';
  if (requested === 'smtp' && hasSmtp) provider = 'smtp';
  else if (requested === 'resend' && hasResend) provider = 'resend';
  else if (requested === 'auto') {
    if (hasResend) provider = 'resend';
    else if (hasSmtp) provider = 'smtp';
  }

  return {
    provider,
    fromName,
    fromAddress,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    resendApiKey,
    envConfigured: Boolean((envSmtpHost && envSmtpUser && envSmtpPass) || envResendKey),
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    /* fallback */
  }
  return 'https://www.congelafit.com.br';
}

export interface EmailSendResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'outbox';
  provider: 'smtp' | 'resend' | 'outbox';
  error?: string;
  log: EmailLog;
}

export async function dispatchEmail(opts: {
  settings: AppSettings;
  secret: string;
  to: string;
  name: string;
  type: EmailLog['type'];
  subject: string;
  html: string;
  text: string;
}): Promise<EmailSendResult> {
  const cfg = resolveEmailConfig(opts.settings, opts.secret);
  const now = new Date().toISOString();
  const fromHeader = opts.settings.emailFromName
    ? `"${opts.settings.emailFromName.replace(/"/g, '')}" <${cfg.fromAddress}>`
    : `"${cfg.fromName.replace(/"/g, '')}" <${cfg.fromAddress}>`;

  if (cfg.provider === 'outbox') {
    const log: EmailLog = {
      id: crypto.randomUUID(),
      sentAt: now,
      to: opts.to,
      name: opts.name,
      type: opts.type,
      subject: opts.subject,
      provider: 'outbox',
      status: 'outbox',
      error: 'Provedor SMTP/Resend ainda não configurado. Acesso gerado e pronto para envio.',
    };
    return { ok: true, status: 'outbox', provider: 'outbox', error: log.error, log };
  }

  if (cfg.provider === 'resend') {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Resend HTTP ${resp.status}: ${body.slice(0, 180)}`);
      }
      const log: EmailLog = {
        id: crypto.randomUUID(),
        sentAt: now,
        to: opts.to,
        name: opts.name,
        type: opts.type,
        subject: opts.subject,
        provider: 'resend',
        status: 'sent',
      };
      return { ok: true, status: 'sent', provider: 'resend', log };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar via Resend.';
      const log: EmailLog = {
        id: crypto.randomUUID(),
        sentAt: now,
        to: opts.to,
        name: opts.name,
        type: opts.type,
        subject: opts.subject,
        provider: 'resend',
        status: 'failed',
        error: msg,
      };
      return { ok: false, status: 'failed', provider: 'resend', error: msg, log };
    }
  }

  // SMTP via nodemailer
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure || cfg.smtpPort === 465,
      auth: {
        user: cfg.smtpUser,
        pass: cfg.smtpPass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    await transporter.sendMail({
      from: fromHeader,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });

    const log: EmailLog = {
      id: crypto.randomUUID(),
      sentAt: now,
      to: opts.to,
      name: opts.name,
      type: opts.type,
      subject: opts.subject,
      provider: 'smtp',
      status: 'sent',
    };
    return { ok: true, status: 'sent', provider: 'smtp', log };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao enviar via SMTP.';
    const log: EmailLog = {
      id: crypto.randomUUID(),
      sentAt: now,
      to: opts.to,
      name: opts.name,
      type: opts.type,
      subject: opts.subject,
      provider: 'smtp',
      status: 'failed',
      error: msg,
    };
    return { ok: false, status: 'failed', provider: 'smtp', error: msg, log };
  }
}

function wrapEmailLayout(title: string, bodyHtml: string, siteUrl = 'https://www.congelafit.com.br'): string {
  const safeSite = safeHref(siteUrl);
  const hostLabel = safeSite.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f7f4;font-family:Arial,Helvetica,sans-serif;color:#1b281c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dde6dd;">
    <tr>
      <td style="background:#196c3b;padding:22px 28px;color:#ffffff;">
        <div style="font-size:19px;font-weight:700;letter-spacing:0.3px;">CONGELAFIT PREMIUM</div>
        <div style="font-size:12px;opacity:0.9;margin-top:4px;">Área de Membros · Marmitas Congeladas</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;font-size:15px;line-height:1.6;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:#f8faf8;border-top:1px solid #e6ede6;font-size:12px;color:#5a6b5b;">
        CongelaFit Premium · <a href="${safeSite}" style="color:#196c3b;">${escapeHtml(hostLabel)}</a>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendCredentialsEmail(opts: {
  settings: AppSettings;
  secret: string;
  to: string;
  name: string;
  password: string;
  loginUrl: string;
  productName?: string;
  isReset?: boolean;
}): Promise<EmailSendResult> {
  const safeName = escapeHtml(opts.name || 'Aluno(a)');
  const safeEmail = escapeHtml(opts.to);
  const safePass = escapeHtml(opts.password);
  const safeProduct = escapeHtml(opts.productName || 'CongelaFit Premium');
  const href = safeHref(opts.loginUrl);

  const subject = opts.isReset
    ? 'CongelaFit Premium — Sua nova senha de acesso'
    : 'Bem-vindo(a) ao CongelaFit Premium! Seu acesso chegou';

  const intro = opts.isReset
    ? `<p>Olá, <b>${safeName}</b>! Conforme solicitado, geramos uma nova senha temporária para você acessar o <b>${safeProduct}</b>.</p>`
    : `<p>Olá, <b>${safeName}</b>! Seu pagamento foi confirmado na Kiwify e seu acesso ao <b>${safeProduct}</b> já está liberado.</p>`;

  const html = wrapEmailLayout(
    subject,
    `${intro}
     <div style="background:#f3f8f4;border:1px solid #cce0d1;border-radius:12px;padding:16px 18px;margin:18px 0;">
       <div style="font-size:13px;color:#4a614d;margin-bottom:6px;">Seus dados de entrada:</div>
       <div style="margin-bottom:6px;"><b>E-mail:</b> ${safeEmail}</div>
       <div><b>Senha temporária:</b> <code style="background:#ffffff;padding:3px 8px;border-radius:6px;border:1px solid #cfe0d2;font-size:15px;">${safePass}</code></div>
     </div>
     <p style="margin:22px 0;">
       <a href="${href}" style="display:inline-block;background:#196c3b;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;">Acessar Área de Membros</a>
     </p>
     <p style="font-size:13px;color:#5a6b5b;">Dica de segurança: após entrar, você pode trocar esta senha a qualquer momento em <b>Mais → Alterar senha</b>.</p>`,
    opts.settings.officialSiteUrl || 'https://www.congelafit.com.br',
  );

  const text = `${opts.isReset ? 'Sua nova senha do CongelaFit Premium' : 'Bem-vindo(a) ao CongelaFit Premium!'}

Olá, ${opts.name || 'Aluno(a)'}!
Acesse: ${href}
E-mail: ${opts.to}
Senha temporária: ${opts.password}

Após entrar, recomendamos alterar sua senha em Mais -> Alterar senha.`;

  return dispatchEmail({
    settings: opts.settings,
    secret: opts.secret,
    to: opts.to,
    name: opts.name,
    type: opts.isReset ? 'reset' : 'welcome',
    subject,
    html,
    text,
  });
}

export async function sendReactivatedEmail(opts: {
  settings: AppSettings;
  secret: string;
  to: string;
  name: string;
  loginUrl: string;
}): Promise<EmailSendResult> {
  const safeName = escapeHtml(opts.name || 'Aluno(a)');
  const href = safeHref(opts.loginUrl);
  const subject = 'CongelaFit Premium — Seu acesso foi reativado!';
  const html = wrapEmailLayout(
    subject,
    `<p>Olá, <b>${safeName}</b>! Recebemos a confirmação do seu pagamento na Kiwify e seu acesso ao <b>CongelaFit Premium</b> está ativo novamente.</p>
     <p>Você pode entrar normalmente com seu e-mail (<b>${escapeHtml(opts.to)}</b>) e sua senha já cadastrada.</p>
     <p style="margin:22px 0;">
       <a href="${href}" style="display:inline-block;background:#196c3b;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;">Entrar no CongelaFit</a>
     </p>`,
    opts.settings.officialSiteUrl || 'https://www.congelafit.com.br',
  );
  const text = `Olá, ${opts.name || 'Aluno(a)'}! Seu acesso ao CongelaFit Premium foi reativado. Entre em ${href} usando seu e-mail (${opts.to}) e sua senha.`;
  return dispatchEmail({
    settings: opts.settings,
    secret: opts.secret,
    to: opts.to,
    name: opts.name,
    type: 'reactivated',
    subject,
    html,
    text,
  });
}

export async function sendSuspendedEmail(opts: {
  settings: AppSettings;
  secret: string;
  to: string;
  name: string;
  reason: string;
  checkoutUrl: string;
}): Promise<EmailSendResult> {
  const safeName = escapeHtml(opts.name || 'Aluno(a)');
  const safeReason = escapeHtml(opts.reason);
  const href = safeHref(opts.checkoutUrl || opts.settings.officialSiteUrl || 'https://www.congelafit.com.br');
  const subject = 'CongelaFit Premium — Aviso de suspensão de acesso';
  const html = wrapEmailLayout(
    subject,
    `<p>Olá, <b>${safeName}</b>.</p>
     <p>Informamos que seu acesso à área de membros do <b>CongelaFit Premium</b> foi temporariamente suspenso.</p>
     <p><b>Motivo:</b> ${safeReason}</p>
     <p>Assim que o pagamento for regularizado na Kiwify, seu acesso é liberado novamente de forma automática.</p>
     <p style="margin:22px 0;">
       <a href="${href}" style="display:inline-block;background:#196c3b;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;">Regularizar ou ver planos</a>
     </p>`,
    opts.settings.officialSiteUrl || 'https://www.congelafit.com.br',
  );
  const text = `Olá, ${opts.name || 'Aluno(a)'}. Seu acesso ao CongelaFit Premium foi suspenso (${opts.reason}). Regularize pela Kiwify ou acesse ${href}.`;
  return dispatchEmail({
    settings: opts.settings,
    secret: opts.secret,
    to: opts.to,
    name: opts.name,
    type: 'suspended',
    subject,
    html,
    text,
  });
}
