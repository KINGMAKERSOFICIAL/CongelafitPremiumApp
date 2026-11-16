import { describe, expect, it } from 'vitest';
import { RECIPES, getCategory, recipesOf } from '../data';
import { classify, parseLine } from './shopping';
import { freezeRuleFor } from './freezer';

const CAT = 'lanches-para-congelar';
const lanches = recipesOf(CAT);
// lista de arquivos de /public/img (só nomes, sem carregar as imagens)
const files = (g: Record<string, unknown>) => new Set(Object.keys(g).map((k) => k.split('/').pop()!));
const photos = files(import.meta.glob('../../public/img/*.webp', { query: '?url', import: 'default' }));
const thumbs = files(import.meta.glob('../../public/img/t/*.webp', { query: '?url', import: 'default' }));

describe('categoria Lanches para Congelar', () => {
  it('existe, com 16 receitas numeradas de 416 a 431 e ids únicos', () => {
    expect(getCategory(CAT)?.name).toMatch(/Lanches/);
    expect(lanches).toHaveLength(16);
    expect(lanches.map((r) => r.n).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => 416 + i),
    );
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
  it('cada lanche tem foto, miniatura, calorias, preparo e congelamento próprios', () => {
    for (const r of lanches) {
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

describe('freezer: lanches usam o prazo da própria receita', () => {
  it('freezeRuleFor devolve meses, aviso e reaquecimento da receita', () => {
    for (const r of lanches) {
      const rule = freezeRuleFor(r);
      expect(rule.months).toBe(r.freeze!.months);
      expect(rule.verdict).toBe(r.freeze!.verdict);
      expect(rule.note).toBe(r.freeze!.how);
      expect(rule.serve).toBe(r.freeze!.serve);
      expect(rule.reheat).toBe(r.freeze!.reheat);
    }
  });
  it('prazos conservadores (1 a 3 meses)', () => {
    for (const r of lanches) {
      expect(r.freeze!.months).toBeGreaterThanOrEqual(1);
      expect(r.freeze!.months).toBeLessThanOrEqual(3);
    }
  });
  it('sem freeze próprio, cai na regra da categoria', () => {
    const base = lanches[0];
    const rule = freezeRuleFor({ cat: base.cat, title: base.title });
    expect(rule.months).toBe(2);
    expect(rule.note.length).toBeGreaterThan(10);
  });
});

describe('lista de compras dos lanches', () => {
  it('nenhum ingrediente cai em "Outros"', () => {
    const out: string[] = [];
    for (const r of lanches)
      for (const line of r.items)
        for (const p of parseLine(line)) if (classify(p.key) === 'outros') out.push(`${r.id}: ${p.key}`);
    expect(out).toEqual([]);
  });
  it('pão e baguete vão para a padaria', () => {
    expect(classify('baguete integral')).toBe('padaria');
    expect(classify('pao integral')).toBe('padaria');
  });
});
