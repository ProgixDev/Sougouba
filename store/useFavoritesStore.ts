import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { setProduct, setVendor } from '@/data/api/favorites';
import type { ID } from '@/data/types';
import { asyncStorage } from './storage';

interface FavoritesState {
  productIds: ID[];
  vendorIds: ID[];
  toggleProduct: (id: ID) => void;
  toggleVendor: (id: ID) => void;
  isProductFavorite: (id: ID) => boolean;
  isVendorFavorite: (id: ID) => boolean;
  /** Replace the local lists with the account's own, read from the API at sign-in. */
  hydrate: (productIds: ID[], vendorIds: ID[]) => void;
  reset: () => void;
}

/**
 * Toggles are optimistic — the heart fills on tap — and written to the API
 * behind it. A failed write puts the heart back, so the screen never shows a
 * favourite the account does not have.
 */
function without(list: ID[], id: ID): ID[] {
  return list.filter((x) => x !== id);
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      productIds: [],
      vendorIds: [],
      toggleProduct: (id) => {
        const next = !get().productIds.includes(id);
        set((state) => ({ productIds: next ? [...state.productIds, id] : without(state.productIds, id) }));
        setProduct(id, next).catch(() =>
          set((state) => ({ productIds: next ? without(state.productIds, id) : [...state.productIds, id] }))
        );
      },
      toggleVendor: (id) => {
        const next = !get().vendorIds.includes(id);
        set((state) => ({ vendorIds: next ? [...state.vendorIds, id] : without(state.vendorIds, id) }));
        setVendor(id, next).catch(() =>
          set((state) => ({ vendorIds: next ? without(state.vendorIds, id) : [...state.vendorIds, id] }))
        );
      },
      isProductFavorite: (id) => get().productIds.includes(id),
      isVendorFavorite: (id) => get().vendorIds.includes(id),
      hydrate: (productIds, vendorIds) => set({ productIds, vendorIds }),
      reset: () => set({ productIds: [], vendorIds: [] }),
    }),
    {
      name: 'sougouba-favorites',
      storage: asyncStorage,
    }
  )
);
