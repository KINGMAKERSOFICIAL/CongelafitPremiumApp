import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { apiFetch, apiPutKeepalive } from './api';
import { buildBackup, isBackupKey, type Backup } from './backup';

const PREFIX = 'cfc:';
const OWNER_KEY = 'cfc:__owner';
const listeners = new Set<() => void>();
const cache = new Map<string, string | null>();

let activeSyncUserId: string | null = null;
let hydratingUserId: string | null = null;
let syncTimer: number | null = null;
let dirty = false;
let lifecycleBound = false;

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

function setLocalRaw(key: string, value: string | null) {
  cache.set(key, value);
  try {
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignora */
  }
}

function notify() {
  listeners.forEach((l) => l());
}

function scheduleCloudSync() {
  if (!activeSyncUserId || typeof window === 'undefined') return;
  dirty = true;
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer);
  }
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void flushUserStoreSync(false);
  }, 850);
}

function save(key: string, value: string | null, shouldSync = true) {
  setLocalRaw(key, value);
  notify();
  if (shouldSync && isBackupKey(key)) {
    scheduleCloudSync();
  }
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
 * Valor JSON guardado no aparelho e sincronizado na conta. `update` sempre parte do valor mais recente
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

/* ───────── cópia de segurança e banco do usuário na nuvem ───────── */

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

function applyEntriesSilently(entries: Record<string, string>, ownerId: string) {
  for (const k of allKeys()) {
    setLocalRaw(k, null);
  }
  for (const [k, v] of Object.entries(entries)) {
    if (isBackupKey(k) && typeof v === 'string') {
      setLocalRaw(k, v);
    }
  }
  try {
    localStorage.setItem(OWNER_KEY, ownerId);
  } catch {
    /* ignora */
  }
  notify();
}

function bindLifecycleFlush() {
  if (lifecycleBound || typeof window === 'undefined') return;
  lifecycleBound = true;
  const flushSoon = () => {
    if (dirty && activeSyncUserId) {
      void flushUserStoreSync(true);
    }
  };
  window.addEventListener('pagehide', flushSoon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSoon();
  });
}

export async function flushUserStoreSync(useKeepalive = false): Promise<void> {
  if (typeof window !== 'undefined' && syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!activeSyncUserId || !dirty) return;
  dirty = false;
  const entries = exportData().data;
  if (useKeepalive) {
    apiPutKeepalive('/api/user/data', { entries });
    return;
  }
  try {
    await apiFetch('/api/user/data', {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    });
  } catch {
    dirty = true;
  }
}

export async function hydrateUserStoreFromServer(userId: string): Promise<void> {
  if (!userId || typeof window === 'undefined') return;
  bindLifecycleFlush();
  if (activeSyncUserId === userId && hydratingUserId === null) return;
  if (hydratingUserId === userId) return;

  hydratingUserId = userId;
  try {
    let prevOwner: string | null = null;
    try {
      prevOwner = localStorage.getItem(OWNER_KEY);
    } catch {
      /* ignora */
    }
    if (prevOwner && prevOwner !== userId) {
      for (const k of allKeys()) setLocalRaw(k, null);
      notify();
    }

    const serverState = await apiFetch<{
      entries: Record<string, string>;
      updatedAt: string | null;
    }>('/api/user/data');

    const serverEntries = serverState.entries ?? {};
    const serverCount = Object.keys(serverEntries).length;
    const localEntries = exportData().data;
    const localCount = Object.keys(localEntries).length;

    if (serverCount > 0) {
      applyEntriesSilently(serverEntries, userId);
      dirty = false;
    } else if (localCount > 0) {
      try {
        localStorage.setItem(OWNER_KEY, userId);
      } catch {
        /* ignora */
      }
      await apiFetch('/api/user/data', {
        method: 'PUT',
        body: JSON.stringify({ entries: localEntries }),
      });
      dirty = false;
    } else {
      try {
        localStorage.setItem(OWNER_KEY, userId);
      } catch {
        /* ignora */
      }
    }
    activeSyncUserId = userId;
  } catch {
    activeSyncUserId = userId;
  } finally {
    if (hydratingUserId === userId) hydratingUserId = null;
  }
}

export function resetLocalStoreOnLogout(): void {
  if (typeof window !== 'undefined' && syncTimer !== null) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }
  activeSyncUserId = null;
  hydratingUserId = null;
  dirty = false;
  for (const k of allKeys()) setLocalRaw(k, null);
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* ignora */
  }
  notify();
}

/** Substitui TODOS os dados do app pelos do backup já validado. */
export function importData(data: Record<string, string>) {
  for (const k of allKeys()) setLocalRaw(k, null);
  for (const [k, v] of Object.entries(data)) {
    if (isBackupKey(k) && typeof v === 'string') {
      setLocalRaw(k, v);
    }
  }
  notify();
  scheduleCloudSync();
}

export function clearAllData() {
  for (const k of allKeys()) setLocalRaw(k, null);
  notify();
  scheduleCloudSync();
}
