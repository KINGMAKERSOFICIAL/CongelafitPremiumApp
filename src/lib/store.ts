import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { buildBackup, isBackupKey, type Backup } from './backup';

const PREFIX = 'cfc:';
const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

function raw(key: string): string | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  let v: string | null = null;
  try {
    v = localStorage.getItem(PREFIX + key);
  } catch {
    /* armazenamento indisponível (modo privado): segue só em memória */
  }
  cache.set(key, v);
  return v;
}

function save(key: string, value: string | null) {
  cache.set(key, value);
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignora */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(PREFIX)) {
      cache.delete(e.key.slice(PREFIX.length));
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function getStored<T>(key: string, fallback: T): T {
  const v = raw(key);
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export function setStored<T>(key: string, value: T | null) {
  save(key, value === null || value === undefined ? null : JSON.stringify(value));
}

/** Gera um id curto e único (suficiente para dados locais). */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Valor JSON guardado no aparelho. `update` sempre parte do valor mais recente
 * (vários toques seguidos não se perdem). O retorno só muda quando o conteúdo muda.
 */
export function useStored<T>(key: string, fallback: T): [T, (fn: (cur: T) => T) => void] {
  const snap = useSyncExternalStore(
    subscribe,
    () => raw(key),
    () => null,
  );
  const value = useMemo(() => {
    if (!snap) return fallback;
    try {
      return JSON.parse(snap) as T;
    } catch {
      return fallback;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);
  const update = useCallback(
    (fn: (cur: T) => T) => setStored(key, fn(getStored(key, fallback))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, update];
}

/** Lista de textos/números guardada no aparelho. O retorno só muda quando o conteúdo muda. */
function useStoredList<T extends string | number>(key: string): [T[], (next: T[]) => void] {
  const snap = useSyncExternalStore(
    subscribe,
    () => raw(key),
    () => null,
  );
  let list: T[] = [];
  if (snap) {
    try {
      const p = JSON.parse(snap);
      if (Array.isArray(p)) list = p as T[];
    } catch {
      list = [];
    }
  }
  const set = useCallback((next: T[]) => save(key, next.length ? JSON.stringify(next) : null), [key]);
  return [list, set];
}

export function useFavorites() {
  const [list, set] = useStoredList<string>('fav');
  const has = (id: string) => list.includes(id);
  const toggle = (id: string) => set(has(id) ? list.filter((x) => x !== id) : [id, ...list]);
  return { list, has, toggle };
}

/** Marcações (ingredientes separados / passos feitos) de uma receita. */
export function useMarks(kind: 'ing' | 'step', id: string) {
  const [list, set] = useStoredList<number>(`${kind}:${id}`);
  const has = (i: number) => list.includes(i);
  const toggle = (i: number) =>
    set(has(i) ? list.filter((x) => x !== i) : [...list, i].sort((a, b) => a - b));
  const clear = () => set([]);
  return { list, has, toggle, clear };
}

/* ───────── cópia de segurança ───────── */

function allKeys(): string[] {
  const keys = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.add(k.slice(PREFIX.length));
    }
  } catch {
    /* sem armazenamento: só o que está em memória */
  }
  for (const [k, v] of cache) if (v !== null) keys.add(k);
  return [...keys].filter(isBackupKey);
}

export function exportData(): Backup {
  const entries: Record<string, string> = {};
  for (const k of allKeys()) {
    const v = raw(k);
    if (v !== null) entries[k] = v;
  }
  return buildBackup(entries);
}

/** Substitui TODOS os dados do app pelos do backup já validado. */
export function importData(data: Record<string, string>) {
  for (const k of allKeys()) save(k, null);
  for (const [k, v] of Object.entries(data)) save(k, v);
}

export function clearAllData() {
  for (const k of allKeys()) save(k, null);
}
