import { intlLocale, t } from './i18n';

/**
 * A formatter in the language in force, built on first use and kept — one per
 * language and kind. Read at call time, not when this file loads, so a switch
 * of language (`lib/i18n`) reformats everything on the next render.
 */
const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function formatter<T extends Intl.NumberFormat | Intl.DateTimeFormat>(kind: string, make: (language: string) => T): T {
  const key = `${intlLocale}:${kind}`;
  let found = formatters.get(key) as T | undefined;
  if (!found) {
    found = make(intlLocale);
    formatters.set(key, found);
  }
  return found;
}

export function formatCad(value: number): string {
  return formatter('cad', (l) => new Intl.NumberFormat(l, { style: 'currency', currency: 'CAD' })).format(value);
}

export function formatCompact(value: number): string {
  return formatter('compact', (l) => new Intl.NumberFormat(l, { notation: 'compact', maximumFractionDigits: 1 })).format(value);
}

/** A count with the language's own thousands separator: « 12 480 » / "12,480". */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return options ? new Intl.NumberFormat(intlLocale, options).format(value) : formatter('number', (l) => new Intl.NumberFormat(l)).format(value);
}

export function formatDate(iso: string): string {
  return formatter('date', (l) => new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', year: 'numeric' })).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return formatter(
    'dateTime',
    (l) => new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  ).format(new Date(iso));
}

/** `0.12` → « 12 % » / "12%": the space before the sign is French, and `Intl` knows it. */
export function formatPercent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return t('common.time.now');
  if (mins < 60) return t('common.time.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('common.time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('common.time.daysAgo', { count: days });
}
