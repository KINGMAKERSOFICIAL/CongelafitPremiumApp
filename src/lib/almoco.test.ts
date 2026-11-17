import { describe, expect, it } from 'vitest';
import { RECIPES, getCategory, recipesOf } from '../data';
import { classify, parseLine } from './shopping';
import { freezeRuleFor } from './freezer';
import { generateWeek } from './planner';

const PRATOS = 'almoco-para-congelar';
const BASES = 'molhos-marinadas-e-temperos-para-congelar';
const pratos = recipesOf(PRATOS);
const bases = recipesOf(BASES);
const todas = [...pratos, ...bases];

const files = (g: Record<string, unknown>) => new Set(Object.keys(g).map((k) => k.split('/').pop()!));
const photos = files(import.meta.glob('../../public/img/*.webp', { query: '?url', import: 'default' }));
const thumbs = files(import.meta.glob('../../public/img/t/*.webp', { query: '?url', import: 'default' }));

const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

describe('categorias do Almoço para Congelar', () => {
  it('pratos: 15 receitas numeradas de 450 a 464, em "Almoço e jantar"', () => {
    expect(getCategory(PRATOS)?.name).toBe('Almoço para Congelar');
    expect(getCategory(PRATOS)?.section).toBe('Almoço e jantar');
    expect(pratos.map((r) => r.n).sort((a, b) => a - b)).toEqual(range(450, 15));
  });
  it('molhos, marinadas e temperos: 15 receitas numeradas de 465 a 479, em "Bases e acompanhamentos"', () => {
    expect(getCategory(BASES)?.name).toBe('Molhos, Marinadas e Temperos para Congelar');
    expect(getCategory(BASES)?.section).toBe('Bases e acompanhamentos');
    expect(bases.map((r) => r.n).sort((a, b) => a - b)).toEqual(range(465, 15));
  });
  it('ids únicos no app inteiro e numeração sem repetição', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.n)).size).toBe(RECIPES.length);
  });
  it('cada receita tem foto, miniatura, calorias, preparo e congelamento próprios', () => {
    for (const r of todas) {
      expect(photos.has(`${r.img}.webp`), `${r.id} foto`).toBe(true);
      expect(thumbs.has(`${r.img}.webp`), `${r.id} miniatura`).toBe(true);
      expect(r.kcal, `${r.id} kcal`).toBeGreaterThan(0);
      expect(r.items.length, `${r.id} ingredientes`).toBeGreaterThanOrEqual(2);
      expect(r.steps.length, `${r.id} passos`).toBeGreaterThanOrEqual(2);
      expect(r.tip, `${r.id} dica`).toBeTruthy();
      expect(r.rende, `${r.id} rendimento`).not.toBeNull();
      expect(r.freeze, `${r.id} freeze`).toBeDefined();
      expect(r.freeze!.how.length).toBeGreaterThan(20);
      expect(r.freeze!.reheat.length).toBeGreaterThan(10);
    }
  });
  it('marinadas explicam que a porção não conta a proteína', () => {
    const marinadas = bases.filter((r) => /^Marinada/.test(r.title));
    expect(marinadas).toHaveLength(7);
    for (const r of marinadas) expect(r.portion).toMatch(/sem contar a proteína/);
  });
});

describe('freezer: Almoço usa o prazo da própria receita', () => {
  it('freezeRuleFor devolve meses, aviso e como servir da receita', () => {
    for (const r of todas) {
      const rule = freezeRuleFor(r);
      expect(rule.months).toBe(r.freeze!.months);
      expect(rule.verdict).toBe(r.freeze!.verdict);
      expect(rule.note).toBe(r.freeze!.how);
      expect(rule.serve).toBe(r.freeze!.serve);
    }
  });
  it('prazos conservadores (1 a 3 meses)', () => {
    for (const r of todas) {
      expect(r.freeze!.months).toBeGreaterThanOrEqual(1);
      expect(r.freeze!.months).toBeLessThanOrEqual(3);
    }
  });
  it('receitas delicadas ficam "com cuidado" (1 mês, ou 2 no strogonoff) e as que não congelam, "não"', () => {
    const caution = todas.filter((r) => r.freeze!.verdict === 'caution').map((r) => r.title);
    expect(caution).toEqual([
      'Strogonoff de Frango Light',
      'Salada de Grão-de-Bico com Atum',
      'Molho de Abacate e Coentro',
      'Molho de Iogurte com Alho e Limão',
    ]);
    const no = todas.filter((r) => r.freeze!.verdict === 'no').map((r) => r.title);
    expect(no).toEqual(['Espaguete de Abobrinha com Molho Pesto', 'Tempero Pronto de Ervas']);
    const one = todas.filter((r) => r.freeze!.months === 1).map((r) => r.title);
    expect(one).toEqual([
      'Salada de Grão-de-Bico com Atum',
      'Espaguete de Abobrinha com Molho Pesto',
      'Molho de Abacate e Coentro',
      'Molho de Iogurte com Alho e Limão',
      'Tempero Pronto de Ervas',
    ]);
  });
  it('o que leva laticínio ou farinha só entra depois de descongelar', () => {
    const strog = pratos.find((r) => r.title === 'Strogonoff de Frango Light')!;
    expect(strog.freeze!.how).toMatch(/sem o creme de leite/);
    expect(strog.freeze!.reheat).toMatch(/creme de leite/);
    const tropeiro = pratos.find((r) => r.title === 'Feijão Tropeiro com Frango')!;
    expect(tropeiro.freeze!.how).toMatch(/sem a farinha de mandioca/);
  });
  it('alho com azeite só fica congelado (risco de botulismo fora do freezer)', () => {
    const alho = bases.find((r) => r.title === 'Alho Congelado em Cubos')!;
    expect(alho.freeze!.how).toMatch(/botulismo/);
    expect(alho.freeze!.how).toMatch(/4 dias/);
  });
});

describe('lista de compras do Almoço', () => {
  it('nenhum ingrediente cai em "Outros"', () => {
    const out: string[] = [];
    for (const r of todas)
      for (const line of r.items)
        for (const p of parseLine(line)) if (classify(p.key) === 'outros') out.push(`${r.id}: ${p.key}`);
    expect(out).toEqual([]);
  });
  it('proteínas vão para o açougue/peixaria, não para "Outros"', () => {
    const frango = pratos.find((r) => r.title === 'Frango ao Curry com Legumes')!;
    const peito = frango.items.flatMap((l) => parseLine(l)).find((p) => /frango/.test(p.key))!;
    expect(classify(peito.key)).not.toBe('outros');
    const salmao = pratos.find((r) => r.title === 'Salmão Grelhado com Legumes ao Vapor')!;
    const s = salmao.items.flatMap((l) => parseLine(l)).find((p) => /salmao/.test(p.key))!;
    expect(classify(s.key)).not.toBe('outros');
  });
});

describe('cardápio automático com o Almoço', () => {
  it('sugere pratos do almoço como prato principal, nunca molho, marinada ou tempero', () => {
    const baseIds = new Set(bases.map((r) => r.id));
    const seen = new Set<string>();
    for (let v = 0; v < 12; v++) {
      const { plan } = generateWeek({}, { weekStart: '2026-11-16', goal: 'equilibrado', recipes: RECIPES, variation: v });
      for (const day of Object.values(plan)) for (const ids of Object.values(day)) for (const id of ids) seen.add(id);
    }
    for (const id of seen) expect(baseIds.has(id), id).toBe(false);
    expect(pratos.some((r) => seen.has(r.id))).toBe(true);
  });
});
