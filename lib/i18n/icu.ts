import { IS_DEV, type AppLocale, currentLocale } from './index';

/** BCP-47 tags. Canada both ways: the currency is CAD and the dates are Québécois. */
const TAG: Record<AppLocale, string> = { fr: 'fr-CA', en: 'en-CA' };

interface Formatter<In> {
  format(value: In): string;
}

/**
 * A lazily built, per-locale-cached `Intl` formatter with a mandatory fallback.
 *
 * Three deliberate properties, all of them scar tissue from the incident
 * documented atop `data/utils/time.ts`:
 *
 *  1. **Nothing is constructed at module scope.** An engine that cannot build a
 *     formatter yields a wrong-looking string here, not an app that dies during
 *     import with no error boundary mounted.
 *  2. **Every formatter is probed once** against a known input before it is
 *     cached. Hermes silently ignores `Intl` options it does not implement, so
 *     a formatter that constructs successfully can still return `"NaN"` or an
 *     empty string. Constructing is not evidence; output is.
 *  3. **Every caller supplies a hand-written fallback.** `null` comes back when
 *     the probe fails, and that is not optional to handle.
 *
 * What is safe to build through this: `NumberFormat` (currency, percent,
 * decimal) and `DateTimeFormat` restricted to day/month/year/weekday/hour/
 * minute. What must never be: `timeZone`, `timeZoneName`,
 * `Intl.RelativeTimeFormat`, `Intl.PluralRules`, `Intl.ListFormat`,
 * `Intl.Segmenter` — all absent or incomplete in Hermes' Android `Intl`.
 *
 * Two locales times five formatters means at most ten `Intl` objects are ever
 * constructed, each exactly once. Nothing is built per render.
 */
export function localeFormatter<In>(
  build: (tag: string) => Formatter<In>,
  probe: In
): (locale?: AppLocale) => Formatter<In> | null {
  const cache = new Map<AppLocale, Formatter<In> | null>();

  return (locale = currentLocale()) => {
    const cached = cache.get(locale);
    if (cached !== undefined) return cached;

    let usable: Formatter<In> | null = null;
    try {
      const candidate = build(TAG[locale]);
      const sample = candidate.format(probe);
      if (typeof sample === 'string' && sample.length > 0 && !sample.includes('NaN')) {
        usable = candidate;
      } else if (IS_DEV) {
        console.warn(`[i18n] Intl produced "${sample}" for ${TAG[locale]} — using the fallback.`);
      }
    } catch (error) {
      if (IS_DEV) console.warn(`[i18n] Intl unavailable for ${TAG[locale]}:`, error);
    }

    cache.set(locale, usable);
    return usable;
  };
}

const PROBE_DATE = new Date(2026, 7, 8, 18, 30);

/**
 * What this device's `Intl` actually supports, for the styleguide screen.
 *
 * `npm run verify` runs in Node, which has full ICU and therefore cannot speak
 * for Hermes — least of all for Android, whose `Intl` is the trimmed one. This
 * is the check that has to happen on a physical device before the formatter
 * work is trusted.
 *
 * `relativeTime` and `pluralRules` are expected to read `undefined` on Android.
 * They are listed so their absence is a recorded observation rather than a
 * discovery made in production.
 */
export function intlSupportReport(): Record<string, string>[] {
  const safe = (run: () => string): string => {
    try {
      return run();
    } catch (error) {
      return `THREW: ${String(error)}`;
    }
  };

  return (['fr', 'en'] as const).map((locale) => ({
    locale: TAG[locale],
    currency: safe(() =>
      new Intl.NumberFormat(TAG[locale], { style: 'currency', currency: 'CAD' }).format(1234.5)
    ),
    date: safe(() =>
      new Intl.DateTimeFormat(TAG[locale], { day: 'numeric', month: 'long' }).format(PROBE_DATE)
    ),
    time: safe(() =>
      new Intl.DateTimeFormat(TAG[locale], { hour: '2-digit', minute: '2-digit' }).format(PROBE_DATE)
    ),
    percent: safe(() => new Intl.NumberFormat(TAG[locale], { style: 'percent' }).format(0.125)),
    relativeTime: safe(() => String(typeof (Intl as Record<string, unknown>).RelativeTimeFormat)),
    pluralRules: safe(() => String(typeof (Intl as Record<string, unknown>).PluralRules)),
  }));
}
