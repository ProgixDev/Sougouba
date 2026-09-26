import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type AppLocale, detectDeviceLocale } from '@/lib/i18n';
import { asyncStorage } from './storage';

interface LanguageState {
  /**
   * `null` means "follow the device". Only an explicit choice in Préférences
   * pins a language, and once pinned it survives a system language change — a
   * shopper who picked English on a French phone meant it.
   */
  preference: AppLocale | null;
  /**
   * The language actually in effect. Derived from `preference`, but held as a
   * field so the common read is a plain property access and
   * `useLanguageStore(selectLocale)` is referentially stable — a selector that
   * computed this would hand back a fresh value on every store write and
   * re-render every screen in the app.
   */
  locale: AppLocale;
  setPreference: (preference: AppLocale | null) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      preference: null,
      locale: detectDeviceLocale(),
      setPreference: (preference) => set({ preference, locale: preference ?? detectDeviceLocale() }),
    }),
    {
      name: 'sougouba-language',
      storage: asyncStorage,
      /**
       * Only the *choice* is persisted. Writing `locale` to storage would freeze
       * last session's device language into it, so a phone switched to English
       * between launches would keep opening in French for a user who never
       * pinned anything.
       */
      partialize: (state) => ({ preference: state.preference }),
      merge: (persisted, current) => {
        const preference = (persisted as Partial<LanguageState> | undefined)?.preference ?? null;
        return { ...current, preference, locale: preference ?? detectDeviceLocale() };
      },
    }
  )
);

/** Stable selector — see the note on `locale` above. */
export const selectLocale = (state: LanguageState): AppLocale => state.locale;
