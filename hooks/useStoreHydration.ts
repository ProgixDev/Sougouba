import { useEffect, useState } from 'react';

import { useCartStore } from '@/store/useCartStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useThemeStore } from '@/store/useThemeStore';

/**
 * Zustand's persist middleware only flips `hasHydrated` on the success path — a
 * corrupted payload or an AsyncStorage failure leaves it false forever, which
 * would pin the app on the native splash with no way out. Cap the wait so a bad
 * read degrades to defaults instead of a hang.
 */
const HYDRATION_TIMEOUT_MS = 3000;

const persistedStores = [
  useSessionStore,
  useThemeStore,
  useCartStore,
  useFavoritesStore,
  usePreferencesStore,
];

/**
 * True once every persisted store has rehydrated (or the timeout fired).
 * Gating on all of them — not just the session — avoids a first frame painted
 * with default light theme / empty cart before those stores catch up.
 */
export function useStoreHydration(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    persistedStores.every((store) => store.persist.hasHydrated())
  );

  useEffect(() => {
    if (hydrated) return;

    let cancelled = false;
    const check = () => {
      if (!cancelled && persistedStores.every((store) => store.persist.hasHydrated())) {
        setHydrated(true);
      }
    };

    const unsubscribers = persistedStores.map((store) => store.persist.onFinishHydration(check));
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('[sougouba] Store hydration timed out — continuing with defaults.');
        setHydrated(true);
      }
    }, HYDRATION_TIMEOUT_MS);

    // A store may have finished between the initial state and the subscription.
    check();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [hydrated]);

  return hydrated;
}
