import raw from '@catalog-source';
import { apiFetch } from '../lib/api';
import { norm } from '../lib/text';
import type { Book, Category, Recipe } from '../types';

export let SECTIONS: string[] = [];
export let CATEGORIES: Category[] = [];
export let RECIPES: Recipe[] = [];

let catById = new Map<string, Category>();
let recipeById = new Map<string, Recipe>();
let index: Array<{ r: Recipe; title: string; all: string }> = [];
let catalogPromise: Promise<void> | null = null;

export function setCatalogBook(book: Book): void {
  SECTIONS = Array.isArray(book.sections) ? book.sections : [];
  CATEGORIES = Array.isArray(book.cats) ? book.cats : [];
  RECIPES = Array.isArray(book.recipes) ? book.recipes : [];
  catById = new Map(CATEGORIES.map((c) => [c.id, c]));
  recipeById = new Map(RECIPES.map((r) => [r.id, r]));
  index = RECIPES.map((r) => {
    const cat = catById.get(r.cat)?.name ?? '';
    const ing = [...r.items, ...(r.groups ?? []).flatMap((g) => g.items)].join(' ');
    return { r, title: norm(r.title), all: norm(`${r.title} ${cat} ${ing}`) };
  });
}

export function clearCatalogBook(): void {
  catalogPromise = null;
  setCatalogBook({ sections: [], cats: [], recipes: [] });
}

export function isCatalogLoaded(): boolean {
  return RECIPES.length > 0;
}

export async function loadCatalogFromServer(): Promise<void> {
  if (isCatalogLoaded()) return;
  if (catalogPromise) return catalogPromise;
  catalogPromise = apiFetch<Book>('/api/catalog')
    .then((book) => {
      setCatalogBook(book);
    })
    .finally(() => {
      catalogPromise = null;
    });
  return catalogPromise;
}

// Em testes Vitest @catalog-source já vem preenchido; no navegador inicia vazio até autenticar.
setCatalogBook(raw as unknown as Book);

export const getCategory = (id: string | undefined) => (id ? catById.get(id) : undefined);
export const getRecipe = (id: string | undefined) => (id ? recipeById.get(id) : undefined);

export const recipesOf = (catId: string): Recipe[] => RECIPES.filter((r) => r.cat === catId);

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
