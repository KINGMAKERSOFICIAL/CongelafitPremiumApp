import { describe, expect, it } from 'vitest';
import {
  addOne,
  cleanFreezer,
  consumeOne,
  defaultPortions,
  expiryOf,
  freezeRuleFor,
  RULES_BY_CAT,
  sortFifo,
  statusOf,
  statusText,
  summarize,
  unitFor,
  type FreezerItem,
} from './freezer';
import { CATEGORIES, RECIPES } from '../data';

const item = (o: Partial<FreezerItem>): FreezerItem => ({
  id: 'x',
  recipeId: null,
  name: 'Lasanha',
  portions: 4,
  unit: 'porção',
  frozenOn: '2026-11-16',
  months: 3,
  note: '',
  ...o,
});

describe('freezer: prazos e status', () => {
  it('calcula a validade em meses de calendário', () => {
    expect(expiryOf(item({ frozenOn: '2026-11-16', months: 3 }))).toBe('2027-02-16');
    expect(expiryOf(item({ frozenOn: '2026-11-30', months: 3 }))).toBe('2027-02-28');
  });
  it('classifica no prazo / consumir logo / passou do prazo', () => {
    const it3 = item({ frozenOn: '2026-11-16', months: 3 }); // vence 2027-02-16
    expect(statusOf(it3, '2026-11-16')).toBe('ok');
    expect(statusOf(it3, '2027-01-31')).toBe('ok'); // faltam 16 dias
    expect(statusOf(it3, '2027-02-02')).toBe('soon'); // faltam 14 dias
    expect(statusOf(it3, '2027-02-16')).toBe('soon'); // vence hoje ainda vale
    expect(statusOf(it3, '2027-02-17')).toBe('expired');
  });
  it('prazo curto (1 mês) avisa antes, proporcional', () => {
    const it1 = item({ frozenOn: '2026-11-01', months: 1 }); // vence 2026-12-01
    expect(statusOf(it1, '2026-11-20')).toBe('ok');
    expect(statusOf(it1, '2026-11-25')).toBe('soon');
  });
  it('descreve o prazo em português', () => {
    const it3 = item({ frozenOn: '2026-11-16', months: 3 });
    expect(statusText(it3, '2027-02-16')).toBe('vence hoje');
    expect(statusText(it3, '2027-02-15')).toBe('vence amanhã');
    expect(statusText(it3, '2027-02-20')).toBe('passou do prazo há 4 dias');
  });
  it('ordena por validade (o que vence primeiro sai primeiro)', () => {
    const a = item({ id: 'a', name: 'A', frozenOn: '2026-11-10', months: 3 });
    const b = item({ id: 'b', name: 'B', frozenOn: '2026-10-01', months: 1 });
    const c = item({ id: 'c', name: 'C', frozenOn: '2026-10-01', months: 3 });
    expect(sortFifo([a, c, b]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('resume o freezer', () => {
    const list = [
      item({ id: '1', portions: 4, frozenOn: '2026-11-16', months: 3 }),
      item({ id: '2', portions: 2, frozenOn: '2026-06-01', months: 3 }),
      item({ id: '3', portions: 1, frozenOn: '2026-09-01', months: 3 }),
    ];
    expect(summarize(list, '2026-12-01')).toEqual({ items: 3, portions: 7, soon: 1, expired: 1 });
  });
});

describe('freezer: porções', () => {
  it('tira uma porção e some quando zera', () => {
    const l = [item({ id: 'a', portions: 2 }), item({ id: 'b', portions: 1 })];
    expect(consumeOne(l, 'a')[0].portions).toBe(1);
    expect(consumeOne(l, 'b').map((x) => x.id)).toEqual(['a']);
  });
  it('soma uma porção com teto de 99', () => {
    expect(addOne([item({ portions: 3 })], 'x')[0].portions).toBe(4);
    expect(addOne([item({ portions: 99 })], 'x')[0].portions).toBe(99);
  });
  it('sugere porções e unidade pela receita', () => {
    expect(defaultPortions({ basis: 'porção', rende: { n: 4 } })).toBe(4);
    expect(defaultPortions({ basis: 'colher', rende: { n: 20 } })).toBe(1);
    expect(defaultPortions({ basis: 'unidade', rende: null })).toBe(1);
    expect(unitFor('colher')).toBe('pote');
  });
});

describe('freezer: dados salvos', () => {
  it('descarta itens malformados e corrige limites', () => {
    const out = cleanFreezer([
      { id: 'ok', name: 'Sopa', portions: 500, frozenOn: '2026-11-01', months: 99, unit: 'pote' },
      { id: 'sem-data', name: 'x', portions: 1, months: 1 },
      { id: 2, name: 'x' },
      null,
      'texto',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'ok',
      portions: 99,
      months: 12,
      unit: 'pote',
      recipeId: null,
      note: '',
    });
    expect(cleanFreezer('lixo')).toEqual([]);
  });
});

describe('freezer: regras por receita', () => {
  it('toda categoria do livro tem regra própria', () => {
    for (const c of CATEGORIES) expect(RULES_BY_CAT[c.id], c.id).toBeDefined();
  });
  it('prazos conservadores e dentro do esperado', () => {
    for (const r of RECIPES) {
      const rule = freezeRuleFor(r);
      expect(rule.months).toBeGreaterThanOrEqual(1);
      expect(rule.months).toBeLessThanOrEqual(3);
      expect(rule.note.length).toBeGreaterThan(10);
    }
  });
  it('maionese caseira e salada crua não são indicadas para congelar', () => {
    const get = (title: string) => RECIPES.find((r) => r.title === title)!;
    expect(freezeRuleFor(get('Maionese de Abacate')).verdict).toBe('no');
    expect(freezeRuleFor(get('Salada Grega')).verdict).toBe('no');
    expect(freezeRuleFor(get('Molho Vinagrete para Saladas')).verdict).toBe('no');
    expect(freezeRuleFor(get('Molho Pesto')).verdict).toBe('ok');
    expect(freezeRuleFor(get('Patê de Atum')).verdict).toBe('caution');
    expect(freezeRuleFor(get('Lasanha Low Carb de Frango')).verdict).toBe('ok');
  });
});
