/**
 * What Sougouba charges a merchant (CDC addendum v1.1, §05).
 *
 * Two components, cumulative rather than alternative: a percentage of each sale
 * and a flat monthly fee. Unlike Progix's "Programme Zéro Commission", both
 * apply at once.
 *
 * ⚠️ These are the **defaults**, not the truth. An administrator sets the live
 * pair in the back office (`platform_settings`), and the merchant screens read
 * it through `usePlatformPlan` (`GET /vendors/me/plan`). The constants below
 * only fill the gap while that request is in flight, or when it fails.
 */

export interface PlatformPlan {
  commissionRate: number;
  monthlySubscriptionCad: number;
}

export const COMMISSION_RATE = 0.12;
export const MONTHLY_SUBSCRIPTION_CAD = 70;

export const DEFAULT_PLAN: PlatformPlan = {
  commissionRate: COMMISSION_RATE,
  monthlySubscriptionCad: MONTHLY_SUBSCRIPTION_CAD,
};

/**
 * Charged on the goods sold, not on the order total.
 *
 * The CDC says "calculée sur le montant de la vente". Two lines on an order are
 * demonstrably not the merchant's sale: TPS and TVQ are collected on the
 * government's behalf, and the delivery fee pays for the delivery. Taking the
 * commission on either would be charging the merchant on money that was never
 * theirs. **Confirm with the client** — if they read "la vente" as the full
 * order total, this is the one line to change.
 */
export function commissionOn(salesCad: number, rate = COMMISSION_RATE): number {
  return round2(salesCad * rate);
}

/** What reaches the merchant from a given volume of sales, before the subscription. */
export function netOfCommission(salesCad: number, rate = COMMISSION_RATE): number {
  return round2(salesCad - commissionOn(salesCad, rate));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
