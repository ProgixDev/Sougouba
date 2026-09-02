'use client';

/**
 * Browser-localStorage-backed table, the same spirit as the mobile app's
 * `data/utils/persistedTable.ts` (seed rows + a storage overlay so edits
 * survive a reload) ported for a DOM environment instead of AsyncStorage.
 */
export function loadTable<T extends { id: string }>(key: string, seed: T[]): T[] {
  if (typeof window === 'undefined') return seed;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return seed;
    return JSON.parse(raw) as T[];
  } catch {
    return seed;
  }
}

export function saveTable<T>(key: string, rows: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {}
}

export function loadValue<T>(key: string, seed: T): T {
  if (typeof window === 'undefined') return seed;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return seed;
    return JSON.parse(raw) as T;
  } catch {
    return seed;
  }
}

export function saveValue<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Simulates network latency so screens exercise real loading states against mock data. */
export function delay(minMs = 250, maxMs = 550): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let counter = 0;
export function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
