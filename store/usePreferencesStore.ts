import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ID } from '@/data/types';
import { asyncStorage } from './storage';

export type PaymentBrand = 'visa' | 'mastercard' | 'interac';

export interface PaymentMethod {
  id: ID;
  brand: PaymentBrand;
  /** Last four digits only — the prototype never holds a full number. */
  last4: string;
  /** "MM/AA" as the shopper typed it. */
  expiry: string;
  holder: string;
  isDefault: boolean;
}

export interface NotificationPreferences {
  orderUpdates: boolean;
  deliveryAlerts: boolean;
  promotions: boolean;
  newVendors: boolean;
}

interface PreferencesState {
  notifications: NotificationPreferences;
  paymentMethods: PaymentMethod[];
  setNotification: (key: keyof NotificationPreferences, value: boolean) => void;
  addPaymentMethod: (method: Omit<PaymentMethod, 'id' | 'isDefault'>) => void;
  removePaymentMethod: (id: ID) => void;
  setDefaultPaymentMethod: (id: ID) => void;
  reset: () => void;
}

/**
 * The two seeded cards exist so Moyens de paiement is a working list on first
 * open rather than an empty state the shopper has to fill in before the screen
 * shows what it does.
 */
const seededMethods: PaymentMethod[] = [
  { id: 'pay_seed_visa', brand: 'visa', last4: '4291', expiry: '11/28', holder: 'Titulaire principal', isDefault: true },
  { id: 'pay_seed_interac', brand: 'interac', last4: '8830', expiry: '03/27', holder: 'Titulaire principal', isDefault: false },
];

const defaultNotifications: NotificationPreferences = {
  orderUpdates: true,
  deliveryAlerts: true,
  promotions: false,
  newVendors: false,
};

/**
 * Account preferences that aren't part of the session identity: which
 * notifications are on, and which cards are on file.
 *
 * Kept out of `useSessionStore` because that store is the session gate — every
 * guard in the app reads it, and a notification toggle should not re-render
 * routing. Cleared on sign-out alongside the cart and favourites.
 */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      notifications: defaultNotifications,
      paymentMethods: seededMethods,

      setNotification: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),

      addPaymentMethod: (method) =>
        set((state) => {
          const id = `pay_${Date.now().toString(36)}`;
          // First card on an empty list has to be the default, or checkout has
          // nothing selected.
          const isDefault = state.paymentMethods.length === 0;
          return { paymentMethods: [...state.paymentMethods, { ...method, id, isDefault }] };
        }),

      removePaymentMethod: (id) =>
        set((state) => {
          const remaining = state.paymentMethods.filter((m) => m.id !== id);
          // Removing the default promotes the next card rather than leaving the
          // list with no default at all.
          if (remaining.length > 0 && !remaining.some((m) => m.isDefault)) {
            remaining[0] = { ...remaining[0], isDefault: true };
          }
          return { paymentMethods: remaining };
        }),

      setDefaultPaymentMethod: (id) =>
        set((state) => ({
          paymentMethods: state.paymentMethods.map((m) => ({ ...m, isDefault: m.id === id })),
        })),

      reset: () => set({ notifications: defaultNotifications, paymentMethods: seededMethods }),
    }),
    {
      name: 'sougouba-preferences',
      storage: asyncStorage,
    }
  )
);
