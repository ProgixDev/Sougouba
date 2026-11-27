import { ApiError } from './api/client';
import { t } from './i18n';

/**
 * What the merchant portal's forms share: reading a number a person typed, and
 * turning a failed save into a sentence.
 */

/**
 * An amount in dollars, as typed. Accepts the French comma (« 12,50 ») as
 * readily as a point; null for anything that is not a plain amount with at most
 * two decimals — the API refuses a third, so the form says so first.
 */
export function parseMoney(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Number(text);
}

/** A whole number, zero or more; null otherwise. */
export function parseCount(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '');
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** An amount, the way the form shows it back: « 12,50 ». */
export const moneyText = (value: number | undefined | null) => (value == null ? '' : value.toFixed(2).replace('.', ','));

/**
 * Why a save failed, in the API's own words when it gave any: the first
 * field-level message of a validation failure, else its message.
 */
export function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return t('common.errors.network');
    return error.issues[0] ?? (error.message || fallback);
  }
  return fallback;
}
