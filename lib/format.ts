import { currentLocale, t } from '@/lib/i18n';
import { localeFormatter } from '@/lib/i18n/icu';

const PROBE_DATE = new Date(2026, 7, 8, 18, 30);

const currency = localeFormatter<number>(
  (tag) => new Intl.NumberFormat(tag, { style: 'currency', currency: 'CAD' }),
  1234.5
);

/**
 * Money, in the reader's convention.
 *
 * ⚠️ **The symbol moves.** fr-CA renders `1 234,50 $`; en-CA renders
 * `$1,234.50`. Anything that assumes a trailing `$` — a hand-built `` `${n} $`
 * ``, a width measured against the French form, a `split('$')` — is wrong in
 * English. No catalogue string carries a bare `$` for this reason; the price
 * band labels interpolate `formatCadCompact` instead of spelling the symbol.
 */
export function formatCad(amount: number): string {
  const formatter = currency();
  if (formatter) return formatter.format(amount);

  const fixed = Math.abs(amount).toFixed(2);
  const sign = amount < 0 ? '-' : '';
  return currentLocale() === 'en' ? `${sign}$${fixed}` : `${sign}${fixed.replace('.', ',')} $`;
}

const compactCurrency = localeFormatter<number>(
  (tag) => new Intl.NumberFormat(tag, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }),
  10
);

/**
 * Money with the cents dropped — `10 $` / `$10`.
 *
 * For copy that quotes a round threshold ("Moins de 10 $" / "Under $10"), where
 * `formatCad`'s `10,00 $` reads like a price rather than a bound.
 */
export function formatCadCompact(amount: number): string {
  const formatter = compactCurrency();
  if (formatter) return formatter.format(amount);

  const whole = Math.round(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  return currentLocale() === 'en' ? `${sign}$${whole}` : `${sign}${whole} $`;
}

const dateFormatter = localeFormatter<Date>(
  (tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long' }),
  PROBE_DATE
);

const timeFormatter = localeFormatter<Date>(
  (tag) =>
    new Intl.DateTimeFormat(tag, {
      // The hour width has to differ by locale. French is a 24-hour clock where
      // `'2-digit'` gives the padded "09 h 05" this app has always shown; English
      // is a 12-hour clock where the same option gives "06:30 p.m.", and nobody
      // writes a leading zero on a 12-hour time.
      hour: tag.startsWith('fr') ? '2-digit' : 'numeric',
      minute: '2-digit',
    }),
  PROBE_DATE
);

const monthYearFormatter = localeFormatter<Date>(
  (tag) => new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' }),
  PROBE_DATE
);

const dayLongFormatter = localeFormatter<Date>(
  (tag) => new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long' }),
  PROBE_DATE
);

const percentFormatter = localeFormatter<number>(
  (tag) => new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 2 }),
  0.125
);

/** `null` rather than an Invalid Date, so every caller below can return `''`. */
function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(iso: string): string {
  const date = parse(iso);
  if (!date) return '';
  return dateFormatter()?.format(date) ?? `${date.getDate()}/${date.getMonth() + 1}`;
}

/**
 * ⚠️ **en-CA is a twelve-hour locale.** "18 h 30" in French becomes "6:30 p.m."
 * in English — two characters wider, and Android's ICU may render "6:30 PM"
 * instead. The places that seat a time in a fixed-width column
 * (`components/customer/OrderStatusTimeline.tsx`, `components/courier/RunRow.tsx`)
 * want a look in English before release.
 *
 * The 24-hour form is deliberately *not* forced: an anglophone Canadian reading
 * `18:30` on a delivery ETA is the bug, not the fix.
 *
 * The fallback below is 24-hour in both languages. That is a deliberate
 * degradation — it only runs on an engine whose `Intl` failed the probe, where
 * an unambiguous time beats a correct one.
 */
export function formatTime(iso: string): string {
  const date = parse(iso);
  if (!date) return '';
  const formatter = timeFormatter();
  if (formatter) return formatter.format(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** "août 2026" / "August 2026" — for spans where the day would be noise, like a join date. */
export function formatMonthYear(iso: string): string {
  const date = parse(iso);
  if (!date) return '';
  return monthYearFormatter()?.format(date) ?? String(date.getFullYear());
}

/**
 * "vendredi 8 août" / "Friday, August 8".
 *
 * Was a private `dayFormatter` inside `app/(courier)/(tabs)/history.tsx`, which
 * is how it came to hold its own hardcoded `'fr-CA'`.
 */
export function formatDayLong(iso: string): string {
  const date = parse(iso);
  if (!date) return '';
  return dayLongFormatter()?.format(date) ?? formatDate(iso);
}

/**
 * "12 %" / "12%".
 *
 * Takes the rate (`0.12`), not the percentage: `style: 'percent'` multiplies,
 * and it also owns the space before the sign, which French has and English does
 * not. The previous inline version in `components/business/PayoutSummary.tsx`
 * hardcoded both.
 */
export function formatPercent(rate: number): string {
  const formatter = percentFormatter();
  if (formatter) return formatter.format(rate);
  const value = Math.round(rate * 10_000) / 100;
  return currentLocale() === 'en' ? `${value}%` : `${String(value).replace('.', ',')} %`;
}

/**
 * How long an order has been waiting, in the shop's terms.
 *
 * The merchant queue is read by age before anything else — a ticket sitting for
 * forty minutes is the one that matters, whatever its status.
 *
 * Still hand-written rather than `Intl.RelativeTimeFormat`, now for two reasons.
 * The original holds: the wording has to be the shop's ("il y a 12 min", not
 * "il y a 12 minutes") and short enough to sit on one line beside a badge. The
 * second is harder — `Intl.RelativeTimeFormat` does not exist in Hermes'
 * Android `Intl` at all, so reaching for it would throw at import time inside
 * `components/business/OrderQueueCard.tsx`, which is the exact shape of the
 * failure `data/utils/time.ts` documents.
 *
 * The two languages differ in more than vocabulary: French puts the marker in
 * front, English behind. Each rung is one whole catalogue string, so neither is
 * assembled from parts.
 */
export function formatElapsed(iso: string, now: number = Date.now()): string {
  const date = parse(iso);
  if (!date) return '';

  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return t('format.elapsed.justNow');
  if (minutes < 60) return t('format.elapsed.minutes', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('format.elapsed.hours', { count: hours });

  const days = Math.floor(hours / 24);
  return t('format.elapsed.days', { count: days });
}
