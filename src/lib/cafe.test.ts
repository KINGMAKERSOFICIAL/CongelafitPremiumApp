import { describe, expect, it } from 'vitest';
import { RECIPES, getCategory, recipesOf } from '../data';
import { classify, parseLine } from './shopping';
import { freezeRuleFor } from './freezer';

const CAT = 'cafe-da-manha-para-congelar';
const cafe = recipesOf(CAT);

const files = (g: Record<string, unknown>) => new Set(Object.keys(g).map((k) => k.split('/').pop()!));
const photos = files(import.meta.glob('../../public/img/*.webp', { query: '?url', import: 'default' }));
const thumbs = files(import.meta.glob('../../public/img/t/*.webp', { query: '?url', import: 'default' }));

describe('categoria Café da Manhã para Congelar', () => {
  it('existe, com 19 receitas numeradas de 397 a 415 e ids únicos', () => {
    expect(getCategory(CAT)?.name).toBe('Café da Manhã para Congelar');
    expect(getCategory(CAT)?.section).toBe('Café da manhã e lanches');
    expect(cafe).toHaveLength(19);
    expect(cafe.map((r) => r.n).sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, i) => 397 + i));
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
  it('cada receita tem foto, miniatura, calorias, preparo e congelamento próprios', () => {
    for (const r of cafe) {
      expect(photos.has(`${r.img}.webp`), `${r.id} foto`).toBe(true);
      expect(thumbs.has(`${r.img}.webp`), `${r.id} miniatura`).toBe(true);
      expect(r.kcal, `${r.id} kcal`).toBeGreaterThan(0);
      expect(r.items.length, `${r.id} ingredientes`).toBeGreaterThanOrEqual(3);
      expect(r.steps.length, `${r.id} passos`).toBeGreaterThanOrEqual(3);
      expect(r.tip, `${r.id} dica`).toBeTruthy();
      expect(r.freeze, `${r.id} freeze`).toBeDefined();
      expect(r.freeze!.how.length).toBeGreaterThan(20);
      expect(r.freeze!.reheat.length).toBeGreaterThan(10);
    }
  });
});

describe('freezer: café da manhã usa o prazo da própria receita', () => {
  it('freezeRuleFor devolve meses, aviso e como servir da receita', () => {
    for (const r of cafe) {
      const rule = freezeRuleFor(r);
      expect(rule.months).toBe(r.freeze!.months);
      expect(rule.verdict).toBe(r.freeze!.verdict);
      expect(rule.note).toBe(r.freeze!.how);
      expect(rule.serve).toBe(r.freeze!.serve);
    }
  });
  it('prazos conservadores (1 a 3 meses) e receitas delicadas marcadas "com cuidado"', () => {
    for (const r of cafe) {
      expect(r.freeze!.months).toBeGreaterThanOrEqual(1);
      expect(r.freeze!.months).toBeLessThanOrEqual(3);
    }
    const caution = cafe.filter((r) => r.freeze!.verdict === 'caution').map((r) => r.title);
    expect(caution).toEqual([
      'Crepioca de Ricota e Espinafre',
      'Tapioca com Creme de Ricota e Mel',
      'Wrap de Frango com Abacate',
      'Wrap de Ovo Mexido e Tomate',
      'Overnight Oats de Chia e Frutas',
      'Pudim de Chia com Cacau',
      'Chia Pudding de Manga',
      'Iogurte Grego com Granola e Frutas',
    ]);
    for (const r of cafe.filter((x) => x.freeze!.verdict === 'caution')) expect(r.freeze!.months).toBe(1);
    expect(cafe.filter((r) => r.freeze!.months === 3).map((r) => r.title)).toEqual([
      'Muffins de Banana e Nozes',
      'Muffin de Abóbora e Canela',
      'Barras de Granola Caseira',
      'Barra de Proteína Caseira',
      'Smoothie Packs para Café da Manhã',
    ]);
  });
});

describe('lista de compras do café da manhã', () => {
  it('nenhum ingrediente cai em "Outros"', () => {
    const out: string[] = [];
    for (const r of cafe)
      for (const line of r.items)
        for (const p of parseLine(line)) if (classify(p.key) === 'outros') out.push(`${r.id}: ${p.key}`);
    expect(out).toEqual([]);
  });
  it('wraps vão para a padaria', () => {
    const wrap = cafe.find((r) => r.title === 'Wrap de Frango com Abacate')!;
    const keys = wrap.items.flatMap((l) => parseLine(l)).filter((p) => /wrap/.test(p.key));
    expect(keys.length).toBeGreaterThan(0);
    for (const p of keys) expect(classify(p.key)).toBe('padaria');
  });
});
