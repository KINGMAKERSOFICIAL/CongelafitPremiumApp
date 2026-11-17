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

/** Congelamento específico da receita (sobrepõe a regra da categoria). */
export interface RecipeFreeze {
  /** Prazo de qualidade a −18 °C, em meses. */
  months: number;
  verdict: 'ok' | 'caution' | 'no';
  /** Como congelar. */
  how: string;
  /** Como reaquecer ou servir. */
  reheat: string;
  serve: 'reheat' | 'thaw';
}

export interface Recipe {
  id: string;
  /** Número da receita (1–396: livro Low Carb; 397–415: Café da Manhã para Congelar; 416–431: Lanches para Congelar; 432–449: Doces Saudáveis e Funcionais; 450–464: Almoço para Congelar; 465–479: Molhos, Marinadas e Temperos para Congelar; 480–501: Lanches para Levar no Trabalho). */
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
  /** Tamanho da porção, quando a receita rende "porções" (ex.: "4 palitos"). */
  portion?: string;
  /** Dica curta da receita. */
  tip?: string;
  freeze?: RecipeFreeze;
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
