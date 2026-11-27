import { montrealMidnight } from '../admin/stats-window.js';

/**
 * The day paying shops starts — `MERCHANT_PAYOUTS_FROM` — or null while it has
 * not been decided.
 *
 * A date, not a switch, because of what the database holds on the day real
 * payments begin: every order delivered while Stripe was in test mode. Those
 * were paid with test cards; a payout run that counted them would send real
 * money for them. Orders delivered before this date are not owed through the
 * platform — not by a payout, and not on a statement, which reads the same
 * account.
 *
 * Montréal midnight, like every other day boundary the shop is shown: a start
 * date of the 1st begins exactly where that month's statement does.
 */
export function payoutsStart(value: string | undefined): Date | null {
  if (!value) return null;
  const date = montrealMidnight(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
