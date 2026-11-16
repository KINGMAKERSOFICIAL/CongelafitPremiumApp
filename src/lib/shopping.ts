/**
 * Lista de compras: lê as linhas de ingredientes das receitas ("2 colheres (sopa) de azeite (30 ml)"),
 * junta o que se repete (somando só unidades iguais) e separa por seção do mercado.
 */
import { formatMetric, formatNum, leadingQty } from './scale';
import { norm } from './text';

/* ───────── unidades ───────── */

export type UnitKey =
  | 'g'
  | 'ml'
  | 'un'
  | 'csopa'
  | 'csob'
  | 'cch'
  | 'ccaf'
  | 'xch'
  | 'xcaf'
  | 'copo'
  | 'pitada'
  | 'dente'
  | 'folha'
  | 'fatia'
  | 'maco'
  | 'lata'
  | 'pote'
  | 'pacote'
  | 'caixa'
  | 'caixinha'
  | 'peca'
  | 'ramo'
  | 'talo'
  | 'gota'
  | 'punhado'
  | 'pe'
  | 'sache'
  | 'fio'
  | 'posta'
  | 'galho'
  | 'bulbo'
  | 'cabeca'
  | 'pedaco'
  | 'lasca'
  | 'gomo'
  | 'garrafa'
  | 'envelope'
  | 'scoop'
  | 'pau'
  | 'florete';

/** [singular, plural] como aparece na lista. */
const UNIT_LABEL: Record<Exclude<UnitKey, 'g' | 'ml' | 'un'>, [string, string]> = {
  csopa: ['colher (sopa)', 'colheres (sopa)'],
  csob: ['colher (sobremesa)', 'colheres (sobremesa)'],
  cch: ['colher (chá)', 'colheres (chá)'],
  ccaf: ['colher (café)', 'colheres (café)'],
  xch: ['xícara', 'xícaras'],
  xcaf: ['xícara (café)', 'xícaras (café)'],
  copo: ['copo', 'copos'],
  pitada: ['pitada', 'pitadas'],
  dente: ['dente', 'dentes'],
  folha: ['folha', 'folhas'],
  fatia: ['fatia', 'fatias'],
  maco: ['maço', 'maços'],
  lata: ['lata', 'latas'],
  pote: ['pote', 'potes'],
  pacote: ['pacote', 'pacotes'],
  caixa: ['caixa', 'caixas'],
  caixinha: ['caixinha', 'caixinhas'],
  peca: ['peça', 'peças'],
  ramo: ['ramo', 'ramos'],
  talo: ['talo', 'talos'],
  gota: ['gota', 'gotas'],
  punhado: ['punhado', 'punhados'],
  pe: ['pé', 'pés'],
  sache: ['sachê', 'sachês'],
  fio: ['fio', 'fios'],
  posta: ['posta', 'postas'],
  galho: ['galho', 'galhos'],
  bulbo: ['bulbo', 'bulbos'],
  cabeca: ['cabeça', 'cabeças'],
  pedaco: ['pedaço', 'pedaços'],
  lasca: ['lasca', 'lascas'],
  gomo: ['gomo', 'gomos'],
  garrafa: ['garrafa', 'garrafas'],
  envelope: ['envelope', 'envelopes'],
  scoop: ['scoop', 'scoops'],
  pau: ['pau', 'paus'],
  florete: ['florete', 'floretes'],
};

/** Unidades "inteiras": não se compra meia cebola, então o total sobe para o próximo inteiro. */
const DISCRETE = new Set<UnitKey>([
  'un',
  'dente',
  'folha',
  'fatia',
  'maco',
  'lata',
  'pote',
  'pacote',
  'caixa',
  'caixinha',
  'peca',
  'ramo',
  'talo',
  'pe',
  'sache',
  'posta',
  'galho',
  'bulbo',
  'cabeca',
  'pedaco',
  'lasca',
  'gomo',
  'garrafa',
  'envelope',
  'scoop',
  'pau',
  'florete',
]);

const END = '(?![A-Za-zÀ-ÿ])';
const WORD_UNITS: [RegExp, UnitKey][] = [
  [new RegExp(`^(?:pitadas?)${END}`, 'i'), 'pitada'],
  [new RegExp(`^(?:dentes?)${END}`, 'i'), 'dente'],
  [new RegExp(`^(?:folhas?)${END}`, 'i'), 'folha'],
  [new RegExp(`^(?:fatias?)${END}`, 'i'), 'fatia'],
  [new RegExp(`^(?:maços?|macos?)${END}`, 'i'), 'maco'],
  [new RegExp(`^(?:latas?)${END}`, 'i'), 'lata'],
  [new RegExp(`^(?:potes?|potinhos?)${END}`, 'i'), 'pote'],
  [new RegExp(`^(?:pacotes?)${END}`, 'i'), 'pacote'],
  [new RegExp(`^(?:caixinhas?)${END}`, 'i'), 'caixinha'],
  [new RegExp(`^(?:caixas?)${END}`, 'i'), 'caixa'],
  [new RegExp(`^(?:peças?|pecas?)${END}`, 'i'), 'peca'],
  [new RegExp(`^(?:ramos?|ramitos?)${END}`, 'i'), 'ramo'],
  [new RegExp(`^(?:talos?)${END}`, 'i'), 'talo'],
  [new RegExp(`^(?:gotas?)${END}`, 'i'), 'gota'],
  [new RegExp(`^(?:punhados?)${END}`, 'i'), 'punhado'],
  [new RegExp(`^(?:pés?|pes?)${END}`, 'i'), 'pe'],
  [new RegExp(`^(?:sachês?|saches?)${END}`, 'i'), 'sache'],
  [new RegExp(`^(?:fios?)${END}`, 'i'), 'fio'],
  [new RegExp(`^(?:postas?)${END}`, 'i'), 'posta'],
  [new RegExp(`^(?:galhos?)${END}`, 'i'), 'galho'],
  [new RegExp(`^(?:bulbos?)${END}`, 'i'), 'bulbo'],
  [new RegExp(`^(?:cabeças?|cabecas?)${END}`, 'i'), 'cabeca'],
  [new RegExp(`^(?:pedaços?|pedacos?|pedacinhos?)${END}`, 'i'), 'pedaco'],
  [new RegExp(`^(?:lascas?)${END}`, 'i'), 'lasca'],
  [new RegExp(`^(?:gomos?)${END}`, 'i'), 'gomo'],
  [new RegExp(`^(?:garrafas?)${END}`, 'i'), 'garrafa'],
  [new RegExp(`^(?:envelopes?)${END}`, 'i'), 'envelope'],
  [new RegExp(`^(?:scoops?)${END}`, 'i'), 'scoop'],
  [new RegExp(`^(?:paus?)${END}`, 'i'), 'pau'],
  [new RegExp(`^(?:floretes?|floretos?)${END}`, 'i'), 'florete'],
  [new RegExp(`^(?:copos?)${END}`, 'i'), 'copo'],
  [new RegExp(`^(?:unidades?)${END}`, 'i'), 'un'],
];

/* ───────── ingrediente → {nome, quantidade, unidade} ───────── */

export interface Parsed {
  /** Nome para exibir (primeira letra maiúscula). */
  name: string;
  /** Chave para juntar variações ("ovos"/"ovo" → mesma chave). */
  key: string;
  qty: number | null;
  unit: UnitKey;
}

const PREP_WORDS = new Set(
  [
    'picado',
    'picada',
    'picados',
    'picadas',
    'picadinho',
    'picadinha',
    'ralado',
    'ralada',
    'ralados',
    'raladas',
    'fatiado',
    'fatiada',
    'fatiados',
    'fatiadas',
    'triturado',
    'triturada',
    'triturados',
    'trituradas',
    'amassado',
    'amassada',
    'amassados',
    'amassadas',
    'cozido',
    'cozida',
    'cozidos',
    'cozidas',
    'cru',
    'crua',
    'crus',
    'cruas',
    'desfiado',
    'desfiada',
    'desfiados',
    'desfiadas',
    'batido',
    'batida',
    'derretido',
    'derretida',
    'gelado',
    'gelada',
    'geladas',
    'gelados',
    'descascado',
    'descascada',
    'descascados',
    'descascadas',
    'lavado',
    'lavada',
    'lavados',
    'lavadas',
    'cortado',
    'cortada',
    'cortados',
    'cortadas',
    'temperado',
    'temperada',
    'médio',
    'media',
    'média',
    'médios',
    'medias',
    'médias',
    'grande',
    'grandes',
    'pequeno',
    'pequena',
    'pequenos',
    'pequenas',
    'finamente',
    'bem',
    'repicado',
    'repicada',
    'fino',
    'fina',
    'finos',
    'finas',
    'grosso',
    'grossa',
    'maduro',
    'madura',
    'maduros',
    'maduras',
    'cheio',
    'cheia',
    'cheias',
    'cheios',
    'rasa',
    'rasas',
    'morno',
    'morna',
    'quente',
    'frio',
    'fria',
    'sem',
    'e',
    'de',
    'do',
    'da',
    'com',
    'ralada',
    'moído',
    'moida',
    'moidos',
    'esmagado',
    'esmagada',
    'espremido',
    'espremida',
    'congelado',
    'congelada',
    'descongelado',
    'descongelada',
    'tostado',
    'tostada',
    'assado',
    'assada',
    'refogado',
    'refogada',
    'sem pele',
    'sem sementes',
    'ligeiramente',
    'levemente',
    'inteiro',
    'inteira',
    'fervente',
    'debulhado',
    'debulhada',
    'limpo',
    'limpa',
    'limpos',
    'limpas',
    'aberto',
    'aberta',
    'picadinho',
    'fininho',
    'fininha',
  ].map((w) => norm(w)),
);

/** Palavras que só saem do FIM do nome se forem de preparo (nunca "moída": carne moída é produto). */
const KEEP_AT_END = new Set(['moida', 'moido', 'moidos', 'moidas']);

const WATER =
  /^agua( filtrada| fervente| gelada| morna| quente| mineral| natural| fria| em temperatura ambiente| do cozimento| de cozimento)?$/;

/** Sinônimos (testados na chave já no singular) que viram o mesmo item. [padrão, nome, plural?] */
const ALIASES: [RegExp, string, string?][] = [
  [/^sal( marinho| grosso| fino| refinado| rosa| do himalaia| light)?$/, 'sal'],
  [/^pimenta do reino.*$/, 'pimenta-do-reino'],
  [/^azeite( de oliva)?( extra ?virgem)?$/, 'azeite de oliva'],
  [/^oleo de coco( extra ?virgem)?$/, 'óleo de coco'],
  [/^pimenta$/, 'pimenta-do-reino'],
  [/^(salsa|salsinha)$/, 'salsinha'],
  [/^(clara|gema)( de ovo)?$/, 'ovo', 'Ovos'],
  [/^ovo( inteiro| mexido| caipira| grande| pequeno| de galinha)?$/, 'ovo', 'Ovos'],
];

const NOUN_DE = /^(?:(?:suco|raspas?|casca|cascas|polpa)\s+(?:(?:e|da|de|do)\s+)*)+(?=\d|[½¼¾⅓⅔⅛])/i;

function cleanName(input: string): string {
  let s = input.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // corta no primeiro separador de "modo de preparo" (não cortamos "em pó", "em lata"…)
  const cut = s.search(
    /,|;| - | – | a gosto| para | ou (?=\S)| sem (?!lactose|gl[uú]ten)| n[ao]s? | ao | à | de \d| com (?=osso|pele|casca|capa|gordura|sementes?|caro[çc]o|talo|cabe[çc]a)/i,
  );
  if (cut > 0) s = s.slice(0, cut);
  s = s.replace(/\s+em\s+(?!p[óo](?![A-Za-zÀ-ÿ])|lata(?![A-Za-zÀ-ÿ])|conserva|calda|sach[êe]).*$/i, '');
  const words = s.split(' ').filter(Boolean);
  if (/^coco ralad/i.test(norm(s))) return 'coco ralado';
  while (words.length > 1) {
    const last = norm(words[words.length - 1]);
    if (KEEP_AT_END.has(last) || !(PREP_WORDS.has(last) || PREP_WORDS.has(singularWord(last)))) break;
    words.pop();
  }
  s = words.join(' ').replace(/^(?:o|a|os|as)\s+/i, '');
  return s.trim();
}

const NOT_PLURAL = new Set([
  'brocolis',
  'anis',
  'pires',
  'gas',
  'tres',
  'mais',
  'menos',
  'lapis',
  'cris',
  'xis',
]);

function singularWord(w: string): string {
  if (NOT_PLURAL.has(w)) return w;
  if (/oes$/.test(w) || /aes$/.test(w)) return w.slice(0, -3) + 'ao';
  if (/(res|zes)$/.test(w)) return w.slice(0, -2);
  if (/ns$/.test(w)) return w.slice(0, -2) + 'm';
  if (/ies$/.test(w) && w.length > 5) return w.slice(0, -3) + 'y';
  if (/[aeo]is$/.test(w) && w.length > 4) return w.slice(0, -2) + 'l';
  if (/s$/.test(w) && !/(ss|is)$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

function keyOf(name: string): string {
  const k = norm(name).split(' ').map(singularWord).join(' ');
  for (const [re, to] of ALIASES) if (re.test(k)) return norm(to);
  return k;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function display(name: string): string {
  const k = norm(name).split(' ').map(singularWord).join(' ');
  for (const [re, to] of ALIASES) if (re.test(k)) return cap(to);
  return cap(name.trim());
}

const PLURAL_OF = new Map(ALIASES.filter((a) => a[2]).map((a) => [norm(a[1]), a[2] as string]));

function detectUnit(rest: string): { unit: UnitKey; mul: number; rest: string } | null {
  const t = rest.trimStart();
  let m: RegExpMatchArray | null;
  if ((m = t.match(new RegExp(`^(?:kg|quilos?|quilogramas?)${END}`, 'i'))))
    return { unit: 'g', mul: 1000, rest: t.slice(m[0].length) };
  if ((m = t.match(new RegExp(`^(?:mg|miligramas?)${END}`, 'i'))))
    return { unit: 'g', mul: 0.001, rest: t.slice(m[0].length) };
  if ((m = t.match(new RegExp(`^(?:g|gramas?)${END}`, 'i'))))
    return { unit: 'g', mul: 1, rest: t.slice(m[0].length) };
  if ((m = t.match(new RegExp(`^(?:ml|mililitros?)${END}`, 'i'))))
    return { unit: 'ml', mul: 1, rest: t.slice(m[0].length) };
  if ((m = t.match(new RegExp(`^(?:l|litros?)${END}`, 'i'))))
    return { unit: 'ml', mul: 1000, rest: t.slice(m[0].length) };
  if (
    (m = t.match(
      new RegExp(
        `^colher(?:es)?${END}\\s*(?:\\((sopa|sobremesa|ch[áa]|caf[ée])\\)|de\\s+(sopa|sobremesa|ch[áa]|caf[ée])${END})?`,
        'i',
      ),
    ))
  ) {
    const q = norm(m[1] ?? m[2] ?? 'sopa');
    const unit: UnitKey = q === 'sobremesa' ? 'csob' : q === 'cha' ? 'cch' : q === 'cafe' ? 'ccaf' : 'csopa';
    return { unit, mul: 1, rest: t.slice(m[0].length) };
  }
  if (
    (m = t.match(
      new RegExp(`^x[íi]caras?${END}\\s*(?:\\((ch[áa]|caf[ée])\\)|de\\s+(ch[áa]|caf[ée])${END})?`, 'i'),
    ))
  ) {
    const q = norm(m[1] ?? m[2] ?? 'cha');
    return { unit: q === 'cafe' ? 'xcaf' : 'xch', mul: 1, rest: t.slice(m[0].length) };
  }
  for (const [re, unit] of WORD_UNITS) {
    const mm = t.match(re);
    if (mm) return { unit, mul: 1, rest: t.slice(mm[0].length) };
  }
  return null;
}

const stripDe = (s: string) =>
  s
    .replace(
      /^\s*(?:\([^)]*\)\s*)?(?:(?:bem\s+)?(?:cheias?|rasas?|niveladas?|generosas?|grandes?|pequen[oa]s?|m[ée]di[oa]s?|fin[oa]s?|grossas?|inteir[oa]s?)\s+)?(?:de|do|da|dos|das)\s+/i,
      '',
    )
    .trim();

/**
 * Lê uma linha de ingrediente. Devolve `null` para o que não se compra (água, gelo).
 * Sem quantidade ("Sal a gosto") → qty = null.
 */
export function parseIngredient(line: string): Parsed | null {
  const src = line
    .replace(/\s+/g, ' ')
    .replace(/^[A-Za-zÀ-ÿ ]{3,30}:\s*/, '')
    .trim();
  if (!src) return null;

  let qty: number | null = null;
  let unit: UnitKey = 'un';
  let nameRaw = src;

  const noun = src.match(NOUN_DE);
  const lead = leadingQty(noun ? src.slice(noun[0].length) : src);
  if (noun) {
    // "Suco de 1 limão" / "Raspas de 2 laranjas" / "Suco de limão"
    const inner = src.slice(noun[0].length);
    if (lead) {
      qty = lead.value;
      nameRaw = stripDe(lead.rest);
    } else {
      nameRaw = inner;
    }
    // "60 ml de suco de limão" cai no outro ramo; aqui o item é a fruta
  } else if (lead) {
    qty = lead.value;
    const u = detectUnit(lead.rest.replace(/^\s*de\s+(?=\S)/i, ' '));
    if (u) {
      unit = u.unit;
      qty = lead.value * u.mul;
      nameRaw = stripDe(u.rest);
    } else {
      nameRaw = stripDe(lead.rest);
    }
  }

  const name = cleanName(nameRaw);
  const n = norm(name);
  if (!n) return null;
  if (WATER.test(n) || /(^| )gelo( |$)/.test(n)) return null;
  if (/^(a gosto|quanto baste)$/.test(n) || /^receita de /.test(n)) return null;

  const key = keyOf(name);
  return { name: display(name), key, qty, unit };
}

/**
 * Como parseIngredient, mas separa listas sem quantidade
 * ("Sal e pimenta-do-reino a gosto" → sal + pimenta-do-reino).
 */
export function parseLine(line: string): Parsed[] {
  const src = line.replace(/\s+/g, ' ').trim();
  if (src && !leadingQty(src) && !NOUN_DE.test(src)) {
    const head = src.replace(/\s*,?\s*\ba gosto\b.*$/i, '');
    if (/,| e /i.test(head)) {
      return head
        .split(/\s*,\s*|\s+e\s+/i)
        .filter(Boolean)
        .flatMap((part) => {
          const p = parseIngredient(`${part} a gosto`);
          return p ? [p] : [];
        });
    }
  }
  const p = parseIngredient(src);
  return p ? [p] : [];
}

/* ───────── seções do mercado ───────── */

export interface Section {
  id: string;
  name: string;
}

export const SHOP_SECTIONS: Section[] = [
  { id: 'hortifruti', name: 'Hortifrúti' },
  { id: 'acougue', name: 'Açougue e peixaria' },
  { id: 'laticinios', name: 'Laticínios, ovos e frios' },
  { id: 'padaria', name: 'Padaria' },
  { id: 'mercearia', name: 'Mercearia' },
  { id: 'conservas', name: 'Óleos, molhos e conservas' },
  { id: 'temperos', name: 'Temperos e especiarias' },
  { id: 'congelados', name: 'Congelados' },
  { id: 'bebidas', name: 'Bebidas' },
  { id: 'outros', name: 'Outros' },
];

/** Cada alternativa casa o INÍCIO do nome (e aceita palavras depois): "creme de leite" casa "creme de leite fresco". */
const w = (s: string) =>
  new RegExp(
    `^(${s
      .split('|')
      .map((alt) => (alt.endsWith('.*') ? alt.slice(0, -2) : alt) + '( [a-z0-9 ]*)?')
      .join('|')})$`,
  );

/**
 * Ordem importa: o primeiro padrão que casar decide a seção.
 * As chaves já vêm sem acento e no singular ("ervas frescas" → "erva fresca").
 */
const SECTION_RULES: [string, RegExp][] = [
  // exceções específicas (antes das regras gerais)
  [
    'mercearia',
    w(
      'leite de coco|leite de amendoa|leite de castanha|leite de aveia|leite em po|leite condensado|coco ralado|coco seco|coco em floco|creme de coco|farinha de coco|achocolatado|preparado|manteiga de (amendoim|amendoa|cacau|coco|castanha)|pasta de (amendoim|amendoa|castanha|avela)|creme de avela|gota',
    ),
  ],
  [
    'hortifruti',
    w(
      'pimenta (dedo de moca|malagueta|biquinho|vermelha|verde|fresca|cambuci)|pimentao|suco de limao|suco de laranja|raspa',
    ),
  ],
  [
    'temperos',
    w(
      'erva (seca|desidratada|fina|de provence)|(manjericao|tomilho|alecrim|salvia|estragao|coentro|hortela|salsinha|cebolinha) sec[oa]|gengibre moido|mix de erva|tempero|alho em po|cebola em po|gengibre em po|pimenta (calabresa|do reino|reino|preta|branca|rosa|jamaica|caiena|chilli|em po|siria|moida)|pimenta-do-reino|pimenta|sal|oregano|cominho|paprica|curry|canela|noz moscada|louro|cravo|acafrao|curcuma|colorau|cardamomo|anis|zaatar|garam masala|wasabi|flor de sal',
    ),
  ],
  [
    'conservas',
    w(
      'azeite|oleo|vinagre|shoyu|molho|mostarda|ketchup|maionese|pesto|extrato de tomate|tomate (pelado|seco|em lata|em conserva)|passata|polpa de tomate|azeitona|palmito|alcaparra|picle|pepino em conserva|atum|sardinha|milho verde|ervilha em lata|geleia|caldo|tahine|tahini|pasta de tomate|pasta de pimentao|miso|salmoura|creme de cebola',
    ),
  ],
  ['padaria', w('pao|tortilha|wrap|rap10|torrada|bisnaguinha|massa folhada')],
  [
    'congelados',
    w(
      'polpa|fruta congelada|morango congelado|acai|sorvete|vegetal congelado|legume congelado|massa de pizza|folha de lasanha|hamburguer|empanado',
    ),
  ],
  [
    'bebidas',
    w(
      'agua de coco|agua com gas|agua mineral|vinho|cerveja|refrigerante|bebida|kombucha|suco|cafe pronto|leite vegetal',
    ),
  ],
  [
    'laticinios',
    w(
      'ovo|clara|gema|leite|queijo|requeijao|cream cheese|creme de leite|creme de ricota|creme culinario|iogurte|manteiga|ghee|ricota|mucarela|mussarela|parmesao|cottage|nata|chantilly|presunto|peito de peru|peru defumado|mortadela|salame|coalho|provolone|gorgonzola|catupiry|kefir|coalhada|minas|margarina|apresuntado|bacon|linguica|calabresa|salsicha',
    ),
  ],
  [
    'acougue',
    w(
      'frango|peito|coxa|sobrecoxa|asa|carne|patinho|acem|alcatra|picanha|file|contrafile|bisteca|medalhao|chuleta|bife|costela|costelinha|peixe|tilapia|salmao|camarao|bacalhau|merluza|lula|polvo|mexilhao|marisco|lombo|pernil|paleta|cupim|maminha|fraldinha|coxao|lagarto|musculo|figado|coracao|moela|peru|pato|cordeiro|carneiro|porco|suino|bovino|kafta|robalo|badejo|pescada|truta|linguado|vieira|siri|caranguejo|lagosta|ossobuco|rabada|toucinho|torresmo|osso|miudo|posta|patinho|sardinha',
    ),
  ],
  [
    'mercearia',
    w(
      'gelatina|agar|cacau|chocolate|nib|whey|proteina|caseina|colageno|fermento|bicarbonato|essencia|extrato de baunilha|baunilha|adocante|stevia|estevia|eritritol|xilitol|acucar|mel|melado|sucralose|aveia|farelo|farinha|amido|polvilho|goma|tapioca|linhaca|chia|gergelim|semente|psyllium|casca de psyllium|fibra|amendoa|castanha|noz|pistache|macadamia|avela|amendoim|uva passa|damasco|figo seco|ameixa seca|tamara|cranberry|biomassa|quinoa|arroz|feijao|lentilha|grao|macarrao|massa|farinha de rosca|panko|cafe|cha|matcha|spirulina|inulina|maltodextrina|canjica|milho de pipoca|pipoca|emulsificante|glutamina|liga neutra|floco|amaranto|granola|mix|cereal|biscoito|bolacha|wafer|barra|envelope',
    ),
  ],
  [
    'hortifruti',
    w(
      'cebola|cebolinha|alho|tomate|cenoura|abobrinha|berinjela|couve|brocolis|espinafre|alface|rucula|agriao|escarola|acelga|repolho|pepino|limao|laranja|tangerina|abacate|banana|maca|morango|mamao|manga|abacaxi|coco|cheiro verde|salsinha|salsa|coentro|manjericao|hortela|menta|tomilho|alecrim|salvia|estragao|erva|gengibre|batata|mandioquinha|mandioca|aipim|macaxeira|abobora|chuchu|vagem|ervilha|cogumelo|champignon|shiitake|shimeji|portobello|rabanete|beterraba|aipo|salsao|kiwi|uva|pera|melancia|melao|mirtilo|framboesa|amora|fruta|maracuja|nabo|inhame|aspargo|broto|folha|folhinha|salada|milho|jilo|quiabo|maxixe|capim limao|erva cidreira|goiaba|caqui|figo|pessego|ameixa|cereja|mexerica|lima|endivia|radicchio|funcho|chicoria|pupunha|moranga|jerimum|cara|taro|yacon|legume|verdura|vegetal|casca|florete|bulbo',
    ),
  ],
];

export function classify(key: string): string {
  const n = norm(key);
  for (const [sec, re] of SECTION_RULES) if (re.test(n)) return sec;
  return 'outros';
}

/* ───────── junta tudo ───────── */

export interface Amount {
  unit: UnitKey;
  qty: number;
}

export interface ShopLine {
  /** Chave estável (para marcar "comprei"). */
  key: string;
  name: string;
  section: string;
  amounts: Amount[];
  /** Algum ingrediente veio "a gosto"/sem quantidade. */
  toTaste: boolean;
  /** Ids das receitas que usam o item. */
  recipes: string[];
  manual: boolean;
}

export interface Source {
  id: string;
  factor: number;
  lines: string[];
}

export interface ManualItem {
  id: string;
  text: string;
}

function mergeInto(
  map: Map<string, ShopLine>,
  p: Parsed,
  factor: number,
  recipeId: string | null,
  forms: Map<string, Map<string, number>>,
) {
  let line = map.get(p.key);
  if (!line) {
    line = {
      key: p.key,
      name: p.name,
      section: classify(p.key),
      amounts: [],
      toTaste: false,
      recipes: [],
      manual: recipeId === null,
    };
    map.set(p.key, line);
  }
  if (recipeId) {
    line.manual = false;
    if (!line.recipes.includes(recipeId)) line.recipes.push(recipeId);
  }
  const f = forms.get(p.key) ?? new Map<string, number>();
  f.set(p.name, (f.get(p.name) ?? 0) + 1);
  forms.set(p.key, f);
  if (p.qty === null) {
    if (recipeId) line.toTaste = true; // receita sem quantidade = "a gosto"
    return;
  }
  const q = p.qty * factor;
  const a = line.amounts.find((x) => x.unit === p.unit);
  if (a) a.qty += q;
  else line.amounts.push({ unit: p.unit, qty: q });
}

function finishAmounts(amounts: Amount[]): Amount[] {
  return amounts
    .map((a) => ({ unit: a.unit, qty: DISCRETE.has(a.unit) ? Math.ceil(a.qty - 1e-9) : a.qty }))
    .filter((a) => a.qty > 0)
    .sort((a, b) => order(a.unit) - order(b.unit));
}

const UNIT_ORDER: UnitKey[] = [
  'g',
  'ml',
  'un',
  'dente',
  'folha',
  'fatia',
  'maco',
  'ramo',
  'talo',
  'galho',
  'bulbo',
  'cabeca',
  'florete',
  'pedaco',
  'lasca',
  'gomo',
  'posta',
  'pau',
  'pe',
  'garrafa',
  'envelope',
  'scoop',
  'lata',
  'pote',
  'pacote',
  'caixa',
  'caixinha',
  'sache',
  'peca',
  'xch',
  'xcaf',
  'copo',
  'csopa',
  'csob',
  'cch',
  'ccaf',
  'punhado',
  'pitada',
  'gota',
  'fio',
];
const order = (u: UnitKey) => UNIT_ORDER.indexOf(u);

/** Escolhe a forma do nome que combina com o total (singular/plural) entre as vistas nas receitas. */
function pickName(forms: Map<string, number>, line: ShopLine): string {
  const total = line.amounts.reduce((n, a) => n + (a.unit === 'g' || a.unit === 'ml' ? 0 : a.qty), 0);
  const names = [...forms.entries()].sort((a, b) => b[1] - a[1]);
  const wantPlural = total > 1;
  const pl = PLURAL_OF.get(line.key);
  if (pl) return wantPlural ? pl : line.name;
  const isPl = (n: string) => {
    const first = norm(n).split(' ')[0] ?? '';
    return singularWord(first) !== first;
  };
  const match = names.find(([n]) => isPl(n) === wantPlural);
  return (match ?? names[0])[0] ?? line.name;
}

export function aggregate(sources: Source[], manual: ManualItem[] = []): ShopLine[] {
  const map = new Map<string, ShopLine>();
  const forms = new Map<string, Map<string, number>>();
  for (const s of sources) {
    for (const l of s.lines) {
      for (const p of parseLine(l)) mergeInto(map, p, s.factor, s.id, forms);
    }
  }
  for (const m of manual) {
    const text = m.text.trim();
    if (!text) continue;
    for (const p of parseLine(text)) mergeInto(map, p, 1, null, forms);
  }
  const out: ShopLine[] = [];
  for (const line of map.values()) {
    line.amounts = finishAmounts(line.amounts);
    // o que se compra em lata (milho, ervilha, atum, sardinha, palmito…) fica com as conservas
    if (
      line.amounts.some((a) => a.unit === 'lata') &&
      ['hortifruti', 'mercearia', 'acougue'].includes(line.section)
    ) {
      line.section = 'conservas';
    }
    const f = forms.get(line.key);
    if (f) line.name = pickName(f, line);
    out.push(line);
  }
  return out;
}

export function groupBySection(lines: ShopLine[]): { section: Section; lines: ShopLine[] }[] {
  return SHOP_SECTIONS.map((section) => ({
    section,
    lines: lines
      .filter((l) => l.section === section.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  })).filter((g) => g.lines.length > 0);
}

/* ───────── texto ───────── */

export function formatAmount(a: Amount): string {
  if (a.unit === 'g') return a.qty >= 1000 ? `${formatMetric(a.qty / 1000)} kg` : `${formatMetric(a.qty)} g`;
  if (a.unit === 'ml')
    return a.qty >= 1000
      ? `${formatMetric(a.qty / 1000)} ${a.qty > 1000 ? 'litros' : 'litro'}`
      : `${formatMetric(a.qty)} ml`;
  if (a.unit === 'un') return `${formatNum(a.qty)} un.`;
  const [one, many] = UNIT_LABEL[a.unit];
  return `${formatNum(a.qty)} ${a.qty > 1.0001 ? many : one}`;
}

export function formatAmounts(line: Pick<ShopLine, 'amounts' | 'toTaste'>): string {
  const parts = line.amounts.map(formatAmount);
  if (parts.length === 0) return line.toTaste ? 'a gosto' : '';
  return parts.join(' + ') + (line.toTaste ? ' (+ a gosto)' : '');
}

export function shareText(
  groups: { section: Section; lines: ShopLine[] }[],
  done: ReadonlySet<string>,
): string {
  const out = ['*Lista de compras · CongelaFit*'];
  for (const g of groups) {
    const open = g.lines.filter((l) => !done.has(l.key));
    if (open.length === 0) continue;
    out.push('', `*${g.section.name}*`);
    for (const l of open) {
      const q = formatAmounts(l);
      out.push(`• ${l.name}${q ? ` — ${q}` : ''}`);
    }
  }
  if (out.length === 1) out.push('', 'Tudo comprado!');
  out.push('', 'www.congelafit.com.br');
  return out.join('\n');
}
