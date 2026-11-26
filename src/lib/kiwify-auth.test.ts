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
} from '../../server/mailer.ts';

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
});
