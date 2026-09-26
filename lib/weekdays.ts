import type { MessageKey } from '@/lib/i18n';

/**
 * Weekday names, from the catalogue rather than from `Intl`.
 *
 * Two files used to hold their own arrays in two different registers —
 * `lib/courierAnalytics.ts` had lowercase three-letter abbreviations for a chart
 * axis, `app/(business)/(tabs)/profile.tsx` full capitalised names for an
 * opening-hours table. Both now read from here.
 *
 * **Not `Intl.DateTimeFormat(locale, { weekday })`**, for four reasons:
 *
 *  1. It would change the existing French. CLDR `fr-CA` renders the short form
 *     as `"dim."` — with a trailing period this app deliberately omits. That is
 *     an unrequested visual regression on the French side to gain nothing on the
 *     English side.
 *  2. `'auj.'` has no `Intl` equivalent, so a catalogue entry is needed anyway.
 *     One mechanism for a row of labels beats two.
 *  3. `Intl` formats a `Date`, but `VendorHours.day` is an index. Going through
 *     `Intl` means manufacturing seven throwaway dates and an off-by-one waiting
 *     to happen across a DST boundary.
 *  4. `EarningsChart` formats up to thirty buckets per render. That is not where
 *     to spend a Hermes `Intl` risk for seven strings.
 *
 * Index matches `Date.getDay()` and `VendorHours.day`: 0 is Sunday.
 */
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export function weekdayKeyFor(day: number): WeekdayKey {
  return WEEKDAY_KEYS[((day % 7) + 7) % 7];
}

/** Three letters, for a chart axis. Both languages are three characters wide. */
export function weekdayShortKey(day: number): MessageKey {
  return `format.weekday.short.${weekdayKeyFor(day)}` as MessageKey;
}

/** The full name, for an opening-hours table. */
export function weekdayLongKey(day: number): MessageKey {
  return `format.weekday.long.${weekdayKeyFor(day)}` as MessageKey;
}
