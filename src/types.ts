export interface Rende {
  n: number;
  one: string;
  many: string;
}

export interface Group {
  label: string;
  items: string[];
}

export type Basis = 'porção' | 'unidade' | 'colher';

export interface Recipe {
  id: string;
  /** Número da receita no livro (1–396). */
  n: number;
  title: string;
  cat: string;
  img: string | null;
  kcal: number;
  basis: Basis;
  rende: Rende | null;
  time: string | null;
  timeMin: number | null;
  rest: string | null;
  items: string[];
  groups: Group[] | null;
  steps: string[];
}

export interface Category {
  id: string;
  name: string;
  section: string;
  desc: string;
}

export interface Book {
  sections: string[];
  cats: Category[];
  recipes: Recipe[];
}
