/** Minúsculas e sem acentos — para busca. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function basisLabel(b: 'porção' | 'unidade' | 'colher'): string {
  return b === 'porção' ? 'por porção' : b === 'unidade' ? 'por unidade' : 'por colher (sopa)';
}

export function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}
