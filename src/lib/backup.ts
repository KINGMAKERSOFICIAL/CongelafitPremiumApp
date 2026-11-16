/**
 * Cópia de segurança dos dados do app (tudo fica só no aparelho).
 * Funções puras: quem lê/grava o armazenamento é o store.ts.
 */

export const BACKUP_APP = 'congelafit-premium';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, string>;
}

/** Só estas chaves entram na cópia (evita importar lixo de arquivos alheios). */
const KEY_OK = /^(fav|fz|plan|shop\.[a-z]+|ing:[\w-]+|step:[\w-]+|prefs)$/;

export function isBackupKey(key: string): boolean {
  return KEY_OK.test(key);
}

export function buildBackup(entries: Record<string, string>, now: Date = new Date()): Backup {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) if (isBackupKey(k) && typeof v === 'string') data[k] = v;
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export type ParseResult =
  { ok: true; data: Record<string, string>; count: number } | { ok: false; error: string };

export function parseBackup(text: string): ParseResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Arquivo de backup inválido.' };
  const b = obj as Partial<Backup>;
  if (b.app !== BACKUP_APP)
    return { ok: false, error: 'Este arquivo não é um backup do CongelaFit Premium.' };
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION)
    return { ok: false, error: 'Backup de uma versão mais nova do app. Atualize o app e tente de novo.' };
  if (!b.data || typeof b.data !== 'object') return { ok: false, error: 'O backup está vazio.' };
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.data)) {
    if (!isBackupKey(k) || typeof v !== 'string') continue;
    try {
      JSON.parse(v);
    } catch {
      continue; // valor corrompido: ignora só esta chave
    }
    data[k] = v;
  }
  return { ok: true, data, count: Object.keys(data).length };
}

export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `congelafit-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
