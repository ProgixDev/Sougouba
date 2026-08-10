import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CartItem, ID } from '@/data/types';
import { asyncStorage } from './storage';

interface AddItemInput {
  productId: ID;
  vendorId: ID;
  unitPriceCad: number;
  qty?: number;
}

interface CartState {
  vendorId: ID | null;
  items: CartItem[];
  /** Set when addItem() is blocked by a vendor conflict — surface a confirm dialog, then call resolveVendorSwitch(). */
  pendingItem: AddItemInput | null;
  addItem: (input: AddItemInput) => void;
  resolveVendorSwitch: (confirm: boolean) => void;
  removeItem: (productId: ID) => void;
  setQty: (productId: ID, qty: number) => void;
  clear: () => void;
  subtotalCad: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      vendorId: null,
      items: [],
      pendingItem: null,

      addItem: (input) => {
        const { vendorId, items } = get();
        if (vendorId && vendorId !== input.vendorId) {
          set({ pendingItem: input });
          return;
        }
        set({
          vendorId: input.vendorId,
          items: upsertItem(items, input),
          pendingItem: null,
        });
      },

      resolveVendorSwitch: (confirm) => {
        const { pendingItem } = get();
        if (!pendingItem) return;
        if (confirm) {
          set({
            vendorId: pendingItem.vendorId,
            items: upsertItem([], pendingItem),
            pendingItem: null,
          });
        } else {
          set({ pendingItem: null });
        }
      },

      removeItem: (productId) =>
        set((state) => {
          const items = state.items.filter((i) => i.productId !== productId);
          return { items, vendorId: items.length > 0 ? state.vendorId : null };
        }),

      setQty: (productId, qty) =>
        set((state) => ({
          items: state.items
            .map((i) => (i.productId === productId ? { ...i, qty } : i))
            .filter((i) => i.qty > 0),
        })),

      clear: () => set({ vendorId: null, items: [], pendingItem: null }),

      subtotalCad: () => get().items.reduce((sum, i) => sum + i.unitPriceCad * i.qty, 0),
    }),
    {
      name: 'sougouba-cart',
      storage: asyncStorage,
      partialize: (state) => ({ vendorId: state.vendorId, items: state.items }),
    }
  )
);

function upsertItem(items: CartItem[], input: AddItemInput): CartItem[] {
  const existing = items.find((i) => i.productId === input.productId);
  if (existing) {
    return items.map((i) =>
      i.productId === input.productId ? { ...i, qty: i.qty + (input.qty ?? 1) } : i
    );
  }
  return [
    ...items,
    { productId: input.productId, vendorId: input.vendorId, qty: input.qty ?? 1, unitPriceCad: input.unitPriceCad },
  ];
}
