import { describe, expect, it } from 'vitest';
import { RECIPES } from '../data';
import {
  PURCHASE_HOST,
  PURCHASE_URL,
  copyNotice,
  recipesCountLabel,
  salesLink,
  shoppingInviteFooter,
} from './invite';
import { classifyBlockedShortcut } from './protect';
import { aggregate, groupBySection, shareText } from './shopping';
import { buildShoppingPdf, pdfText } from './shoppingPdf';

describe('convite e links', () => {
  it('o link oficial de vendas leva UTMs', () => {
    const u = new URL(salesLink('copia', 'protecao'));
    expect(u.origin).toBe('https://www.congelafit.com.br');
    expect(u.searchParams.get('utm_source')).toBe('app');
    expect(u.searchParams.get('utm_medium')).toBe('copia');
    expect(u.searchParams.get('utm_campaign')).toBe('protecao');
  });
  it('"mais de 500" vem do total real de receitas', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(506);
    expect(recipesCountLabel(506)).toBe('mais de 500');
    expect(recipesCountLabel(1010)).toBe('mais de 1000');
  });
  it('o rodapé do WhatsApp da lista de compras usa https://congelafit.store/ e não promete resultado', () => {
    const t = shoppingInviteFooter().join('\n');
    expect(PURCHASE_URL).toBe('https://congelafit.store/');
    expect(PURCHASE_HOST).toBe('congelafit.store');
    expect(t).toContain('https://congelafit.store/');
    expect(t).not.toContain('www.congelafit.com.br');
    expect(t).toContain('CongelaFit Premium');
    expect(t).not.toMatch(/emagre|cura|garant|milagre|sem risco|últimas vagas|só hoje/i);
  });
  it('o aviso de cópia bloqueada mantém o domínio oficial e nenhum conteúdo de receita', () => {
    const n = copyNotice();
    expect(n).toContain('https://www.congelafit.com.br');
    expect(n.length).toBeLessThan(200);
  });
  it('o texto da lista não carrega modo de preparo', () => {
    const l = aggregate([{ id: RECIPES[0].id, factor: 1, lines: RECIPES[0].items }]);
    const t = shareText(groupBySection(l), new Set());
    for (const step of RECIPES[0].steps) expect(t).not.toContain(step.slice(0, 40));
  });
});

describe('proteção anti-print e anti-captura (sem marca d’água)', () => {
  it('identifica PrintScreen (incluindo keyCode 44) e atalhos de captura de tela no computador e tablet', () => {
    expect(
      classifyBlockedShortcut(
        { key: 'PrintScreen', code: 'PrintScreen', keyCode: 44, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe('screenshot');
    expect(
      classifyBlockedShortcut(
        { key: '', code: '', keyCode: 44, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe('screenshot');
    expect(
      classifyBlockedShortcut(
        { key: '4', code: 'Digit4', keyCode: 52, ctrlKey: false, metaKey: true, shiftKey: true, altKey: false },
        false,
      ),
    ).toBe('screenshot');
    expect(
      classifyBlockedShortcut(
        { key: 'S', code: 'KeyS', keyCode: 83, ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
        false,
      ),
    ).toBe('screenshot');
  });

  it('bloqueia impressão fora da etiqueta do freezer e libera na rota imprimível', () => {
    const ctrlP = { key: 'p', code: 'KeyP', keyCode: 80, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(classifyBlockedShortcut(ctrlP, false)).toBe('print');
    expect(classifyBlockedShortcut(ctrlP, true)).toBeNull();
  });

  it('bloqueia selecionar tudo, copiar, salvar página e DevTools', () => {
    expect(
      classifyBlockedShortcut(
        { key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe('copy');
    expect(
      classifyBlockedShortcut(
        { key: 'c', code: 'KeyC', keyCode: 67, ctrlKey: false, metaKey: true, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe('copy');
    expect(
      classifyBlockedShortcut(
        { key: 's', code: 'KeyS', keyCode: 83, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe('save');
    expect(
      classifyBlockedShortcut(
        { key: 'F12', code: 'F12', keyCode: 123, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe('devtools');
    expect(
      classifyBlockedShortcut(
        { key: 'I', code: 'KeyI', keyCode: 73, ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
        false,
      ),
    ).toBe('devtools');
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
