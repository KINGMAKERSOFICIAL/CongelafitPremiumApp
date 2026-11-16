import { useSyncExternalStore } from 'react';

export interface ToastMsg {
  id: number;
  text: string;
  /** Link opcional ("Ver lista"). */
  to?: string;
  linkLabel?: string;
}

let list: ToastMsg[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, opts: { to?: string; linkLabel?: string } = {}) {
  const t: ToastMsg = { id: ++seq, text, ...opts };
  list = [...list.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), opts.to ? 6000 : 3500);
}

export function dismiss(id: number) {
  const next = list.filter((t) => t.id !== id);
  if (next.length !== list.length) {
    list = next;
    emit();
  }
}

export function useToasts(): ToastMsg[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => list,
    () => list,
  );
}
