import { describe, expect, it } from 'vitest';
import { RECIPES, getCategory, recipesOf } from '../data';
import { classify, parseLine } from './shopping';
import { freezeRuleFor } from './freezer';
import { generateWeek } from './planner';

const CAT = 'marinadas-rapidas-e-saudaveis';
const todas = recipesOf(CAT);

const files = (g: Record<string, unknown>) => new Set(Object.keys(g).map((k) => k.split('/').pop()!));
const photos = files(import.meta.glob('../../public/img/*.webp', { query: '?url', import: 'default' }));
const thumbs = files(import.meta.glob('../../public/img/t/*.webp', { query: '?url', import: 'default' }));

describe('categoria Marinadas Rápidas e Saudáveis', () => {
  it('5 receitas numeradas de 502 a 506, em "Bases e acompanhamentos"', () => {
    expect(getCategory(CAT)?.name).toBe('Marinadas Rápidas e Saudáveis');
    expect(getCategory(CAT)?.section).toBe('Bases e acompanhamentos');
    expect(todas.map((r) => r.n).sort((a, b) => a - b)).toEqual([502, 503, 504, 505, 506]);
  });
  it('ids e números únicos no app inteiro', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.n)).size).toBe(RECIPES.length);
  });
  it('não repete as marinadas que o app já tinha (nº 471 a 477)', () => {
    const titulos = todas.map((r) => r.title);
    expect(titulos).toEqual([
      'Marinada de Limão, Alho e Salsinha',
      'Marinada de Mostarda Dijon e Ervas Finas',
      'Marinada Cremosa de Curry',
      'Marinada Picante de Páprica e Limão',
      'Marinada de Tahine com Alho',
    ]);
    const antigas = RECIPES.filter((r) => r.n >= 471 && r.n <= 477).map((r) => r.title);
    for (const t of titulos) expect(antigas).not.toContain(t);
  });
  it('cada receita tem foto, miniatura, calorias, preparo, dica e congelamento próprios', () => {
    for (const r of todas) {
      expect(photos.has(`${r.img}.webp`), `${r.id} foto`).toBe(true);
      expect(thumbs.has(`${r.img}.webp`), `${r.id} miniatura`).toBe(true);
      expect(r.kcal, `${r.id} kcal`).toBeGreaterThan(0);
      expect(r.items.length, `${r.id} ingredientes`).toBeGreaterThanOrEqual(5);
      expect(r.steps.length, `${r.id} passos`).toBeGreaterThanOrEqual(3);
      expect(r.tip, `${r.id} dica`).toBeTruthy();
      expect(r.rende, `${r.id} rendimento`).not.toBeNull();
      expect(r.freeze, `${r.id} freeze`).toBeDefined();
      expect(r.freeze!.how.length).toBeGreaterThan(20);
      expect(r.freeze!.reheat.length).toBeGreaterThan(10);
    }
  });
  it('calorias são só da marinada e o tamanho da porção diz isso', () => {
    for (const r of todas) expect(r.portion, `${r.id} porção`).toMatch(/da marinada, sem contar/);
    expect(todas.find((r) => r.n === 506)!.portion).toMatch(/^½ da marinada/);
    expect(todas.find((r) => r.n === 506)!.rende!.n).toBe(2);
  });
});

describe('freezer: Marinadas Rápidas usa o prazo da própria receita', () => {
  it('freezeRuleFor devolve meses, aviso e como servir da receita', () => {
    for (const r of todas) {
      const rule = freezeRuleFor(r);
      expect(rule.months).toBe(r.freeze!.months);
      expect(rule.verdict).toBe(r.freeze!.verdict);
      expect(rule.note).toBe(r.freeze!.how);
      expect(rule.serve).toBe(r.freeze!.serve);
    }
  });
  it('prazos conservadores (1 a 3 meses) e descongelar na geladeira', () => {
    for (const r of todas) {
      expect(r.freeze!.months).toBeGreaterThanOrEqual(1);
      expect(r.freeze!.months).toBeLessThanOrEqual(3);
      expect(r.freeze!.serve).toBe('thaw');
    }
  });
  it('com proteína crua 2 a 3 meses; a de legumes e a de tahine só 1 mês, com cuidado', () => {
    const ok = todas.filter((r) => r.freeze!.verdict === 'ok');
    expect(ok.map((r) => r.n)).toEqual([503, 504, 505]);
    for (const r of ok) expect([2, 3]).toContain(r.freeze!.months);
    const caution = todas.filter((r) => r.freeze!.verdict === 'caution');
    expect(caution.map((r) => r.n)).toEqual([502, 506]);
    for (const r of caution) expect(r.freeze!.months).toBe(1);
  });
  it('legumes crus e o tahine têm aviso próprio', () => {
    expect(todas.find((r) => r.n === 502)!.freeze!.how).toMatch(/Legumes crus soltam água/);
    expect(todas.find((r) => r.n === 506)!.freeze!.how).toMatch(/tahine se separa/i);
  });
});

describe('lista de compras das Marinadas Rápidas', () => {
  it('nenhum ingrediente cai em "Outros"', () => {
    const out: string[] = [];
    for (const r of todas)
      for (const line of r.items)
        for (const p of parseLine(line)) if (classify(p.key) === 'outros') out.push(`${r.id}: ${p.key}`);
    expect(out).toEqual([]);
  });
});

describe('cardápio automático', () => {
  it('não sugere marinadas como refeição (assim como as outras marinadas do app)', () => {
    const ids = new Set(todas.map((r) => r.id));
    const achou: string[] = [];
    for (let v = 0; v < 20; v++) {
      const { plan } = generateWeek({}, { weekStart: '2026-11-16', goal: 'equilibrado', recipes: RECIPES, variation: v });
      for (const day of Object.values(plan))
        for (const [slot, list] of Object.entries(day)) for (const id of list) if (ids.has(id)) achou.push(`${slot}:${id}`);
    }
    expect(achou).toEqual([]);
  });
});
