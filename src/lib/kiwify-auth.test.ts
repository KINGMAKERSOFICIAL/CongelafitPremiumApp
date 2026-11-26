import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  generateReadablePassword,
  hashPassword,
  signSession,
  verifyPassword,
  verifySession,
} from '../../server/auth.ts';
import { mapKiwifySaleStatus } from '../../server/kiwifyApi.ts';
import {
  BRAND_COLORS,
  LOGO_CID,
  buildCredentialsEmail,
  buildReactivatedEmail,
  buildSuspendedEmail,
  buildTestEmail,
  loadBrandLogoBuffer,
  renderPreviewForType,
  sanitizeEmailHtml,
} from '../../server/mailer.ts';
import { isAllowedDomainOrigin, sanitizeHostHeader } from '../../server/security.ts';
import type { AppSettings } from '../../server/types.ts';

describe('autenticação, criptografia e senhas geradas', () => {
  it('gera senhas legíveis fortes com maiúscula, minúscula e número', () => {
    for (let i = 0; i < 15; i++) {
      const p = generateReadablePassword(10);
      expect(p).toHaveLength(10);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
    }
  });

  it('valida hash scrypt corretamente', () => {
    const pass = generateReadablePassword(10);
    const { hash, salt } = hashPassword(pass);
    expect(verifyPassword(pass, hash, salt)).toBe(true);
    expect(verifyPassword('errada123', hash, salt)).toBe(false);
  });

  it('criptografa e descriptografa segredos com AES-256-GCM', () => {
    const master = 'segredo-de-teste-com-32-caracteres-minimo';
    const enc = encryptSecret('re_123456_api_key', master);
    expect(enc).not.toContain('re_123456');
    expect(decryptSecret(enc, master)).toBe('re_123456_api_key');
    expect(decryptSecret(enc, 'outra-chave')).toBe('');
  });

  it('assina e verifica token de sessão HMAC', () => {
    const secret = 'chave-hmac-teste-123456';
    const token = signSession('usr-42', secret);
    const payload = verifySession(token, secret);
    expect(payload?.uid).toBe('usr-42');
    expect(verifySession(`${token}x`, secret)).toBeNull();
  });
});

describe('mapeamento de status da Kiwify (liberação e suspensão)', () => {
  it('ativa acesso quando pagamento está aprovado ou assinatura ativa', () => {
    expect(mapKiwifySaleStatus('paid')).toBe('active');
    expect(mapKiwifySaleStatus('approved')).toBe('active');
    expect(mapKiwifySaleStatus('completed', 'active')).toBe('active');
  });

  it('bloqueia como pendente enquanto aguarda pagamento', () => {
    expect(mapKiwifySaleStatus('waiting_payment')).toBe('pending');
  });

  it('suspende automaticamente quando pagamento atrasa, é recusado ou vence', () => {
    expect(mapKiwifySaleStatus('refused')).toBe('suspended');
    expect(mapKiwifySaleStatus('late')).toBe('suspended');
    expect(mapKiwifySaleStatus('paid', 'past_due')).toBe('suspended');
    expect(mapKiwifySaleStatus('unpaid')).toBe('suspended');
  });

  it('bloqueia reembolso, chargeback e cancelamento', () => {
    expect(mapKiwifySaleStatus('refunded')).toBe('refunded');
    expect(mapKiwifySaleStatus('chargedback')).toBe('refunded');
    expect(mapKiwifySaleStatus('canceled')).toBe('canceled');
  });
});

describe('modelos de e-mail HTML com identidade CongelaFit', () => {
  it('carrega a logo oficial do CongelaFit em disco para anexo inline (CID)', () => {
    const buf = loadBrandLogoBuffer();
    expect(buf).not.toBeNull();
    expect(buf!.length).toBeGreaterThan(1000);
  });

  it('gera e-mail de acesso HTML com logo CID, cores padrão e dados escapados', () => {
    const mail = buildCredentialsEmail({
      to: 'aluna@congelafit.com.br',
      name: 'Ana <script>alert(1)</script>',
      password: 'Fit942Kiwify',
      loginUrl: 'https://www.congelafit.com.br',
      officialSiteUrl: 'https://www.congelafit.com.br',
    });

    expect(mail.html).toContain(`src="cid:${LOGO_CID}"`);
    expect(mail.html).toContain(BRAND_COLORS.blue);
    expect(mail.html).toContain(BRAND_COLORS.green);
    expect(mail.html).toContain(BRAND_COLORS.ice);
    expect(mail.html).toContain('CONGELA');
    expect(mail.html).toContain('Fit942Kiwify');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('gera modelos de reativação, suspensão e teste com URLs seguras', () => {
    const reactivated = buildReactivatedEmail({
      to: 'membro@congelafit.com.br',
      name: 'Carla',
      loginUrl: 'https://www.congelafit.com.br',
    });
    expect(reactivated.html).toContain(BRAND_COLORS.green);

    const suspended = buildSuspendedEmail({
      name: 'Carlos',
      reason: 'Atraso na parcela',
      checkoutUrl: 'javascript:alert(1)',
    });
    expect(suspended.html).not.toContain('javascript:');
    expect(suspended.html).toContain('https://www.congelafit.com.br');

    const testMail = buildTestEmail({
      loginUrl: 'https://www.congelafit.com.br',
      logoSrc: '/icons/logo-mark.png',
    });
    expect(testMail.html).toContain('src="/icons/logo-mark.png"');
  });

  it('permite HTML editado no admin, sanitiza scripts e renderiza prévia com variáveis', () => {
    const clean = sanitizeEmailHtml(
      '<div onclick="alert(1)"><script>steal()</script><a href="javascript:xss()">Link</a><p>Olá {{name}}</p></div>',
    );
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onclick=');
    expect(clean).not.toContain('javascript:');

    const baseSettings: AppSettings = {
      officialSiteUrl: 'https://www.congelafit.com.br',
      kiwifyWebhookToken: 'tok123456',
      kiwifyCheckoutUrl: 'https://www.congelafit.com.br',
      kiwifyAffiliateInviteUrl: 'https://kiwify.com.br/',
      updatedAt: new Date().toISOString(),
      emailTemplates: {
        welcome: {
          subject: 'Bem-vinda {{name}}!',
          html: '<img src="{{logoUrl}}" /><p>Senha: <b>{{password}}</b></p>',
          updatedAt: new Date().toISOString(),
        },
      },
    };

    const customSent = buildCredentialsEmail({
      to: 'joana@exemplo.com',
      name: 'Joana',
      password: 'Senha789',
      loginUrl: 'https://www.congelafit.com.br',
      settings: baseSettings,
    });
    expect(customSent.subject).toBe('Bem-vinda Joana!');
    expect(customSent.html).toContain(`src="cid:${LOGO_CID}"`);
    expect(customSent.html).toContain('Senha789');

    const preview = renderPreviewForType({
      type: 'welcome',
      settings: baseSettings,
      loginUrl: 'https://www.congelafit.com.br',
      overrideSubject: 'Prévia {{name}}',
      overrideHtml: '<img src="{{logoUrl}}" /><h1>Olá {{name}}</h1><script>bad()</script>',
    });
    expect(preview.subject).toBe('Prévia Maria Silva');
    expect(preview.html).toContain('src="/icons/logo-mark.png"');
    expect(preview.html).toContain('<h1>Olá Maria Silva</h1>');
    expect(preview.html).not.toContain('<script>');
  });
});

describe('segurança de domínio e cabeçalhos Host/Origin', () => {
  it('rejeita cabeçalhos Host malformados e normaliza hosts válidos', () => {
    expect(sanitizeHostHeader('www.congelafit.com.br')).toBe('www.congelafit.com.br');
    expect(sanitizeHostHeader('app.congelafit.com.br:3000')).toBe('app.congelafit.com.br:3000');
    expect(sanitizeHostHeader('evil.com/path')).toBe('');
    expect(sanitizeHostHeader('user@evil.com')).toBe('');
    expect(sanitizeHostHeader('evil.com\r\nX-Test: 1')).toBe('');
  });

  it('permite apenas origens do domínio oficial CongelaFit, do host atual ou configuradas', () => {
    expect(isAllowedDomainOrigin('https://www.congelafit.com.br', 'localhost:3000')).toBe(true);
    expect(isAllowedDomainOrigin('https://app.congelafit.com.br', 'localhost:3000')).toBe(true);
    expect(isAllowedDomainOrigin('https://meuapp.run.app', 'meuapp.run.app')).toBe(true);
    expect(isAllowedDomainOrigin('https://site-invasor.com', 'www.congelafit.com.br')).toBe(false);
    expect(isAllowedDomainOrigin('https://congelafit.com.br.evil.com', 'www.congelafit.com.br')).toBe(false);
  });
});
