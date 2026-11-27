import { intlLocale, t } from './i18n';

// Built once, in the language of this page load (`lib/i18n`): a switch reloads.
const currency = new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'CAD' });
const compactNumber = new Intl.NumberFormat(intlLocale, { notation: 'compact', maximumFractionDigits: 1 });
const plainNumber = new Intl.NumberFormat(intlLocale);
const dateFmt = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatCad(value: number): string {
  return currency.format(value);
}

export function formatCompact(value: number): string {
  return compactNumber.format(value);
}

/** A count with the language's own thousands separator: « 12 480 » / "12,480". */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return options ? new Intl.NumberFormat(intlLocale, options).format(value) : plainNumber.format(value);
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
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
