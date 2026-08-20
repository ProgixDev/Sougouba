/**
 * What Sougouba charges a merchant (CDC addendum v1.1, §05).
 *
 * Two components, cumulative rather than alternative: a percentage of each sale
 * and a flat monthly fee. Unlike Progix's "Programme Zéro Commission", both
 * apply at once.
 */

export const COMMISSION_RATE = 0.12;
export const MONTHLY_SUBSCRIPTION_CAD = 70;

/**
 * Charged on the goods sold, not on the order total.
 *
 * The CDC says "calculée sur le montant de la vente". Two lines on an order are
 * demonstrably not the merchant's sale: TPS and TVQ are collected on the
 * government's behalf, and the delivery fee pays for the delivery. Taking 12 %
 * of either would be charging the merchant commission on money that was never
 * theirs. **Confirm with the client** — if they read "la vente" as the full
 * order total, this is the one line to change.
 */
export function commissionOn(salesCad: number): number {
  return round2(salesCad * COMMISSION_RATE);
}

/** What reaches the merchant from a given volume of sales, before the subscription. */
export function netOfCommission(salesCad: number): number {
  return round2(salesCad - commissionOn(salesCad));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
