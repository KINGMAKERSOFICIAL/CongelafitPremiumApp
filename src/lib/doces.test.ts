import { describe, expect, it } from 'vitest';
import { RECIPES, getCategory, recipesOf } from '../data';
import { classify, parseLine } from './shopping';
import { freezeRuleFor } from './freezer';

const CAT = 'doces-saudaveis-e-funcionais';
const doces = recipesOf(CAT);

const files = (g: Record<string, unknown>) => new Set(Object.keys(g).map((k) => k.split('/').pop()!));
const photos = files(import.meta.glob('../../public/img/*.webp', { query: '?url', import: 'default' }));
const thumbs = files(import.meta.glob('../../public/img/t/*.webp', { query: '?url', import: 'default' }));

describe('categoria Doces Saudáveis e Funcionais', () => {
  it('existe, com 18 receitas numeradas de 413 a 430 e ids únicos', () => {
    expect(getCategory(CAT)?.name).toMatch(/Doces Saudáveis/);
    expect(getCategory(CAT)?.section).toBe('Doces e sobremesas');
    expect(doces).toHaveLength(18);
    expect(doces.map((r) => r.n).sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => 413 + i));
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
  it('cada doce tem foto, miniatura, calorias, preparo e congelamento próprios', () => {
    for (const r of doces) {
      expect(photos.has(`${r.img}.webp`), `${r.id} foto`).toBe(true);
      expect(thumbs.has(`${r.img}.webp`), `${r.id} miniatura`).toBe(true);
      expect(r.kcal, `${r.id} kcal`).toBeGreaterThan(0);
      expect(r.items.length, `${r.id} ingredientes`).toBeGreaterThanOrEqual(3);
      expect(r.steps.length, `${r.id} passos`).toBeGreaterThanOrEqual(3);
      expect(r.freeze, `${r.id} freeze`).toBeDefined();
      expect(r.freeze!.how.length).toBeGreaterThan(20);
      expect(r.freeze!.reheat.length).toBeGreaterThan(10);
    }
  });
});

describe('freezer: doces usam o prazo da própria receita', () => {
  it('freezeRuleFor devolve meses, aviso e como servir da receita', () => {
    for (const r of doces) {
      const rule = freezeRuleFor(r);
      expect(rule.months).toBe(r.freeze!.months);
      expect(rule.verdict).toBe(r.freeze!.verdict);
      expect(rule.note).toBe(r.freeze!.how);
      expect(rule.serve).toBe(r.freeze!.serve);
    }
  });
  it('prazos conservadores (1 a 2 meses) e pipoca doce não indicada para congelar', () => {
    for (const r of doces) {
      expect(r.freeze!.months).toBeGreaterThanOrEqual(1);
      expect(r.freeze!.months).toBeLessThanOrEqual(2);
    }
    expect(doces.find((r) => r.title === 'Pipoca Doce')!.freeze!.verdict).toBe('no');
    expect(doces.filter((r) => r.freeze!.months === 2).map((r) => r.title)).toEqual([
      'Brownie de Batata-Doce',
      'Brownie Low Carb',
      'Cookie de Banana com Aveia',
    ]);
  });
});

describe('lista de compras dos doces', () => {
  it('nenhum ingrediente cai em "Outros"', () => {
    const out: string[] = [];
    for (const r of doces)
      for (const line of r.items)
        for (const p of parseLine(line)) if (classify(p.key) === 'outros') out.push(`${r.id}: ${p.key}`);
    expect(out).toEqual([]);
  });
});
