import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { foldSearch, withRecentSearch } from '../lib/searchSuggestions';
import { asyncStorage } from './storage';

interface RecentSearchesState {
  /** Newest first. */
  terms: string[];
  add: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
}

/**
 * What this phone searched for lately, offered back when the search field is
 * focused and empty.
 *
 * Kept on the device and nowhere else: it is a convenience, not data the
 * platform needs, and a search history on a server is one more thing to
 * secure, export and delete. Cleared on sign-out with the cart and favourites,
 * so the next account on this phone does not read the last one's searches.
 *
 * Not in `useStoreHydration`'s list on purpose — nothing on the first frame
 * reads it, and the splash should not wait for it.
 */
export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      terms: [],
      add: (term) => set((state) => ({ terms: withRecentSearch(state.terms, term) })),
      remove: (term) =>
        set((state) => ({ terms: state.terms.filter((entry) => foldSearch(entry) !== foldSearch(term)) })),
      clear: () => set({ terms: [] }),
    }),
    {
      name: 'sougouba-recent-searches',
      storage: asyncStorage,
      partialize: (state) => ({ terms: state.terms }),
    }
  )
);
