import raw from './recipes.json';
import type { Book, Category, Recipe } from '../types';
import { norm } from '../lib/text';

const book = raw as unknown as Book;

export const SECTIONS = book.sections;
export const CATEGORIES: Category[] = book.cats;
export const RECIPES: Recipe[] = book.recipes;

const catById = new Map(CATEGORIES.map((c) => [c.id, c]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

export const getCategory = (id: string | undefined) => (id ? catById.get(id) : undefined);
export const getRecipe = (id: string | undefined) => (id ? recipeById.get(id) : undefined);

export const recipesOf = (catId: string): Recipe[] => RECIPES.filter((r) => r.cat === catId);

/** Texto pré-normalizado de cada receita (título + ingredientes + categoria) para a busca. */
const index = RECIPES.map((r) => {
  const cat = catById.get(r.cat)?.name ?? '';
  const ing = [...r.items, ...(r.groups ?? []).flatMap((g) => g.items)].join(' ');
  return { r, title: norm(r.title), all: norm(`${r.title} ${cat} ${ing}`) };
});

/** Busca por todas as palavras (qualquer ordem); título pesa mais. */
export function search(query: string): Recipe[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored: { r: Recipe; s: number }[] = [];
  for (const e of index) {
    if (!words.every((w) => e.all.includes(w))) continue;
    let s = 0;
    for (const w of words) {
      if (e.title.startsWith(w)) s += 3;
      else if (e.title.includes(w)) s += 2;
      else s += 1;
    }
    scored.push({ r: e.r, s });
  }
  scored.sort((a, b) => b.s - a.s || a.r.title.localeCompare(b.r.title, 'pt-BR'));
  return scored.map((x) => x.r);
}

export function allIngredients(r: Recipe): string[] {
  return r.groups ? r.groups.flatMap((g) => g.items) : r.items;
}
