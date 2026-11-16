import { describe, expect, it } from 'vitest';
import { RECIPES, getRecipe } from '../data';
import {
  SLOTS,
  addTo,
  cleanPlan,
  clearWeek,
  dayKcal,
  generateWeek,
  recipesIn,
  removeFrom,
  weekDays,
  weekRecipeCounts,
  type Plan,
} from './planner';

const W = '2026-11-16'; // segunda

describe('planner: editar', () => {
  it('adiciona sem repetir e remove limpando o dia vazio', () => {
    let p: Plan = {};
    p = addTo(p, W, 'almoco', 'a');
    p = addTo(p, W, 'almoco', 'a');
    p = addTo(p, W, 'almoco', 'b');
    expect(recipesIn(p, W, 'almoco')).toEqual(['a', 'b']);
    p = removeFrom(p, W, 'almoco', 'a');
    p = removeFrom(p, W, 'almoco', 'b');
    expect(p).toEqual({});
  });
  it('limita a 4 receitas por refeição', () => {
    let p: Plan = {};
    for (const id of ['a', 'b', 'c', 'd', 'e']) p = addTo(p, W, 'lanche', id);
    expect(recipesIn(p, W, 'lanche')).toHaveLength(4);
  });
  it('limpa só a semana pedida', () => {
    let p: Plan = {};
    p = addTo(p, W, 'jantar', 'a');
    p = addTo(p, '2026-11-24', 'jantar', 'b');
    expect(Object.keys(clearWeek(p, W))).toEqual(['2026-11-24']);
  });
  it('conta as receitas da semana', () => {
    let p: Plan = {};
    p = addTo(p, W, 'almoco', 'a');
    p = addTo(p, '2026-11-17', 'almoco', 'a');
    p = addTo(p, '2026-11-18', 'jantar', 'b');
    expect([...weekRecipeCounts(p, W)]).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect([...weekRecipeCounts(p, W, '2026-11-18')]).toEqual([['b', 1]]);
  });
  it('soma as calorias do dia', () => {
    const r = RECIPES[0];
    let p: Plan = {};
    p = addTo(p, W, 'almoco', r.id);
    p = addTo(p, W, 'jantar', r.id);
    expect(dayKcal(p, W, getRecipe)).toBe(r.kcal * 2);
  });
  it('aceita só dados bem formados e esquece o que é muito antigo', () => {
    const p = cleanPlan(
      {
        '2026-11-16': { almoco: ['a', 7, 'b'], lixo: ['x'], jantar: [] },
        '2020-01-01': { almoco: ['velho'] },
        amanhã: { almoco: ['x'] },
      },
      '2026-11-16',
    );
    expect(p).toEqual({ '2026-11-16': { almoco: ['a', 'b'] } });
    expect(cleanPlan(null)).toEqual({});
  });
});

describe('planner: cardápio automático', () => {
  const base = { weekStart: W, recipes: RECIPES };

  it('preenche a semana inteira, sem repetir receita', () => {
    const { plan, added } = generateWeek({}, { ...base, goal: 'equilibrado' });
    const counts = weekRecipeCounts(plan, W);
    expect(added).toBe(counts.size);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    for (const d of weekDays(W)) {
      for (const s of SLOTS) expect(recipesIn(plan, d, s.id).length, `${d} ${s.id}`).toBeGreaterThan(0);
      expect(recipesIn(plan, d, 'almoco')).toHaveLength(2); // principal + acompanhamento
    }
  });
  it('é repetível e muda com a variação', () => {
    const a = generateWeek({}, { ...base, goal: 'equilibrado' }).plan;
    const b = generateWeek({}, { ...base, goal: 'equilibrado' }).plan;
    const c = generateWeek({}, { ...base, goal: 'equilibrado', variation: 1 }).plan;
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
  it('nunca troca o que a pessoa já escolheu', () => {
    const chosen = RECIPES[10].id;
    const start = addTo({}, W, 'almoco', chosen);
    const { plan } = generateWeek(start, { ...base, goal: 'equilibrado' });
    expect(recipesIn(plan, W, 'almoco')).toEqual([chosen]);
  });
  it('não preenche dias que já passaram', () => {
    const { plan } = generateWeek({}, { ...base, goal: 'equilibrado', fromDate: '2026-11-19' });
    expect(Object.keys(plan).sort()).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  });
  it('"mais leve" respeita o teto de calorias', () => {
    const { plan } = generateWeek({}, { ...base, goal: 'leve' });
    for (const d of weekDays(W)) {
      for (const id of recipesIn(plan, d, 'almoco').slice(0, 1))
        expect(getRecipe(id)!.kcal).toBeLessThanOrEqual(320);
      for (const id of recipesIn(plan, d, 'cafe')) expect(getRecipe(id)!.kcal).toBeLessThanOrEqual(220);
    }
  });
  it('"rápido" só usa receitas de até 30 minutos', () => {
    const { plan } = generateWeek({}, { ...base, goal: 'rapido' });
    for (const [id] of weekRecipeCounts(plan, W)) {
      const r = getRecipe(id)!;
      expect(r.timeMin, r.title).not.toBeNull();
      expect(r.timeMin!, r.title).toBeLessThanOrEqual(30);
    }
  });
  it('favoritas aparecem com mais frequência', () => {
    const favs = RECIPES.filter((r) => r.cat === 'aves').map((r) => r.id);
    const withFav = generateWeek({}, { ...base, goal: 'equilibrado', favorites: favs }).plan;
    const n = [...weekRecipeCounts(withFav, W).keys()].filter((id) => favs.includes(id)).length;
    expect(n).toBeGreaterThan(0);
  });
});
