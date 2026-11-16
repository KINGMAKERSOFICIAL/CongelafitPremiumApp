/**
 * Escala as quantidades de um ingrediente ("2 colheres (sopa) de azeite (30 ml)").
 * Só mexe no número inicial, nos números entre parênteses com unidade de peso/volume
 * ("(cerca de 300 g)") e em "Suco de 2 limões"; o resto do texto fica como está.
 */

const FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const GLYPH: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

// 1 e 1/2 · 1 1/2 · 2 ½ · 1/2 · ½ · 1,5 · 3
const NUM = String.raw`(?:\d+\s*(?:e\s+)?(?:\d+\/\d+|[½¼¾⅓⅔⅛])|\d+\/\d+|[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?)`;
const RANGE = String.raw`(${NUM})(?:(\s*(?:a|ou|-|–)\s*)(${NUM}))?`;
const LEAD = new RegExp(String.raw`^${RANGE}`);
const NOUN_DE = new RegExp(
  String.raw`^((?:Suco|Raspas?|Polpa|Casca|Folhas?|Talos?|Gomos?|Fatias?)\s+(?:de|do|da)\s+)${RANGE}`,
  'i',
);
const PAREN = new RegExp(String.raw`\(((?:cerca de |aprox\. )?)(${NUM})\s*(g|kg|ml|l|litros?)\)`, 'gi');

export function parseNum(tok: string): number {
  const t = tok.trim();
  let m = t.match(/^(\d+)\s*(?:e\s+)?(\d+)\/(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  m = t.match(/^(\d+)\s*(?:e\s+)?([½¼¾⅓⅔⅛])$/);
  if (m) return +m[1] + FRAC[m[2]];
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return +m[1] / +m[2];
  if (FRAC[t] !== undefined) return FRAC[t];
  return parseFloat(t.replace(',', '.'));
}

export function formatNum(x: number): string {
  if (!isFinite(x) || x <= 0) return '0';
  if (x >= 20) return String(Math.round(x));
  const whole = Math.floor(x + 1e-9);
  const frac = x - whole;
  if (frac < 0.04) return String(whole);
  if (frac > 0.96) return String(whole + 1);
  for (const [v, g] of GLYPH) {
    if (Math.abs(frac - v) < 0.04) return whole ? `${whole} ${g}` : g;
  }
  const dec = x >= 5 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100;
  return String(dec).replace('.', ',');
}

/** Para pesos e volumes (g, ml): decimal com vírgula, sem frações. */
export function formatMetric(x: number): string {
  if (x >= 100) return String(Math.round(x));
  const r = Math.round(x * 10) / 10;
  return String(r).replace('.', ',');
}

const METRIC_AFTER = /^\s*(?:g|kg|mg|ml|l)\b/i;

const NO_PLURAL = new Set(['g', 'kg', 'mg', 'ml', 'l', 'cm', 'mm', 'ºc', '°c']);

export function toPlural(w: string): string {
  if (/(ão)$/i.test(w)) {
    if (/^p(ã)o$/i.test(w) || /^pão$/i.test(w)) return w.slice(0, -2) + 'ães';
    return w.slice(0, -2) + 'ões';
  }
  if (/[rz]$/i.test(w)) return w + 'es';
  if (/m$/i.test(w)) return w.slice(0, -1) + 'ns';
  if (/[aeiouáéíóúâêôãõ]$/i.test(w)) return w + 's';
  return w;
}

function toSingular(w: string): string {
  if (/ães$/i.test(w)) return w.slice(0, -3) + 'ão';
  if (/ões$/i.test(w)) return w.slice(0, -3) + 'ão';
  if (/(res|zes)$/i.test(w)) return w.slice(0, -2);
  if (/ns$/i.test(w)) return w.slice(0, -2) + 'm';
  if (/s$/i.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Ajusta singular/plural da primeira palavra depois da quantidade. */
function agree(rest: string, value: number): string {
  const m = rest.match(/^(\s*)([A-Za-zÀ-ÿ]+)/);
  if (!m) return rest;
  const word = m[2];
  if (NO_PLURAL.has(word.toLowerCase())) return rest;
  const wantPlural = value > 1.0001;
  const isPlural = /s$/i.test(word) && word.length > 3;
  if (wantPlural === isPlural) return rest;
  const neu = wantPlural ? toPlural(word) : toSingular(word);
  return m[1] + neu + rest.slice(m[0].length);
}

function scaleRange(a: string, sep: string | undefined, b: string | undefined, f: number, metric = false) {
  const fmt = metric ? formatMetric : formatNum;
  const va = parseNum(a) * f;
  const vb = b !== undefined ? parseNum(b) * f : undefined;
  const text = fmt(va) + (vb !== undefined && sep ? sep + fmt(vb) : '');
  return { text, value: vb !== undefined ? vb : va };
}

/** Quantidade no início da linha ("2 e 1/2 xícaras…" → 2,5). Faixas ("2 a 3") valem pelo maior valor. */
export function leadingQty(line: string): { value: number; rest: string } | null {
  const m = line.match(LEAD);
  if (!m) return null;
  const a = parseNum(m[1]);
  const b = m[3] !== undefined ? parseNum(m[3]) : undefined;
  return { value: b !== undefined ? Math.max(a, b) : a, rest: line.slice(m[0].length) };
}

export function scaleIngredient(line: string, f: number): string {
  if (!f || Math.abs(f - 1) < 1e-9) return line;
  let out = line;

  const lead = out.match(LEAD);
  const nd = out.match(NOUN_DE);
  if (lead) {
    const tail = out.slice(lead[0].length);
    const { text, value } = scaleRange(lead[1], lead[2], lead[3], f, METRIC_AFTER.test(tail));
    const rest = agree(tail, value);
    out = text + rest;
  } else if (nd) {
    const { text, value } = scaleRange(nd[2], nd[3], nd[4], f);
    const rest = agree(out.slice(nd[0].length), value);
    out = nd[1] + text + rest;
  }

  out = out.replace(PAREN, (_m, pre: string, num: string, unit: string) => {
    let v = parseNum(num) * f;
    let u = unit.toLowerCase();
    if (u === 'g' && v >= 1000) {
      v /= 1000;
      u = 'kg';
    } else if (u === 'ml' && v >= 1000) {
      v /= 1000;
      u = 'litros';
    } else if (/^litro/.test(u)) {
      u = v > 1.0001 ? 'litros' : 'litro';
    }
    return `(${pre}${formatMetric(v)} ${u})`;
  });
  return out;
}
