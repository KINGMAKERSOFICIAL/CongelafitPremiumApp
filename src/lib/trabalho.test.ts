import { describe, expect, it } from 'vitest';
import { RECIPES, getCategory, recipesOf } from '../data';
import { classify, parseLine } from './shopping';
import { freezeRuleFor } from './freezer';
import { generateWeek } from './planner';

const CAT = 'lanches-para-levar-no-trabalho';
const todas = recipesOf(CAT);

const files = (g: Record<string, unknown>) => new Set(Object.keys(g).map((k) => k.split('/').pop()!));
const photos = files(import.meta.glob('../../public/img/*.webp', { query: '?url', import: 'default' }));
const thumbs = files(import.meta.glob('../../public/img/t/*.webp', { query: '?url', import: 'default' }));

describe('categoria Lanches para Levar no Trabalho', () => {
  it('22 receitas numeradas de 480 a 501, em "Café da manhã e lanches"', () => {
    expect(getCategory(CAT)?.name).toBe('Lanches para Levar no Trabalho');
    expect(getCategory(CAT)?.section).toBe('Café da manhã e lanches');
    expect(todas.map((r) => r.n).sort((a, b) => a - b)).toEqual(Array.from({ length: 22 }, (_, i) => 480 + i));
  });
  it('ids e números únicos no app inteiro', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(new Set(RECIPES.map((r) => r.n)).size).toBe(RECIPES.length);
  });
  it('cada receita tem foto, miniatura, calorias, preparo, dica e congelamento próprios', () => {
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
  it('só a massa de pizza e os chips têm tamanho de porção explícito', () => {
    expect(todas.filter((r) => r.portion).map((r) => `${r.title}: ${r.portion}`)).toEqual([
      'Massa de Pizza sem Carboidrato: 1 fatia (só a massa)',
      'Chips de Batata-Doce Assados: cerca de 35 g',
    ]);
  });
});

describe('freezer: Lanches para Levar no Trabalho usa o prazo da própria receita', () => {
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
  it('salgados e bolinhos congelam 2 a 3 meses; wraps, sanduíches e potes só 1 mês, com cuidado', () => {
    const ok = todas.filter((r) => r.freeze!.verdict === 'ok');
    expect(ok.map((r) => r.n)).toEqual([480, 481, 482, 483, 484, 485, 486, 487, 488]);
    for (const r of ok) expect([2, 3]).toContain(r.freeze!.months);
    const caution = todas.filter((r) => r.freeze!.verdict === 'caution');
    expect(caution.map((r) => r.n)).toEqual([490, 491, 492, 493, 494, 495, 497, 498, 499, 501]);
    for (const r of caution) expect(r.freeze!.months).toBe(1);
  });
  it('o que não congela: chips, sanduíche de ricota e potinho de iogurte', () => {
    expect(todas.filter((r) => r.freeze!.verdict === 'no').map((r) => r.title)).toEqual([
      'Chips de Batata-Doce Assados',
      'Sanduíche Natural de Ricota com Espinafre',
      'Potinho de Iogurte com Granola e Frutas',
    ]);
  });
  it('pesto avisa do risco de botulismo e a salada no pote congela só a base', () => {
    const pesto = todas.find((r) => r.title === 'Sanduíche Natural de Frango com Pesto')!;
    const texto = `${pesto.freeze!.how} ${pesto.freeze!.reheat} ${pesto.tip}`;
    expect(texto).toMatch(/pesto/i);
    const pote = todas.find((r) => r.title === 'Salada no Pote de Quinoa e Grão-de-Bico')!;
    expect(pote.freeze!.how).toMatch(/só a quinoa e o grão-de-bico/);
    expect(pote.freeze!.how).toMatch(/sem o molho e sem os vegetais/);
  });
});

describe('lista de compras dos Lanches para Levar no Trabalho', () => {
  it('nenhum ingrediente cai em "Outros"', () => {
    const out: string[] = [];
    for (const r of todas)
      for (const line of r.items)
        for (const p of parseLine(line)) if (classify(p.key) === 'outros') out.push(`${r.id}: ${p.key}`);
    expect(out).toEqual([]);
  });
});

describe('cardápio automático com os lanches do trabalho', () => {
  it('sugere esses lanches no slot de lanche, nunca no café, almoço ou jantar', () => {
    const ids = new Set(todas.map((r) => r.id));
    const noLanche: string[] = [];
    let emLanche = 0;
    for (let v = 0; v < 20; v++) {
      const { plan } = generateWeek({}, { weekStart: '2026-11-16', goal: 'equilibrado', recipes: RECIPES, variation: v });
      for (const day of Object.values(plan))
        for (const [slot, list] of Object.entries(day))
          for (const id of list) {
            if (!ids.has(id)) continue;
            if (slot === 'lanche') emLanche++;
            else noLanche.push(`${slot}:${id}`);
          }
    }
    expect(noLanche).toEqual([]);
    expect(emLanche).toBeGreaterThan(0);
  });
});
