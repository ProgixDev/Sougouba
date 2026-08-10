import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { asyncStorage } from './storage';

export type ThemePreference = 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'light',
      setPreference: (preference) => set({ preference }),
      toggle: () => set({ preference: get().preference === 'dark' ? 'light' : 'dark' }),
    }),
    {
      name: 'sougouba-theme',
      storage: asyncStorage,
    }
  )
);
