import { describe, expect, it } from 'vitest';
import { RECIPES } from '../data';
import { copyNotice, recipesCountLabel, salesLink, shoppingInviteFooter } from './invite';
import { watermarkImage } from './protect';
import { aggregate, groupBySection, shareText } from './shopping';
import { buildShoppingPdf, pdfText } from './shoppingPdf';

describe('convite e links', () => {
  it('o link da página de vendas leva UTMs', () => {
    const u = new URL(salesLink('lista', 'compartilhar'));
    expect(u.origin).toBe('https://congelafit.store');
    expect(u.searchParams.get('utm_source')).toBe('app');
    expect(u.searchParams.get('utm_medium')).toBe('lista');
    expect(u.searchParams.get('utm_campaign')).toBe('compartilhar');
  });
  it('"mais de 500" vem do total real de receitas', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(506);
    expect(recipesCountLabel(506)).toBe('mais de 500');
    expect(recipesCountLabel(1010)).toBe('mais de 1000');
  });
  it('o rodapé do WhatsApp convida, tem o link e não promete resultado', () => {
    const t = shoppingInviteFooter().join('\n');
    expect(t).toContain('https://congelafit.store/?utm_source=app');
    expect(t).toContain('CongelaFit Premium');
    expect(t).not.toMatch(/emagre|cura|garant|milagre|sem risco|últimas vagas|só hoje/i);
  });
  it('o aviso de cópia bloqueada leva o link e nenhum conteúdo de receita', () => {
    const n = copyNotice();
    expect(n).toContain('https://congelafit.store');
    expect(n.length).toBeLessThan(200);
  });
  it('o texto da lista não carrega modo de preparo', () => {
    const l = aggregate([{ id: RECIPES[0].id, factor: 1, lines: RECIPES[0].items }]);
    const t = shareText(groupBySection(l), new Set());
    for (const step of RECIPES[0].steps) expect(t).not.toContain(step.slice(0, 40));
  });
});

describe('marca d’água', () => {
  it('escapa o e-mail dentro do SVG', () => {
    const uri = decodeURIComponent(watermarkImage('a&b<c>"@x.com'));
    expect(uri).toContain('a&amp;b&lt;c&gt;&quot;@x.com');
    expect(uri).not.toContain('<c>');
  });
  it('é um SVG que se repete (data URI)', () => {
    expect(watermarkImage('maria@exemplo.com')).toMatch(/^data:image\/svg\+xml;utf8,/);
  });
});

describe('PDF da lista de compras', () => {
  it('troca símbolos fora do Latin-1 e mantém acentos', () => {
    expect(pdfText('Pão – ½ xícara • “ok” ⅓ ❄️')).toBe('Pão - ½ xícara - "ok" 1/3');
    expect(pdfText('açúcar, ovo, limão')).toBe('açúcar, ovo, limão');
  });
  const lines = aggregate(
    RECIPES.slice(0, 12).map((r) => ({ id: r.id, factor: 1, lines: RECIPES.find((x) => x.id === r.id)!.items })),
  );
  it('gera um PDF válido e com mais de uma página quando a lista é grande', async () => {
    const blob = await buildShoppingPdf(groupBySection(lines), new Set(), new Date('2026-11-21T12:00:00'));
    const head = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(blob.size).toBeGreaterThan(5000);
    expect(lines.length).toBeGreaterThan(40);
  });
  it('lista toda marcada vira "Tudo comprado!"', async () => {
    const done = new Set(lines.map((l) => l.key));
    const blob = await buildShoppingPdf(groupBySection(lines), done);
    expect(blob.size).toBeGreaterThan(3000);
  });
});
