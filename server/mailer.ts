import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { decryptSecret } from './auth.ts';
import type { AppSettings, EmailLog } from './types.ts';

export const BRAND_COLORS = {
  ink: '#111d24',
  blue: '#0da5e8',
  blueDeep: '#0a6f9e',
  green: '#42924b',
  greenDeep: '#2e6e36',
  ice: '#f3fafd',
  ice2: '#ddf1fb',
  leaf: '#e4f1e5',
  line: '#c9e1ee',
  muted: '#3f505a',
  white: '#ffffff',
  dangerBg: '#fdecea',
  dangerBorder: '#f4c6c2',
  dangerText: '#9c2118',
} as const;

export const LOGO_CID = 'congelafit-logo';

let cachedLogoBuffer: Buffer | null | undefined;

export function loadBrandLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer !== undefined) return cachedLogoBuffer;
  const candidates = [
    path.resolve(process.cwd(), 'public/icons/logo-mark.png'),
    path.resolve(process.cwd(), 'dist/icons/logo-mark.png'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        cachedLogoBuffer = fs.readFileSync(filePath);
        return cachedLogoBuffer;
      }
    } catch {
      /* ignore and try next */
    }
  }
  cachedLogoBuffer = null;
  return null;
}

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

function safeLogoSrc(logoSrc: string | undefined, siteUrl: string): string {
  if (logoSrc === `cid:${LOGO_CID}` || logoSrc === '/icons/logo-mark.png') {
    return logoSrc;
  }
  if (logoSrc) {
    try {
      const u = new URL(logoSrc);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    } catch {
      /* fallback */
    }
  }
  const hasLocalLogo = Boolean(loadBrandLogoBuffer());
  return hasLocalLogo ? `cid:${LOGO_CID}` : `${safeHref(siteUrl).replace(/\/+$/, '')}/icons/logo-mark.png`;
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

  const logoBuffer = opts.html.includes(`cid:${LOGO_CID}`) ? loadBrandLogoBuffer() : null;

  if (cfg.provider === 'resend') {
    try {
      const payload: Record<string, unknown> = {
        from: fromHeader,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      };
      if (logoBuffer) {
        payload.attachments = [
          {
            filename: 'logo-congelafit.png',
            content: logoBuffer.toString('base64'),
            content_id: LOGO_CID,
            content_type: 'image/png',
          },
        ];
      }

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
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
      attachments: logoBuffer
        ? [
            {
              filename: 'logo-congelafit.png',
              content: logoBuffer,
              cid: LOGO_CID,
              contentType: 'image/png',
              contentDisposition: 'inline',
            },
          ]
        : undefined,
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

type BadgeTone = 'ok' | 'info' | 'warn';

function wrapEmailLayout(opts: {
  title: string;
  preheader: string;
  badgeText: string;
  badgeTone: BadgeTone;
  heading: string;
  bodyHtml: string;
  siteUrl?: string;
  logoSrc?: string;
}): string {
  const safeSite = safeHref(opts.siteUrl || 'https://www.congelafit.com.br');
  const hostLabel = safeSite.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const resolvedLogo = safeLogoSrc(opts.logoSrc, safeSite);

  const badgePalette =
    opts.badgeTone === 'warn'
      ? { bg: BRAND_COLORS.dangerBg, border: BRAND_COLORS.dangerBorder, text: BRAND_COLORS.dangerText }
      : opts.badgeTone === 'info'
        ? { bg: BRAND_COLORS.ice2, border: '#b3dff6', text: BRAND_COLORS.blueDeep }
        : { bg: BRAND_COLORS.leaf, border: '#b9d9bc', text: BRAND_COLORS.greenDeep };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND_COLORS.ice};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;color:${BRAND_COLORS.ink};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND_COLORS.ice};padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background-color:${BRAND_COLORS.white};border-radius:18px;overflow:hidden;border:1px solid ${BRAND_COLORS.line};box-shadow:0 6px 24px rgba(17,29,36,0.07);">
          <!-- Faixa superior padrão CongelaFit (azul + verde) -->
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="70%" height="5" style="background-color:${BRAND_COLORS.blue};height:5px;line-height:5px;font-size:0;">&nbsp;</td>
                  <td width="30%" height="5" style="background-color:${BRAND_COLORS.green};height:5px;line-height:5px;font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Cabeçalho com logo oficial + identidade tipográfica -->
          <tr>
            <td style="background-color:${BRAND_COLORS.white};padding:22px 28px 18px;border-bottom:1px solid ${BRAND_COLORS.line};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="64" valign="middle" style="padding-right:14px;">
                    <div style="width:60px;background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-radius:12px;padding:8px 7px;text-align:center;">
                      <img src="${escapeHtml(resolvedLogo)}" alt="CongelaFit" width="46" style="display:block;width:46px;height:auto;border:0;margin:0 auto;" />
                    </div>
                  </td>
                  <td valign="middle">
                    <div style="font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:21px;font-weight:800;letter-spacing:0.04em;line-height:1.1;">
                      <span style="color:${BRAND_COLORS.blue};">CONGELA</span><span style="color:${BRAND_COLORS.green};">FIT</span>
                      <span style="color:${BRAND_COLORS.ink};font-weight:700;margin-left:3px;">PREMIUM</span>
                    </div>
                    <div style="font-size:12px;color:${BRAND_COLORS.muted};margin-top:4px;font-weight:600;">
                      Área de Membros · Marmitas Saudáveis Congeladas
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Conteúdo principal -->
          <tr>
            <td style="padding:28px 28px 24px;font-size:15px;line-height:1.65;color:${BRAND_COLORS.ink};">
              <div style="margin-bottom:14px;">
                <span style="display:inline-block;background-color:${badgePalette.bg};color:${badgePalette.text};border:1px solid ${badgePalette.border};border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;letter-spacing:0.02em;">
                  ${escapeHtml(opts.badgeText)}
                </span>
              </div>
              <h1 style="margin:0 0 14px;font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;font-size:22px;line-height:1.25;font-weight:800;color:${BRAND_COLORS.ink};">
                ${escapeHtml(opts.heading)}
              </h1>
              ${opts.bodyHtml}
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding:18px 28px;background-color:${BRAND_COLORS.ice};border-top:1px solid ${BRAND_COLORS.line};font-size:12px;line-height:1.55;color:${BRAND_COLORS.muted};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <strong style="color:${BRAND_COLORS.ink};">CongelaFit Premium</strong> ·
                    <a href="${escapeHtml(safeSite)}" style="color:${BRAND_COLORS.greenDeep};font-weight:700;text-decoration:none;">${escapeHtml(hostLabel)}</a>
                    <div style="margin-top:4px;color:${BRAND_COLORS.muted};">
                      E-mail automático de acesso à plataforma. Em caso de dúvidas, fale com nosso suporte pelo site oficial.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildCredentialsEmail(opts: {
  to: string;
  name: string;
  password: string;
  loginUrl: string;
  officialSiteUrl?: string;
  productName?: string;
  isReset?: boolean;
  logoSrc?: string;
}): RenderedEmail {
  const safeName = escapeHtml(opts.name || 'Aluno(a)');
  const safeEmail = escapeHtml(opts.to);
  const safePass = escapeHtml(opts.password);
  const safeProduct = escapeHtml(opts.productName || 'CongelaFit Premium');
  const href = safeHref(opts.loginUrl);
  const siteUrl = opts.officialSiteUrl || 'https://www.congelafit.com.br';

  const subject = opts.isReset
    ? 'CongelaFit Premium — Sua nova senha de acesso'
    : 'Bem-vindo(a) ao CongelaFit Premium! Seu acesso chegou';

  const intro = opts.isReset
    ? `<p style="margin:0 0 16px;">Olá, <strong>${safeName}</strong>! Geramos uma nova senha temporária para você acessar o <strong>${safeProduct}</strong> com segurança.</p>`
    : `<p style="margin:0 0 16px;">Olá, <strong>${safeName}</strong>! Seu pagamento foi aprovado na Kiwify e seu acesso completo ao <strong>${safeProduct}</strong> já está liberado.</p>`;

  const bodyHtml = `${intro}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-left:4px solid ${BRAND_COLORS.green};border-radius:12px;margin:18px 0;">
      <tr>
        <td style="padding:16px 18px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND_COLORS.blueDeep};margin-bottom:10px;">
            Seus dados de entrada
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding:4px 0;font-size:14px;color:${BRAND_COLORS.muted};width:130px;"><strong>E-mail:</strong></td>
              <td style="padding:4px 0;font-size:14px;color:${BRAND_COLORS.ink};font-weight:700;">${safeEmail}</td>
            </tr>
            <tr>
              <td style="padding:8px 0 2px;font-size:14px;color:${BRAND_COLORS.muted};vertical-align:middle;"><strong>Senha:</strong></td>
              <td style="padding:8px 0 2px;">
                <span style="display:inline-block;background-color:${BRAND_COLORS.white};border:1px solid ${BRAND_COLORS.line};border-radius:8px;padding:5px 12px;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;letter-spacing:0.06em;color:${BRAND_COLORS.ink};">
                  ${safePass}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 18px;">
      <tr>
        <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
          <a href="${escapeHtml(href)}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
            Acessar Área de Membros &rarr;
          </a>
        </td>
      </tr>
    </table>

    <div style="background-color:${BRAND_COLORS.leaf};border:1px solid #c5dfc7;border-radius:12px;padding:13px 16px;margin:16px 0 14px;font-size:13px;line-height:1.55;color:${BRAND_COLORS.greenDeep};">
      <strong>Primeiros passos:</strong><br />
      1. Entre com seu e-mail e a senha acima.<br />
      2. Troque para sua senha pessoal em <strong>Mais &rarr; Alterar senha</strong>.<br />
      3. Adicione o app à tela inicial do celular para usar na cozinha.
    </div>

    <p style="margin:12px 0 0;font-size:12px;color:${BRAND_COLORS.muted};word-break:break-all;">
      Se o botão não abrir, acesse diretamente:<br />
      <a href="${escapeHtml(href)}" style="color:${BRAND_COLORS.blueDeep};text-decoration:underline;">${escapeHtml(href)}</a>
    </p>`;

  const html = wrapEmailLayout({
    title: subject,
    preheader: opts.isReset
      ? 'Sua nova senha temporária do CongelaFit Premium chegou.'
      : 'Pagamento aprovado! Veja seu e-mail e senha para entrar no CongelaFit Premium.',
    badgeText: opts.isReset ? 'Nova senha gerada' : 'Acesso liberado',
    badgeTone: opts.isReset ? 'info' : 'ok',
    heading: opts.isReset ? 'Sua nova senha de acesso' : 'Seu acesso chegou!',
    bodyHtml,
    siteUrl,
    logoSrc: opts.logoSrc,
  });

  const text = `${opts.isReset ? 'Sua nova senha do CongelaFit Premium' : 'Bem-vindo(a) ao CongelaFit Premium!'}

Olá, ${opts.name || 'Aluno(a)'}!
Acesse: ${href}
E-mail: ${opts.to}
Senha temporária: ${opts.password}

Após entrar, recomendamos alterar sua senha em Mais -> Alterar senha.`;

  return { subject, html, text };
}

export function buildReactivatedEmail(opts: {
  to: string;
  name: string;
  loginUrl: string;
  officialSiteUrl?: string;
  logoSrc?: string;
}): RenderedEmail {
  const safeName = escapeHtml(opts.name || 'Aluno(a)');
  const safeEmail = escapeHtml(opts.to);
  const href = safeHref(opts.loginUrl);
  const siteUrl = opts.officialSiteUrl || 'https://www.congelafit.com.br';
  const subject = 'CongelaFit Premium — Seu acesso foi reativado!';

  const bodyHtml = `<p style="margin:0 0 14px;">Olá, <strong>${safeName}</strong>! Recebemos a confirmação do seu pagamento na Kiwify e seu acesso ao <strong>CongelaFit Premium</strong> está ativo novamente.</p>
    <div style="background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-left:4px solid ${BRAND_COLORS.blue};border-radius:12px;padding:14px 18px;margin:16px 0;">
      <div style="font-size:13px;color:${BRAND_COLORS.muted};">Conta reativada:</div>
      <div style="font-size:15px;font-weight:700;color:${BRAND_COLORS.ink};margin-top:4px;">${safeEmail}</div>
      <div style="font-size:13px;color:${BRAND_COLORS.muted};margin-top:4px;">Use a mesma senha já cadastrada anteriormente.</div>
    </div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 14px;">
      <tr>
        <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
          <a href="${escapeHtml(href)}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
            Entrar no CongelaFit &rarr;
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:10px 0 0;font-size:12px;color:${BRAND_COLORS.muted};word-break:break-all;">
      Link direto: <a href="${escapeHtml(href)}" style="color:${BRAND_COLORS.blueDeep};">${escapeHtml(href)}</a>
    </p>`;

  const html = wrapEmailLayout({
    title: subject,
    preheader: 'Pagamento confirmado! Seu acesso ao CongelaFit Premium está ativo novamente.',
    badgeText: 'Acesso reativado',
    badgeTone: 'ok',
    heading: 'Bem-vindo(a) de volta!',
    bodyHtml,
    siteUrl,
    logoSrc: opts.logoSrc,
  });

  const text = `Olá, ${opts.name || 'Aluno(a)'}! Seu acesso ao CongelaFit Premium foi reativado. Entre em ${href} usando seu e-mail (${opts.to}) e sua senha.`;

  return { subject, html, text };
}

export function buildSuspendedEmail(opts: {
  name: string;
  reason: string;
  checkoutUrl: string;
  officialSiteUrl?: string;
  logoSrc?: string;
}): RenderedEmail {
  const safeName = escapeHtml(opts.name || 'Aluno(a)');
  const safeReason = escapeHtml(opts.reason);
  const siteUrl = opts.officialSiteUrl || 'https://www.congelafit.com.br';
  const href = safeHref(opts.checkoutUrl || siteUrl);
  const subject = 'CongelaFit Premium — Aviso de suspensão de acesso';

  const bodyHtml = `<p style="margin:0 0 14px;">Olá, <strong>${safeName}</strong>.</p>
    <p style="margin:0 0 14px;">Informamos que o seu acesso à área de membros do <strong>CongelaFit Premium</strong> foi temporariamente suspenso.</p>
    <div style="background-color:${BRAND_COLORS.dangerBg};border:1px solid ${BRAND_COLORS.dangerBorder};border-left:4px solid ${BRAND_COLORS.dangerText};border-radius:12px;padding:14px 18px;margin:16px 0;color:${BRAND_COLORS.dangerText};">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Motivo registrado</div>
      <div style="font-size:14px;font-weight:600;">${safeReason}</div>
    </div>
    <p style="margin:0 0 16px;">Assim que o pagamento for regularizado na Kiwify, seu acesso é liberado novamente de forma automática.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 10px;">
      <tr>
        <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
          <a href="${escapeHtml(href)}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
            Regularizar acesso &rarr;
          </a>
        </td>
      </tr>
    </table>`;

  const html = wrapEmailLayout({
    title: subject,
    preheader: 'Seu acesso ao CongelaFit Premium foi temporariamente suspenso.',
    badgeText: 'Acesso suspenso',
    badgeTone: 'warn',
    heading: 'Regularize sua assinatura',
    bodyHtml,
    siteUrl,
    logoSrc: opts.logoSrc,
  });

  const text = `Olá, ${opts.name || 'Aluno(a)'}. Seu acesso ao CongelaFit Premium foi suspenso (${opts.reason}). Regularize pela Kiwify ou acesse ${href}.`;

  return { subject, html, text };
}

export function buildTestEmail(opts: {
  loginUrl: string;
  officialSiteUrl?: string;
  logoSrc?: string;
}): RenderedEmail {
  const href = safeHref(opts.loginUrl);
  const siteUrl = opts.officialSiteUrl || 'https://www.congelafit.com.br';
  const subject = 'CongelaFit Premium — Teste de envio de e-mail';

  const bodyHtml = `<p style="margin:0 0 14px;">Este é um disparo de teste do sistema de e-mails do <strong>CongelaFit Premium</strong>.</p>
    <div style="background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-left:4px solid ${BRAND_COLORS.blue};border-radius:12px;padding:14px 18px;margin:16px 0;">
      <div style="font-size:13px;color:${BRAND_COLORS.muted};">URL de login configurada para os alunos:</div>
      <div style="font-size:14px;font-weight:700;margin-top:4px;word-break:break-all;">
        <a href="${escapeHtml(href)}" style="color:${BRAND_COLORS.blueDeep};">${escapeHtml(href)}</a>
      </div>
    </div>
    <p style="margin:0 0 16px;">Se você recebeu esta mensagem com a logo e as cores oficiais, o envio automático para novos compradores da Kiwify está funcionando corretamente.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 8px;">
      <tr>
        <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
          <a href="${escapeHtml(href)}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
            Abrir CongelaFit Premium &rarr;
          </a>
        </td>
      </tr>
    </table>`;

  const html = wrapEmailLayout({
    title: subject,
    preheader: 'Teste de envio com a identidade visual oficial do CongelaFit Premium.',
    badgeText: 'Configuração validada',
    badgeTone: 'info',
    heading: 'Envio de e-mail funcionando!',
    bodyHtml,
    siteUrl,
    logoSrc: opts.logoSrc,
  });

  const text = `Este é um e-mail de teste do CongelaFit Premium. Link de login configurado: ${href}`;

  return { subject, html, text };
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
  const rendered = buildCredentialsEmail({
    to: opts.to,
    name: opts.name,
    password: opts.password,
    loginUrl: opts.loginUrl,
    officialSiteUrl: opts.settings.officialSiteUrl,
    productName: opts.productName,
    isReset: opts.isReset,
  });

  return dispatchEmail({
    settings: opts.settings,
    secret: opts.secret,
    to: opts.to,
    name: opts.name,
    type: opts.isReset ? 'reset' : 'welcome',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function sendReactivatedEmail(opts: {
  settings: AppSettings;
  secret: string;
  to: string;
  name: string;
  loginUrl: string;
}): Promise<EmailSendResult> {
  const rendered = buildReactivatedEmail({
    to: opts.to,
    name: opts.name,
    loginUrl: opts.loginUrl,
    officialSiteUrl: opts.settings.officialSiteUrl,
  });

  return dispatchEmail({
    settings: opts.settings,
    secret: opts.secret,
    to: opts.to,
    name: opts.name,
    type: 'reactivated',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
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
  const rendered = buildSuspendedEmail({
    name: opts.name,
    reason: opts.reason,
    checkoutUrl: opts.checkoutUrl,
    officialSiteUrl: opts.settings.officialSiteUrl,
  });

  return dispatchEmail({
    settings: opts.settings,
    secret: opts.secret,
    to: opts.to,
    name: opts.name,
    type: 'suspended',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

export async function sendTestEmail(opts: {
  settings: AppSettings;
  secret: string;
  to: string;
  loginUrl: string;
}): Promise<EmailSendResult> {
  const rendered = buildTestEmail({
    loginUrl: opts.loginUrl,
    officialSiteUrl: opts.settings.officialSiteUrl,
  });

  return dispatchEmail({
    settings: opts.settings,
    secret: opts.secret,
    to: opts.to,
    name: 'Teste Administrador',
    type: 'test',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
