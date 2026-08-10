import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ID } from '@/data/types';
import { asyncStorage } from './storage';

interface FavoritesState {
  productIds: ID[];
  vendorIds: ID[];
  toggleProduct: (id: ID) => void;
  toggleVendor: (id: ID) => void;
  isProductFavorite: (id: ID) => boolean;
  isVendorFavorite: (id: ID) => boolean;
  reset: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      productIds: [],
      vendorIds: [],
      toggleProduct: (id) =>
        set((state) => ({
          productIds: state.productIds.includes(id)
            ? state.productIds.filter((p) => p !== id)
            : [...state.productIds, id],
        })),
      toggleVendor: (id) =>
        set((state) => ({
          vendorIds: state.vendorIds.includes(id)
            ? state.vendorIds.filter((v) => v !== id)
            : [...state.vendorIds, id],
        })),
      isProductFavorite: (id) => get().productIds.includes(id),
      isVendorFavorite: (id) => get().vendorIds.includes(id),
      reset: () => set({ productIds: [], vendorIds: [] }),
    }),
    {
      name: 'sougouba-favorites',
      storage: asyncStorage,
    }
  )
);
