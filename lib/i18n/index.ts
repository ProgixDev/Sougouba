import { I18n } from 'i18n-js';

import { en } from './locales/en';
import { fr } from './locales/fr';
import { registerPluralizers } from './pluralization';
import type { Message, MessageKey, TranslateParams } from './types';

/**
 * `__DEV__` is injected by the React Native bundler and simply does not exist
 * in Node, where `scripts/verify-*.ts` import this module through `lib/format`.
 * `typeof` is the only safe way to read an undeclared global.
 */
export const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** French is the product's language of record; English is the addition. */
export const DEFAULT_LOCALE: AppLocale = 'fr';

export const i18n = new I18n(
  { fr, en },
  {
    defaultLocale: DEFAULT_LOCALE,
    locale: DEFAULT_LOCALE,
    /**
     * A key present in French but not yet written in English renders the French
     * rather than a hole. The `Catalogue` annotation on `locales/en` already
     * forbids that, so this only ever fires on a hot reload where one catalogue
     * recompiled and the other did not.
     */
    enableFallback: true,
    /**
     * Dev shouts, production degrades. `'guess'` turns `customer.cart.title`
     * into "Title" — wrong, but readable; the i18n-js default renders
     * `[missing "en.customer.cart.title" translation]`, which is a bug report
     * delivered to a shopper.
     */
    missingBehavior: IS_DEV ? 'message' : 'guess',
  }
);

registerPluralizers(i18n);

if (IS_DEV) {
  i18n.missingTranslation.register('message', (_i18n, scope) => {
    console.warn(`[i18n] missing key: ${String(scope)}`);
    return `⟦${String(scope)}⟧`;
  });
}

function isSupported(code: string | null | undefined): code is AppLocale {
  return !!code && (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

/**
 * The device's preferred app language, or French.
 *
 * `getLocales()` is a synchronous native read, so it is safe to call during
 * module initialisation — but the one rule this codebase has about import time
 * (see the note atop `data/utils/time.ts`) is that nothing there may throw.
 * Hence the guard: an unavailable native module degrades to French rather than
 * taking the splash screen down with it.
 */
export function detectDeviceLocale(): AppLocale {
  try {
    // Required lazily, not imported at the top of the file. `lib/format.ts` and
    // the label tables under `lib/` reach this module, and those are imported by
    // `scripts/verify-*.ts` under bare `tsx` — where a top-level
    // `expo-localization` drags in the whole React Native runtime and the
    // transform fails on `react-native/index.js`. A `require` inside the guard
    // keeps `lib/` runnable in Node, which is what the verify scripts depend on.
    const { getLocales } = require('expo-localization') as {
      getLocales: () => { languageCode: string | null }[];
    };
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (isSupported(code)) return code;
    }
  } catch (error) {
    if (IS_DEV) console.warn('[i18n] expo-localization unavailable, using French:', error);
  }
  return DEFAULT_LOCALE;
}

/** The locale in effect right now. For formatters and other non-component code. */
export function currentLocale(): AppLocale {
  return isSupported(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
}

/**
 * Module-level translate.
 *
 * Reads the *current* global locale, so it is correct only when called during a
 * render or an event — never at module scope. Anything evaluated at import time
 * (a label map, a zod message, a `const` array of rows) must hold a **key**,
 * not a call to this; `scripts/verify-i18n.ts` enforces that.
 *
 * Inside a component, prefer `useT()`: it also subscribes to locale changes,
 * which this cannot do.
 */
export function t(key: MessageKey | Message, params?: TranslateParams): string {
  return typeof key === 'string' ? i18n.t(key, params) : i18n.t(key.key, key.params);
}

export type { Message, MessageKey, TFunction, TranslateParams } from './types';
