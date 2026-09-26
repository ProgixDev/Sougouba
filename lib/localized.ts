import type { Locale, LocalizedText } from '@/data/types';
import { currentLocale } from '@/lib/i18n';
import { useLocale } from '@/lib/i18n/useT';

/**
 * Read a back-office string in a given language, falling back to French.
 *
 * Takes the locale rather than reading the singleton so `scripts/verify-*.ts`
 * can call it, and so a caller that already knows the language does not pay for
 * a second lookup.
 */
export function localized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.fr;
}

/**
 * The render-time form.
 *
 * Use this in components rather than `localized(text, currentLocale())`: it
 * subscribes to the language store, so the label actually re-renders when
 * someone switches. The bare function reads a global React cannot observe.
 */
export function useLocalized(): (text: LocalizedText) => string {
  const locale = useLocale();
  return (text) => localized(text, locale);
}

/** For non-component code that runs during a render — same caveat as `t`. */
export function localizedNow(text: LocalizedText): string {
  return localized(text, currentLocale());
}
