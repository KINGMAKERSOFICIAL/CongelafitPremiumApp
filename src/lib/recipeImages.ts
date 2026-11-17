import { useSyncExternalStore } from 'react';
import { apiFetch } from './api';

let overrides: Record<string, string> = {};
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRecipeImageOverride(recipeId: string): string | undefined {
  return overrides[recipeId];
}

export function setRecipeImageOverrides(next: Record<string, string>): void {
  overrides = next;
  notify();
}

export function updateRecipeImageOverride(recipeId: string, url: string | null): void {
  const copy = { ...overrides };
  if (url) copy[recipeId] = url;
  else delete copy[recipeId];
  overrides = copy;
  notify();
}

export function clearRecipeImageOverrides(): void {
  overrides = {};
  notify();
}

export async function loadRecipeImageOverrides(): Promise<void> {
  try {
    const res = await apiFetch<{ images: Record<string, string> }>('/api/recipe-images');
    setRecipeImageOverrides(res.images ?? {});
  } catch {
    /* ignora se ainda não autenticado */
  }
}

export function useRecipeImageOverrides(): Record<string, string> {
  return useSyncExternalStore(
    subscribe,
    () => overrides,
    () => overrides,
  );
}
