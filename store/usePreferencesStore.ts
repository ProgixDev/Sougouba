import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { asyncStorage } from './storage';

export interface NotificationPreferences {
  orderUpdates: boolean;
  deliveryAlerts: boolean;
  promotions: boolean;
  newVendors: boolean;
}

interface PreferencesState {
  notifications: NotificationPreferences;
  setNotification: (key: keyof NotificationPreferences, value: boolean) => void;
  reset: () => void;
}

const defaultNotifications: NotificationPreferences = {
  orderUpdates: true,
  deliveryAlerts: true,
  promotions: false,
  newVendors: false,
};

/**
 * Account preferences that aren't part of the session identity: which
 * notifications are on.
 *
 * There are no cards here any more, on purpose. Sougouba never holds payment
 * details — Stripe's payment sheet collects the card at checkout and keeps it
 * on Stripe's side. Version 1's `migrate` deletes the old mock card list from
 * devices that still carry it.
 *
 * Kept out of `useSessionStore` because that store is the session gate — every
 * guard in the app reads it, and a notification toggle should not re-render
 * routing. Cleared on sign-out alongside the cart and favourites.
 */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      notifications: defaultNotifications,

      setNotification: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),

      reset: () => set({ notifications: defaultNotifications }),
    }),
    {
      name: 'sougouba-preferences',
      storage: asyncStorage,
      version: 1,
      migrate: (persisted) => {
        // v0 → v1: drop `paymentMethods`. Keeps only what this store still owns.
        const old = (persisted ?? {}) as Partial<PreferencesState>;
        return { notifications: old.notifications ?? defaultNotifications } as PreferencesState;
      },
    }
  )
);
