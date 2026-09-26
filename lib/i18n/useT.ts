import { useCallback } from 'react';

import { selectLocale, useLanguageStore } from '@/store/useLanguageStore';
import { type AppLocale, i18n } from './index';
import type { Message, MessageKey, TFunction, TranslateParams } from './types';

/**
 * The translate function, bound to the active language.
 *
 * Subscribing to the store is the entire point. `i18n.locale = 'en'` is a
 * mutation React cannot observe, so a component that never reads the language
 * store never re-renders and keeps its French labels until something unrelated
 * happens to invalidate it. **Calling this hook is the subscription.**
 *
 * The returned `t` pins the locale it was built with rather than reading the
 * global, so it is a stable dependency and cannot render half a screen in one
 * language and half in the other mid-switch.
 */
export function useT(): TFunction {
  const locale = useLanguageStore(selectLocale);

  return useCallback(
    (key: MessageKey | Message, params?: TranslateParams) =>
      typeof key === 'string'
        ? i18n.t(key, { locale, ...params })
        : i18n.t(key.key, { locale, ...key.params }),
    [locale]
  );
}

/**
 * The active language, for components that format money, dates or distances but
 * render no translated string of their own.
 *
 * Those components still have to subscribe to something or their numbers will
 * not re-format on a switch — `formatCad` reads the global locale and React has
 * no idea it changed. `scripts/verify-i18n.ts` checks that every file importing
 * `@/lib/format` or `@/lib/geo` calls this or `useT()`.
 */
export function useLocale(): AppLocale {
  return useLanguageStore(selectLocale);
}
