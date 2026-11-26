import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { decryptSecret } from './auth.ts';
import type { AppSettings, EmailLog, EmailTemplateType } from './types.ts';

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

export const EMAIL_TEMPLATE_TYPES: readonly EmailTemplateType[] = [
  'welcome',
  'reset',
  'reactivated',
  'suspended',
  'test',
] as const;

export function isEmailTemplateType(value: unknown): value is EmailTemplateType {
  return typeof value === 'string' && (EMAIL_TEMPLATE_TYPES as readonly string[]).includes(value);
}

export const EMAIL_TEMPLATE_META: Record<
  EmailTemplateType,
  { label: string; description: string; variables: Array<{ key: string; label: string }> }
> = {
  welcome: {
    label: 'Boas-vindas (Compra aprovada)',
    description: 'Enviado automaticamente após pagamento aprovado na Kiwify ou liberação manual.',
    variables: [
      { key: 'name', label: 'Nome do aluno' },
      { key: 'email', label: 'E-mail de login' },
      { key: 'password', label: 'Senha gerada' },
      { key: 'loginUrl', label: 'Link do app' },
      { key: 'productName', label: 'Nome do produto' },
      { key: 'logoUrl', label: 'Logo CongelaFit' },
      { key: 'siteUrl', label: 'Site oficial' },
    ],
  },
  reset: {
    label: 'Nova senha / Reenvio',
    description: 'Enviado quando o aluno pede "Reenviar senha" ou o Admin reenvia acesso.',
    variables: [
      { key: 'name', label: 'Nome do aluno' },
      { key: 'email', label: 'E-mail de login' },
      { key: 'password', label: 'Nova senha' },
      { key: 'loginUrl', label: 'Link do app' },
      { key: 'productName', label: 'Nome do produto' },
      { key: 'logoUrl', label: 'Logo CongelaFit' },
      { key: 'siteUrl', label: 'Site oficial' },
    ],
  },
  reactivated: {
    label: 'Acesso reativado',
    description: 'Enviado quando uma assinatura suspensa volta a ficar ativa na Kiwify.',
    variables: [
      { key: 'name', label: 'Nome do aluno' },
      { key: 'email', label: 'E-mail de login' },
      { key: 'loginUrl', label: 'Link do app' },
      { key: 'logoUrl', label: 'Logo CongelaFit' },
      { key: 'siteUrl', label: 'Site oficial' },
    ],
  },
  suspended: {
    label: 'Suspensão de acesso',
    description: 'Enviado quando há atraso, recusa ou cancelamento na Kiwify.',
    variables: [
      { key: 'name', label: 'Nome do aluno' },
      { key: 'reason', label: 'Motivo da suspensão' },
      { key: 'checkoutUrl', label: 'Link para regularizar' },
      { key: 'logoUrl', label: 'Logo CongelaFit' },
      { key: 'siteUrl', label: 'Site oficial' },
    ],
  },
  test: {
    label: 'Teste de envio',
    description: 'Usado pelo botão "Enviar e-mail de teste" no painel do Administrador.',
    variables: [
      { key: 'loginUrl', label: 'Link do app' },
      { key: 'logoUrl', label: 'Logo CongelaFit' },
      { key: 'siteUrl', label: 'Site oficial' },
    ],
  },
};

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

export function sanitizeEmailHtml(raw: string): string {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(['"])\s*(?:javascript|vbscript|data:text\/html):[^'"]*\2/gi, '$1=$2#$2');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&rarr;/gi, '->')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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

  // Se o HTML editado usar /icons/logo-mark.png, converte para cid inline ao disparar por e-mail
  const preparedHtml = opts.html.replace(/src=(["'])\/icons\/logo-mark\.png\1/gi, `src=$1cid:${LOGO_CID}$1`);
  const logoBuffer = preparedHtml.includes(`cid:${LOGO_CID}`) ? loadBrandLogoBuffer() : null;

  if (cfg.provider === 'resend') {
    try {
      const payload: Record<string, unknown> = {
        from: fromHeader,
        reply_to: cfg.fromAddress,
        to: [opts.to],
        subject: opts.subject,
        html: preparedHtml,
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
        if (resp.status === 403 && /domain|verify/i.test(body)) {
          throw new Error(
            `Resend HTTP 403: Verifique o domínio do e-mail remetente (${cfg.fromAddress}) no painel do Resend (Domains) antes de disparar.`,
          );
        }
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
      replyTo: cfg.fromAddress,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: preparedHtml,
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

function wrapTemplateShell(opts: {
  title: string;
  preheader: string;
  badgeText: string;
  badgeTone: BadgeTone;
  heading: string;
  bodyHtml: string;
}): string {
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
          <tr>
            <td style="background-color:${BRAND_COLORS.white};padding:22px 28px 18px;border-bottom:1px solid ${BRAND_COLORS.line};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="64" valign="middle" style="padding-right:14px;">
                    <div style="width:60px;background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-radius:12px;padding:8px 7px;text-align:center;">
                      <img src="{{logoUrl}}" alt="CongelaFit" width="46" style="display:block;width:46px;height:auto;border:0;margin:0 auto;" />
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
          <tr>
            <td style="padding:18px 28px;background-color:${BRAND_COLORS.ice};border-top:1px solid ${BRAND_COLORS.line};font-size:12px;line-height:1.55;color:${BRAND_COLORS.muted};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <strong style="color:${BRAND_COLORS.ink};">CongelaFit Premium</strong> ·
                    <a href="{{siteUrl}}" style="color:${BRAND_COLORS.greenDeep};font-weight:700;text-decoration:none;">{{siteHost}}</a>
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

export function getDefaultEmailTemplate(type: EmailTemplateType): { subject: string; html: string } {
  if (type === 'reset') {
    const subject = 'CongelaFit Premium — Sua nova senha de acesso';
    const html = wrapTemplateShell({
      title: subject,
      preheader: 'Sua nova senha temporária do CongelaFit Premium chegou.',
      badgeText: 'Nova senha gerada',
      badgeTone: 'info',
      heading: 'Sua nova senha de acesso',
      bodyHtml: `<p style="margin:0 0 16px;">Olá, <strong>{{name}}</strong>! Geramos uma nova senha temporária para você acessar o <strong>{{productName}}</strong> com segurança.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-left:4px solid ${BRAND_COLORS.green};border-radius:12px;margin:18px 0;">
          <tr>
            <td style="padding:16px 18px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND_COLORS.blueDeep};margin-bottom:10px;">
                Seus dados de entrada
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:4px 0;font-size:14px;color:${BRAND_COLORS.muted};width:130px;"><strong>E-mail:</strong></td>
                  <td style="padding:4px 0;font-size:14px;color:${BRAND_COLORS.ink};font-weight:700;">{{email}}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0 2px;font-size:14px;color:${BRAND_COLORS.muted};vertical-align:middle;"><strong>Senha:</strong></td>
                  <td style="padding:8px 0 2px;">
                    <span style="display:inline-block;background-color:${BRAND_COLORS.white};border:1px solid ${BRAND_COLORS.line};border-radius:8px;padding:5px 12px;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;letter-spacing:0.06em;color:${BRAND_COLORS.ink};">{{password}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 18px;">
          <tr>
            <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
              <a href="{{loginUrl}}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
                Acessar Área de Membros &rarr;
              </a>
            </td>
          </tr>
        </table>
        <div style="background-color:${BRAND_COLORS.leaf};border:1px solid #c5dfc7;border-radius:12px;padding:13px 16px;margin:16px 0 14px;font-size:13px;line-height:1.55;color:${BRAND_COLORS.greenDeep};">
          <strong>Dica de segurança:</strong> após entrar, troque esta senha temporária em <strong>Mais &rarr; Alterar senha</strong>.
        </div>
        <p style="margin:12px 0 0;font-size:12px;color:${BRAND_COLORS.muted};word-break:break-all;">
          Se o botão não abrir, acesse diretamente:<br />
          <a href="{{loginUrl}}" style="color:${BRAND_COLORS.blueDeep};text-decoration:underline;">{{loginUrl}}</a>
        </p>`,
    });
    return { subject, html };
  }

  if (type === 'reactivated') {
    const subject = 'CongelaFit Premium — Seu acesso foi reativado!';
    const html = wrapTemplateShell({
      title: subject,
      preheader: 'Pagamento confirmado! Seu acesso ao CongelaFit Premium está ativo novamente.',
      badgeText: 'Acesso reativado',
      badgeTone: 'ok',
      heading: 'Bem-vindo(a) de volta!',
      bodyHtml: `<p style="margin:0 0 14px;">Olá, <strong>{{name}}</strong>! Recebemos a confirmação do seu pagamento na Kiwify e seu acesso ao <strong>CongelaFit Premium</strong> está ativo novamente.</p>
        <div style="background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-left:4px solid ${BRAND_COLORS.blue};border-radius:12px;padding:14px 18px;margin:16px 0;">
          <div style="font-size:13px;color:${BRAND_COLORS.muted};">Conta reativada:</div>
          <div style="font-size:15px;font-weight:700;color:${BRAND_COLORS.ink};margin-top:4px;">{{email}}</div>
          <div style="font-size:13px;color:${BRAND_COLORS.muted};margin-top:4px;">Use a mesma senha já cadastrada anteriormente.</div>
        </div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 14px;">
          <tr>
            <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
              <a href="{{loginUrl}}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
                Entrar no CongelaFit &rarr;
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:10px 0 0;font-size:12px;color:${BRAND_COLORS.muted};word-break:break-all;">
          Link direto: <a href="{{loginUrl}}" style="color:${BRAND_COLORS.blueDeep};">{{loginUrl}}</a>
        </p>`,
    });
    return { subject, html };
  }

  if (type === 'suspended') {
    const subject = 'CongelaFit Premium — Aviso de suspensão de acesso';
    const html = wrapTemplateShell({
      title: subject,
      preheader: 'Seu acesso ao CongelaFit Premium foi temporariamente suspenso.',
      badgeText: 'Acesso suspenso',
      badgeTone: 'warn',
      heading: 'Regularize sua assinatura',
      bodyHtml: `<p style="margin:0 0 14px;">Olá, <strong>{{name}}</strong>.</p>
        <p style="margin:0 0 14px;">Informamos que o seu acesso à área de membros do <strong>CongelaFit Premium</strong> foi temporariamente suspenso.</p>
        <div style="background-color:${BRAND_COLORS.dangerBg};border:1px solid ${BRAND_COLORS.dangerBorder};border-left:4px solid ${BRAND_COLORS.dangerText};border-radius:12px;padding:14px 18px;margin:16px 0;color:${BRAND_COLORS.dangerText};">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Motivo registrado</div>
          <div style="font-size:14px;font-weight:600;">{{reason}}</div>
        </div>
        <p style="margin:0 0 16px;">Assim que o pagamento for regularizado na Kiwify, seu acesso é liberado novamente de forma automática.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 10px;">
          <tr>
            <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
              <a href="{{checkoutUrl}}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
                Regularizar acesso &rarr;
              </a>
            </td>
          </tr>
        </table>`,
    });
    return { subject, html };
  }

  if (type === 'test') {
    const subject = 'CongelaFit Premium — Teste de envio de e-mail';
    const html = wrapTemplateShell({
      title: subject,
      preheader: 'Teste de envio com a identidade visual oficial do CongelaFit Premium.',
      badgeText: 'Configuração validada',
      badgeTone: 'info',
      heading: 'Envio de e-mail funcionando!',
      bodyHtml: `<p style="margin:0 0 14px;">Este é um disparo de teste do sistema de e-mails do <strong>CongelaFit Premium</strong>.</p>
        <div style="background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-left:4px solid ${BRAND_COLORS.blue};border-radius:12px;padding:14px 18px;margin:16px 0;">
          <div style="font-size:13px;color:${BRAND_COLORS.muted};">URL de login configurada para os alunos:</div>
          <div style="font-size:14px;font-weight:700;margin-top:4px;word-break:break-all;">
            <a href="{{loginUrl}}" style="color:${BRAND_COLORS.blueDeep};">{{loginUrl}}</a>
          </div>
        </div>
        <p style="margin:0 0 16px;">Se você recebeu esta mensagem com a logo e as cores oficiais, o envio automático para novos compradores da Kiwify está funcionando corretamente.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 8px;">
          <tr>
            <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
              <a href="{{loginUrl}}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
                Abrir CongelaFit Premium &rarr;
              </a>
            </td>
          </tr>
        </table>`,
    });
    return { subject, html };
  }

  // welcome
  const subject = 'Bem-vindo(a) ao CongelaFit Premium! Seu acesso chegou';
  const html = wrapTemplateShell({
    title: subject,
    preheader: 'Pagamento aprovado! Veja seu e-mail e senha para entrar no CongelaFit Premium.',
    badgeText: 'Acesso liberado',
    badgeTone: 'ok',
    heading: 'Seu acesso chegou!',
    bodyHtml: `<p style="margin:0 0 16px;">Olá, <strong>{{name}}</strong>! Seu pagamento foi aprovado na Kiwify e seu acesso completo ao <strong>{{productName}}</strong> já está liberado.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND_COLORS.ice};border:1px solid ${BRAND_COLORS.line};border-left:4px solid ${BRAND_COLORS.green};border-radius:12px;margin:18px 0;">
        <tr>
          <td style="padding:16px 18px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND_COLORS.blueDeep};margin-bottom:10px;">
              Seus dados de entrada
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding:4px 0;font-size:14px;color:${BRAND_COLORS.muted};width:130px;"><strong>E-mail:</strong></td>
                <td style="padding:4px 0;font-size:14px;color:${BRAND_COLORS.ink};font-weight:700;">{{email}}</td>
              </tr>
              <tr>
                <td style="padding:8px 0 2px;font-size:14px;color:${BRAND_COLORS.muted};vertical-align:middle;"><strong>Senha:</strong></td>
                <td style="padding:8px 0 2px;">
                  <span style="display:inline-block;background-color:${BRAND_COLORS.white};border:1px solid ${BRAND_COLORS.line};border-radius:8px;padding:5px 12px;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;letter-spacing:0.06em;color:${BRAND_COLORS.ink};">{{password}}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 18px;">
        <tr>
          <td align="center" style="background-color:${BRAND_COLORS.green};border-radius:12px;">
            <a href="{{loginUrl}}" style="display:inline-block;background-color:${BRAND_COLORS.green};color:${BRAND_COLORS.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px;">
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
        <a href="{{loginUrl}}" style="color:${BRAND_COLORS.blueDeep};text-decoration:underline;">{{loginUrl}}</a>
      </p>`,
  });
  return { subject, html };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateInterpolationData {
  name?: string;
  email?: string;
  password?: string;
  loginUrl?: string;
  productName?: string;
  reason?: string;
  checkoutUrl?: string;
  officialSiteUrl?: string;
  logoSrc?: string;
}

export function renderEmailFromRaw(
  rawSubject: string,
  rawHtml: string,
  data: TemplateInterpolationData,
): RenderedEmail {
  const siteUrl = safeHref(data.officialSiteUrl || 'https://www.congelafit.com.br');
  const siteHost = siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const loginUrl = safeHref(data.loginUrl || siteUrl);
  const checkoutUrl = safeHref(data.checkoutUrl || siteUrl);
  const logoUrl = safeLogoSrc(data.logoSrc, siteUrl);

  const rawTextVars: Record<string, string> = {
    name: data.name || 'Aluno(a)',
    email: data.email || 'aluna@exemplo.com',
    password: data.password || '',
    productName: data.productName || 'CongelaFit Premium',
    reason: data.reason || '',
    siteHost,
    loginUrl,
    checkoutUrl,
    siteUrl,
    logoUrl,
  };

  const htmlVars: Record<string, string> = {
    name: escapeHtml(rawTextVars.name),
    email: escapeHtml(rawTextVars.email),
    password: escapeHtml(rawTextVars.password),
    productName: escapeHtml(rawTextVars.productName),
    reason: escapeHtml(rawTextVars.reason),
    siteHost: escapeHtml(siteHost),
    loginUrl: escapeHtml(loginUrl),
    checkoutUrl: escapeHtml(checkoutUrl),
    siteUrl: escapeHtml(siteUrl),
    logoUrl: escapeHtml(logoUrl),
  };

  const subject = rawSubject
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => rawTextVars[key] ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  const sanitized = sanitizeEmailHtml(rawHtml);
  const html = sanitized.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => htmlVars[key] ?? '');

  return {
    subject: subject || 'CongelaFit Premium',
    html,
    text: htmlToPlainText(html),
  };
}

function resolveTemplateSource(
  type: EmailTemplateType,
  settings?: AppSettings,
): { subject: string; html: string; isCustom: boolean; updatedAt?: string } {
  const def = getDefaultEmailTemplate(type);
  const custom = settings?.emailTemplates?.[type];
  if (custom && custom.html.trim()) {
    return {
      subject: custom.subject.trim() || def.subject,
      html: custom.html,
      isCustom: true,
      updatedAt: custom.updatedAt,
    };
  }
  return {
    subject: def.subject,
    html: def.html,
    isCustom: false,
  };
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
  settings?: AppSettings;
}): RenderedEmail {
  const type: EmailTemplateType = opts.isReset ? 'reset' : 'welcome';
  const tpl = resolveTemplateSource(type, opts.settings);
  return renderEmailFromRaw(tpl.subject, tpl.html, {
    name: opts.name,
    email: opts.to,
    password: opts.password,
    loginUrl: opts.loginUrl,
    productName: opts.productName,
    officialSiteUrl: opts.officialSiteUrl || opts.settings?.officialSiteUrl,
    logoSrc: opts.logoSrc,
  });
}

export function buildReactivatedEmail(opts: {
  to: string;
  name: string;
  loginUrl: string;
  officialSiteUrl?: string;
  logoSrc?: string;
  settings?: AppSettings;
}): RenderedEmail {
  const tpl = resolveTemplateSource('reactivated', opts.settings);
  return renderEmailFromRaw(tpl.subject, tpl.html, {
    name: opts.name,
    email: opts.to,
    loginUrl: opts.loginUrl,
    officialSiteUrl: opts.officialSiteUrl || opts.settings?.officialSiteUrl,
    logoSrc: opts.logoSrc,
  });
}

export function buildSuspendedEmail(opts: {
  name: string;
  reason: string;
  checkoutUrl: string;
  officialSiteUrl?: string;
  logoSrc?: string;
  settings?: AppSettings;
}): RenderedEmail {
  const tpl = resolveTemplateSource('suspended', opts.settings);
  return renderEmailFromRaw(tpl.subject, tpl.html, {
    name: opts.name,
    reason: opts.reason,
    checkoutUrl: opts.checkoutUrl,
    officialSiteUrl: opts.officialSiteUrl || opts.settings?.officialSiteUrl,
    logoSrc: opts.logoSrc,
  });
}

export function buildTestEmail(opts: {
  loginUrl: string;
  officialSiteUrl?: string;
  logoSrc?: string;
  settings?: AppSettings;
}): RenderedEmail {
  const tpl = resolveTemplateSource('test', opts.settings);
  return renderEmailFromRaw(tpl.subject, tpl.html, {
    loginUrl: opts.loginUrl,
    officialSiteUrl: opts.officialSiteUrl || opts.settings?.officialSiteUrl,
    logoSrc: opts.logoSrc,
  });
}

export function renderPreviewForType(opts: {
  type: EmailTemplateType;
  settings: AppSettings;
  loginUrl: string;
  overrideSubject?: string;
  overrideHtml?: string;
}): RenderedEmail {
  const officialSiteUrl = opts.settings.officialSiteUrl || 'https://www.congelafit.com.br';
  const source = resolveTemplateSource(opts.type, opts.settings);
  const subject = opts.overrideSubject !== undefined ? opts.overrideSubject : source.subject;
  const html = opts.overrideHtml !== undefined ? opts.overrideHtml : source.html;

  return renderEmailFromRaw(subject, html, {
    name: 'Maria Silva',
    email: 'aluna@exemplo.com',
    password: 'maria12345',
    loginUrl: opts.loginUrl,
    productName: 'CongelaFit Premium',
    reason: 'Assinatura em atraso na Kiwify. Regularize o pagamento para reativar.',
    checkoutUrl: opts.settings.kiwifyCheckoutUrl || officialSiteUrl,
    officialSiteUrl,
    logoSrc: '/icons/logo-mark.png',
  });
}

export function getAllEmailTemplatesState(opts: { settings: AppSettings; loginUrl: string }) {
  return EMAIL_TEMPLATE_TYPES.map((type) => {
    const meta = EMAIL_TEMPLATE_META[type];
    const def = getDefaultEmailTemplate(type);
    const source = resolveTemplateSource(type, opts.settings);
    const preview = renderPreviewForType({
      type,
      settings: opts.settings,
      loginUrl: opts.loginUrl,
    });
    return {
      type,
      label: meta.label,
      description: meta.description,
      variables: meta.variables,
      isCustom: source.isCustom,
      updatedAt: source.updatedAt ?? null,
      subject: source.subject,
      html: source.html,
      defaultSubject: def.subject,
      defaultHtml: def.html,
      previewSubject: preview.subject,
      previewHtml: preview.html,
    };
  });
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
    settings: opts.settings,
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
    settings: opts.settings,
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
    settings: opts.settings,
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
    settings: opts.settings,
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
