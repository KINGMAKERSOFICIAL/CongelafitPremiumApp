/**
 * Meu Freezer: prazos, status e ordem de consumo (PEPS — o que vence primeiro sai primeiro).
 *
 * Os prazos são de QUALIDADE (sabor e textura), a −18 °C, e foram escolhidos de forma
 * conservadora: o menor limite superior entre as tabelas de USDA/FoodSafety.gov e de
 * extensões universitárias consultadas. Congelado continuamente a −18 °C o alimento segue
 * seguro por mais tempo, mas perde qualidade. São estimativas a validar com a nutricionista.
 */
import { addDays, addMonths, daysBetween, fmtDate, isISO, relativeDays } from './dates';
import { norm } from './text';
import type { Basis } from '../types';

export const FREEZER_KEY = 'fz';

export type Verdict = 'ok' | 'caution' | 'no';

export interface FreezeRule {
  /** Prazo de qualidade, em meses. */
  months: number;
  verdict: Verdict;
  /** Dica curta e específica para esta categoria. */
  note: string;
  /** Como servir depois: aquecer (prato quente) ou apenas descongelar (doces, sorvetes). */
  serve: 'reheat' | 'thaw';
}

const rule = (
  months: number,
  verdict: Verdict,
  note: string,
  serve: 'reheat' | 'thaw' = 'reheat',
): FreezeRule => ({
  months,
  verdict,
  note,
  serve,
});

export const RULES_BY_CAT: Record<string, FreezeRule> = {
  'sufles-e-tortas': rule(
    2,
    'ok',
    'Congele já assado e bem frio. Reaqueça no forno para recuperar a textura.',
  ),
  'peixes-e-frutos-do-mar': rule(
    2,
    'ok',
    'Peixe e frutos do mar perdem textura mais rápido: embale sem ar e consuma primeiro.',
  ),
  aves: rule(3, 'ok', 'Congele em porções com um pouco do molho ou caldo para não ressecar.'),
  carnes: rule(3, 'ok', 'Congele em porções com um pouco do molho ou caldo para não ressecar.'),
  'legumes-e-acompanhamentos': rule(3, 'ok', 'Legumes cozidos ficam mais macios depois de descongelar.'),
  'pizzas-e-massas': rule(2, 'ok', 'Congele já assada, fatiada e separada por papel manteiga.'),
  saladas: rule(
    1,
    'no',
    'Folhas e vegetais crus ficam murchos e aguados ao descongelar. Prefira a geladeira.',
    'thaw',
  ),
  'sopas-caldos-e-cremes': rule(
    3,
    'ok',
    'Deixe 2 cm de espaço no pote (o líquido expande) e ferva ao reaquecer.',
  ),
  'farinhas-e-farofas': rule(
    3,
    'ok',
    'Em pote bem fechado, longe da umidade. Farinhas de oleaginosas rancificam menos no freezer.',
  ),
  'molhos-maioneses-e-pates': rule(
    2,
    'caution',
    'Molhos com ervas frescas, limão ou iogurte podem mudar de cor e textura.',
  ),
  'omeletes-e-ovos': rule(
    2,
    'caution',
    'Ovos já cozidos ficam borrachudos; omeletes e tortas aguentam melhor.',
  ),
  'paes-panquecas-e-lanches': rule(
    3,
    'ok',
    'Separe por papel manteiga para tirar só a quantidade que vai comer.',
  ),
  'mingaus-granolas-e-iogurtes': rule(
    1,
    'caution',
    'Mingau e iogurte podem soltar líquido ao descongelar; mexa antes de servir.',
  ),
  'bebidas-e-vitaminas': rule(
    2,
    'caution',
    'Congele em potinhos ou forminhas e bata de novo na hora de servir.',
    'thaw',
  ),
  'bolos-e-tortas-doces': rule(
    3,
    'ok',
    'Congele fatiado e sem cobertura delicada; descongele ainda embalado.',
    'thaw',
  ),
  'pudins-mousses-e-cremes': rule(
    1,
    'caution',
    'Cremes com ovo ou gelatina podem soltar água e perder a textura.',
    'thaw',
  ),
  'docinhos-e-biscoitos': rule(3, 'ok', 'Congele em camadas separadas por papel manteiga.', 'thaw'),
  'sorvetes-e-picoles': rule(2, 'ok', 'Cubra a superfície com filme para evitar cristais de gelo.', 'thaw'),
};

const FALLBACK = rule(2, 'ok', 'Esfrie por completo, porcione e embale sem ar.');

/** Exceções por nome de receita (aplicadas em ordem; a primeira que casar vale). */
const TITLE_RULES: [RegExp, FreezeRule][] = [
  [
    /maionese/,
    rule(
      1,
      'no',
      'Maionese caseira (com ovo cru) separa ao congelar. Mantenha refrigerada e consuma em poucos dias.',
      'thaw',
    ),
  ],
  [
    /vinagrete/,
    rule(1, 'no', 'Tomate e cebola crus ficam aguados ao descongelar. Prefira a geladeira.', 'thaw'),
  ],
  [/creme brulee/, rule(1, 'no', 'A cobertura de açúcar caramelizado não resiste ao congelamento.', 'thaw')],
  [/pesto/, rule(3, 'ok', 'Congele em forminhas de gelo e cubra com um fio de azeite.')],
  [/tempero caseiro/, rule(3, 'ok', 'Congele em forminhas de gelo para usar aos poucos.')],
  [
    /(^| )(pate|requeijao)/,
    rule(1, 'caution', 'Patês cremosos podem separar; mexa bem depois de descongelar.', 'thaw'),
  ],
  [/granola/, rule(3, 'ok', 'Em pote hermético: no freezer as oleaginosas não rancificam.', 'thaw')],
];

export function freezeRuleFor(r: { cat: string; title: string }): FreezeRule {
  const t = norm(r.title);
  for (const [re, rl] of TITLE_RULES) if (re.test(t)) return rl;
  return RULES_BY_CAT[r.cat] ?? FALLBACK;
}

export function freezeRuleForCat(catId: string): FreezeRule {
  return RULES_BY_CAT[catId] ?? FALLBACK;
}

/* ───────── itens do freezer ───────── */

export type PortionUnit = 'porção' | 'unidade' | 'pote';

export interface FreezerItem {
  id: string;
  recipeId: string | null;
  name: string;
  portions: number;
  unit: PortionUnit;
  /** Data em que foi congelado (AAAA-MM-DD). */
  frozenOn: string;
  /** Prazo de qualidade, em meses (ajustável por item). */
  months: number;
  note: string;
}

export const unitFor = (b: Basis): PortionUnit =>
  b === 'porção' ? 'porção' : b === 'unidade' ? 'unidade' : 'pote';

export function unitText(unit: PortionUnit, n: number): string {
  if (unit === 'porção') return n === 1 ? 'porção' : 'porções';
  if (unit === 'unidade') return n === 1 ? 'unidade' : 'unidades';
  return n === 1 ? 'pote' : 'potes';
}

export function defaultPortions(r: { basis: Basis; rende: { n: number } | null }): number {
  if (r.basis === 'colher') return 1;
  return r.rende ? Math.max(1, Math.round(r.rende.n)) : 1;
}

export const expiryOf = (it: Pick<FreezerItem, 'frozenOn' | 'months'>): string =>
  addMonths(it.frozenOn, it.months);

export const daysLeft = (it: Pick<FreezerItem, 'frozenOn' | 'months'>, today: string): number =>
  daysBetween(today, expiryOf(it));

export type Status = 'expired' | 'soon' | 'ok';

/** "Vence logo" = faltam no máximo 14 dias, ou 25 % do prazo quando o prazo é curto. */
export function statusOf(it: Pick<FreezerItem, 'frozenOn' | 'months'>, today: string): Status {
  const left = daysLeft(it, today);
  if (left < 0) return 'expired';
  const total = daysBetween(it.frozenOn, expiryOf(it));
  const limit = Math.min(14, Math.max(3, Math.round(total * 0.25)));
  return left <= limit ? 'soon' : 'ok';
}

export const STATUS_LABEL: Record<Status, string> = {
  expired: 'Passou do prazo',
  soon: 'Consumir logo',
  ok: 'No prazo',
};

export function statusText(it: Pick<FreezerItem, 'frozenOn' | 'months'>, today: string): string {
  const left = daysLeft(it, today);
  if (left < 0) return `passou do prazo ${relativeDays(left)}`;
  if (left === 0) return 'vence hoje';
  return `vence ${relativeDays(left)}`;
}

/** Ordem de consumo: vence primeiro → sai primeiro. */
export function sortFifo<T extends FreezerItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      expiryOf(a).localeCompare(expiryOf(b)) ||
      a.frozenOn.localeCompare(b.frozenOn) ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export interface FreezerSummary {
  items: number;
  portions: number;
  soon: number;
  expired: number;
}

export function summarize(items: FreezerItem[], today: string): FreezerSummary {
  let portions = 0;
  let soon = 0;
  let expired = 0;
  for (const it of items) {
    portions += it.portions;
    const s = statusOf(it, today);
    if (s === 'soon') soon++;
    else if (s === 'expired') expired++;
  }
  return { items: items.length, portions, soon, expired };
}

/** Tira uma porção; zerou → o item sai da lista. */
export function consumeOne(items: FreezerItem[], id: string): FreezerItem[] {
  return items.flatMap((it) => {
    if (it.id !== id) return [it];
    return it.portions > 1 ? [{ ...it, portions: it.portions - 1 }] : [];
  });
}

export function addOne(items: FreezerItem[], id: string): FreezerItem[] {
  return items.map((it) => (it.id === id ? { ...it, portions: Math.min(99, it.portions + 1) } : it));
}

/** Aceita só itens bem formados (dados antigos, backup editado à mão…). */
export function cleanFreezer(input: unknown): FreezerItem[] {
  if (!Array.isArray(input)) return [];
  const out: FreezerItem[] = [];
  for (const x of input as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object') continue;
    if (typeof x.id !== 'string' || typeof x.name !== 'string' || !isISO(x.frozenOn)) continue;
    const months = Number(x.months);
    const portions = Number(x.portions);
    if (!Number.isFinite(months) || !Number.isFinite(portions)) continue;
    const unit: PortionUnit = x.unit === 'unidade' || x.unit === 'pote' ? x.unit : 'porção';
    out.push({
      id: x.id,
      recipeId: typeof x.recipeId === 'string' ? x.recipeId : null,
      name: x.name.slice(0, 120),
      portions: Math.min(99, Math.max(1, Math.round(portions))),
      unit,
      frozenOn: x.frozenOn,
      months: Math.min(12, Math.max(1, Math.round(months))),
      note: typeof x.note === 'string' ? x.note.slice(0, 200) : '',
    });
  }
  return out;
}

export function shareText(items: FreezerItem[], today: string): string {
  const lines = ['*Meu Freezer · CongelaFit*', ''];
  for (const it of sortFifo(items)) {
    lines.push(
      `• ${it.name} — ${it.portions} ${unitText(it.unit, it.portions)} · válido até ${fmtDate(expiryOf(it))} (${statusText(it, today)})`,
    );
  }
  if (items.length === 0) lines.push('Freezer vazio.');
  lines.push('', 'www.congelafit.com.br');
  return lines.join('\n');
}

/** Data sugerida para "descongelar na geladeira": véspera do consumo. */
export function thawOn(eatOn: string): string {
  return addDays(eatOn, -1);
}
