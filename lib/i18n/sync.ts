import { useLanguageStore } from '@/store/useLanguageStore';
import { i18n } from './index';

/**
 * Binds the global `i18n.locale` to the language store. Side-effect module —
 * imported once, from `app/_layout.tsx`, right after `@/lib/devLogs`.
 *
 * A store subscription rather than a `useEffect`, and that distinction is the
 * whole reason there is no flash of French on an English phone:
 *
 *  1. This line runs at import. `useLanguageStore`'s initial `locale` is
 *     `detectDeviceLocale()`, a synchronous native read, so the language is
 *     already right for anyone who never overrode it — before React renders
 *     anything.
 *  2. `RootLayout` returns `null` until `useStoreHydration()` resolves, so the
 *     native splash still covers the app. Nothing has been painted.
 *  3. AsyncStorage resolves, `persist`'s `merge` runs, and `set()` notifies
 *     subscribers **synchronously** — this subscription applies the pinned
 *     override *before* `onFinishHydration` fires.
 *  4. `onFinishHydration` flips the hydration gate, the tree renders, the
 *     splash hides.
 *
 * The locale is final one full step before the first pixel. A `useEffect` would
 * run in step 4, after the first commit — one frame too late, which is exactly
 * the flash this avoids.
 */
i18n.locale = useLanguageStore.getState().locale;

useLanguageStore.subscribe((state, previous) => {
  if (state.locale !== previous.locale) {
    i18n.locale = state.locale;
  }
});
