import { useEffect, useMemo, useState } from 'react';
import { allIngredients, getRecipe } from '../data';
import { todayISO } from './dates';
import { FREEZER_KEY, cleanFreezer, type FreezerItem } from './freezer';
import { PLAN_KEY, cleanPlan, type Plan } from './planner';
import { aggregate } from './shopping';
import { useStored } from './store';

/** Dia de hoje; atualiza sozinho quando o app volta ao primeiro plano (virou o dia). */
export function useToday(): string {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}

const NONE: unknown[] = [];

export function useFreezer() {
  const [raw, update] = useStored<unknown>(FREEZER_KEY, NONE);
  const items = useMemo(() => cleanFreezer(raw), [raw]);
  const set = (fn: (cur: FreezerItem[]) => FreezerItem[]) => update((cur) => fn(cleanFreezer(cur)));
  return { items, set };
}

const EMPTY_PLAN: Plan = {};

export function usePlan() {
  const [raw, update] = useStored<unknown>(PLAN_KEY, EMPTY_PLAN);
  const plan = useMemo(() => cleanPlan(raw), [raw]);
  const set = (fn: (cur: Plan) => Plan) => update((cur) => fn(cleanPlan(cur)));
  return { plan, set };
}

export interface ShopRecipe {
  id: string;
  factor: number;
}
export interface ShopManual {
  id: string;
  text: string;
}

const NO_REC: ShopRecipe[] = [];
const NO_MAN: ShopManual[] = [];
const NO_CHK: string[] = [];

export function useShop() {
  const [rec, setRec] = useStored<ShopRecipe[]>('shop.rec', NO_REC);
  const [man, setMan] = useStored<ShopManual[]>('shop.man', NO_MAN);
  const [chk, setChk] = useStored<string[]>('shop.chk', NO_CHK);
  const recipes = useMemo(
    () =>
      (Array.isArray(rec) ? rec : []).filter(
        (r) => r && typeof r.id === 'string' && Number.isFinite(r.factor) && r.factor > 0,
      ),
    [rec],
  );
  const manual = useMemo(
    () =>
      (Array.isArray(man) ? man : []).filter(
        (m) => m && typeof m.id === 'string' && typeof m.text === 'string',
      ),
    [man],
  );
  const checked = useMemo(
    () => new Set((Array.isArray(chk) ? chk : []).filter((k) => typeof k === 'string')),
    [chk],
  );
  return { recipes, manual, checked, setRec, setMan, setChk };
}

/** Soma o fator se a receita já está na lista (clicar duas vezes = 2×). */
export function addShopRecipe(cur: ShopRecipe[], id: string, factor: number): ShopRecipe[] {
  const has = cur.find((r) => r.id === id);
  if (!has) return [...cur, { id, factor }];
  return cur.map((r) => (r.id === id ? { ...r, factor: r.factor + factor } : r));
}

/** Garante pelo menos `factor` (idempotente: apertar de novo não dobra). */
export function ensureShopRecipe(cur: ShopRecipe[], id: string, factor: number): ShopRecipe[] {
  const has = cur.find((r) => r.id === id);
  if (!has) return [...cur, { id, factor }];
  return cur.map((r) => (r.id === id ? { ...r, factor: Math.max(r.factor, factor) } : r));
}

/** Lista de compras já somada (receitas + itens digitados). */
export function useShopLines() {
  const shop = useShop();
  const lines = useMemo(() => {
    const sources = shop.recipes.flatMap((r) => {
      const rec = getRecipe(r.id);
      return rec ? [{ id: rec.id, factor: r.factor, lines: allIngredients(rec) }] : [];
    });
    return aggregate(sources, shop.manual);
  }, [shop.recipes, shop.manual]);
  const open = useMemo(() => lines.filter((l) => !shop.checked.has(l.key)).length, [lines, shop.checked]);
  return { ...shop, lines, open };
}
