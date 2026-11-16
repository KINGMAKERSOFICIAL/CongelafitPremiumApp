/**
 * Planner semanal: o que comer em cada refeição, com cardápio automático.
 * O plano é um mapa "dia → refeição → receitas" guardado no aparelho.
 */
import { addDays, isISO } from './dates';
import type { Recipe } from '../types';

export const PLAN_KEY = 'plan';

export type Slot = 'cafe' | 'almoco' | 'lanche' | 'jantar';

export const SLOTS: { id: Slot; name: string }[] = [
  { id: 'cafe', name: 'Café da manhã' },
  { id: 'almoco', name: 'Almoço' },
  { id: 'lanche', name: 'Lanche' },
  { id: 'jantar', name: 'Jantar' },
];

export type Plan = Record<string, Partial<Record<Slot, string[]>>>;

export const MAX_PER_SLOT = 4;

const isSlot = (s: string): s is Slot => SLOTS.some((x) => x.id === s);

export function recipesIn(plan: Plan, date: string, slot: Slot): string[] {
  return plan[date]?.[slot] ?? [];
}

export function addTo(plan: Plan, date: string, slot: Slot, recipeId: string): Plan {
  const cur = recipesIn(plan, date, slot);
  if (cur.includes(recipeId) || cur.length >= MAX_PER_SLOT) return plan;
  return { ...plan, [date]: { ...plan[date], [slot]: [...cur, recipeId] } };
}

export function removeFrom(plan: Plan, date: string, slot: Slot, recipeId: string): Plan {
  const next = recipesIn(plan, date, slot).filter((x) => x !== recipeId);
  const day = { ...plan[date] };
  if (next.length) day[slot] = next;
  else delete day[slot];
  const out = { ...plan };
  if (Object.keys(day).length) out[date] = day;
  else delete out[date];
  return out;
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function clearWeek(plan: Plan, weekStart: string): Plan {
  const days = new Set(weekDays(weekStart));
  return Object.fromEntries(Object.entries(plan).filter(([d]) => !days.has(d)));
}

/** Quantas vezes cada receita aparece nos dias da semana (a partir de `fromDate`). */
export function weekRecipeCounts(plan: Plan, weekStart: string, fromDate?: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of weekDays(weekStart)) {
    if (fromDate && d < fromDate) continue;
    for (const slot of SLOTS)
      for (const id of recipesIn(plan, d, slot.id)) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

export function dayKcal(plan: Plan, date: string, get: (id: string) => Recipe | undefined): number {
  let kcal = 0;
  for (const slot of SLOTS) for (const id of recipesIn(plan, date, slot.id)) kcal += get(id)?.kcal ?? 0;
  return kcal;
}

/** Aceita só o que está bem formado e apaga dias muito antigos (mantém o aparelho leve). */
export function cleanPlan(input: unknown, today?: string): Plan {
  const out: Plan = {};
  if (!input || typeof input !== 'object') return out;
  const oldest = today ? addDays(today, -90) : '';
  for (const [date, day] of Object.entries(input as Record<string, unknown>)) {
    if (!isISO(date) || date < oldest || !day || typeof day !== 'object') continue;
    const d: Partial<Record<Slot, string[]>> = {};
    for (const [slot, ids] of Object.entries(day as Record<string, unknown>)) {
      if (!isSlot(slot) || !Array.isArray(ids)) continue;
      const list = ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_PER_SLOT);
      if (list.length) d[slot] = list;
    }
    if (Object.keys(d).length) out[date] = d;
  }
  return out;
}

/* ───────── cardápio automático ───────── */

export type Goal = 'equilibrado' | 'leve' | 'rapido';

export const GOALS: { id: Goal; name: string; hint: string }[] = [
  { id: 'equilibrado', name: 'Equilibrado', hint: 'Variedade de pratos e categorias' },
  { id: 'leve', name: 'Mais leve', hint: 'Receitas com menos calorias por porção' },
  { id: 'rapido', name: 'Rápido', hint: 'Prontas em até 30 minutos' },
];

const MAIN = ['carnes', 'aves', 'peixes-e-frutos-do-mar', 'sufles-e-tortas', 'pizzas-e-massas'];
const SIDE = ['legumes-e-acompanhamentos', 'saladas'];
const LIGHT_DINNER = [
  'sopas-caldos-e-cremes',
  'omeletes-e-ovos',
  'sufles-e-tortas',
  'aves',
  'peixes-e-frutos-do-mar',
  'saladas',
];
const BREAKFAST = [
  'omeletes-e-ovos',
  'paes-panquecas-e-lanches',
  'mingaus-granolas-e-iogurtes',
  'cafe-da-manha-para-congelar',
];
const SNACK = [
  'lanches-para-congelar',
  'cafe-da-manha-para-congelar',
  'doces-saudaveis-e-funcionais',
  'paes-panquecas-e-lanches',
  'bebidas-e-vitaminas',
  'docinhos-e-biscoitos',
  'mingaus-granolas-e-iogurtes',
];

type Role = 'cafe' | 'lanche' | 'principal' | 'acompanhamento' | 'jantar';

const ROLE_CATS: Record<Role, string[]> = {
  cafe: BREAKFAST,
  lanche: SNACK,
  principal: MAIN,
  acompanhamento: SIDE,
  jantar: LIGHT_DINNER,
};

/** Teto de calorias por papel no modo "mais leve". */
const LIGHT_KCAL: Record<Role, number> = {
  cafe: 220,
  lanche: 160,
  principal: 320,
  acompanhamento: 150,
  jantar: 280,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface GenerateOptions {
  weekStart: string;
  goal: Goal;
  recipes: Recipe[];
  favorites?: string[];
  /** Não preenche dias anteriores a esta data. */
  fromDate?: string;
  /** Muda a sorte: mesmo número = mesmo cardápio. */
  variation?: number;
}

export interface Generated {
  plan: Plan;
  added: number;
}

/** Completa só as refeições vazias; o que a pessoa já escolheu nunca é trocado. */
export function generateWeek(plan: Plan, o: GenerateOptions): Generated {
  const rng = mulberry32(hash(`${o.weekStart}|${o.goal}|${o.variation ?? 0}`));
  const fav = new Set(o.favorites ?? []);
  const byCat = new Map<string, Recipe[]>();
  for (const r of o.recipes) {
    if (r.basis === 'colher') continue; // molhos e farofas não são refeição
    (byCat.get(r.cat) ?? byCat.set(r.cat, []).get(r.cat)!).push(r);
  }
  const used = new Set<string>();
  for (const [id] of weekRecipeCounts(plan, o.weekStart)) used.add(id);

  const fits = (r: Recipe, role: Role, strict: boolean): boolean => {
    if (used.has(r.id)) return false;
    if (role !== 'lanche' && role !== 'cafe' && r.basis !== 'porção') return false;
    if (!strict) return true;
    if (o.goal === 'leve' && r.kcal > LIGHT_KCAL[role]) return false;
    if (o.goal === 'rapido' && (r.timeMin === null || r.timeMin > 30)) return false;
    return true;
  };

  let step = 0;
  const pick = (role: Role): Recipe | null => {
    const cats = ROLE_CATS[role];
    for (const strict of [true, false]) {
      for (let i = 0; i < cats.length; i++) {
        const cat = cats[(step + i) % cats.length];
        const cand = (byCat.get(cat) ?? []).filter((r) => fits(r, role, strict));
        if (!cand.length) continue;
        const favs = cand.filter((r) => fav.has(r.id));
        const from = favs.length && rng() < 0.35 ? favs : cand;
        step++;
        return from[Math.floor(rng() * from.length)];
      }
    }
    return null;
  };

  let next: Plan = plan;
  let added = 0;
  const put = (date: string, slot: Slot, role: Role) => {
    const r = pick(role);
    if (!r) return;
    used.add(r.id);
    next = addTo(next, date, slot, r.id);
    added++;
  };

  for (const date of weekDays(o.weekStart)) {
    if (o.fromDate && date < o.fromDate) continue;
    if (!recipesIn(next, date, 'cafe').length) put(date, 'cafe', 'cafe');
    if (!recipesIn(next, date, 'almoco').length) {
      put(date, 'almoco', 'principal');
      put(date, 'almoco', 'acompanhamento');
    }
    if (!recipesIn(next, date, 'lanche').length) put(date, 'lanche', 'lanche');
    if (!recipesIn(next, date, 'jantar').length) put(date, 'jantar', 'jantar');
  }
  return { plan: next, added };
}
