/**
 * Datas do app como texto "AAAA-MM-DD" (dia do calendário, sem fuso).
 * Evita o clássico erro de virar o dia por causa de horário de verão/UTC.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

export function isISO(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** Soma dias (pode ser negativo). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Soma meses do calendário; 31/01 + 1 mês = 28 ou 29/02 (nunca "pula" para março). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

/** Dias entre duas datas (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Segunda-feira da semana da data. */
export function startOfWeek(iso: string): string {
  const [y, m, d] = parts(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(iso, -((dow + 6) % 7));
}

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** 0 = segunda … 6 = domingo. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = parts(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "16/11/2026" */
export function fmtDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** "16/11" */
export function fmtDM(iso: string): string {
  const [, m, d] = parts(iso);
  return `${pad(d)}/${pad(m)}`;
}

/** Texto relativo: "hoje", "amanhã", "em 12 dias", "há 3 dias". */
export function relativeDays(n: number): string {
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}
