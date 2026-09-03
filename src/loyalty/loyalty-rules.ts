/**
 * Points Sougouba's rules — the client brief (août 2026, "Portefeuille Points
 * Sougouba"), ported from the mobile app's `data/loyalty.ts`.
 *
 * The one structural change from that file: every rate is a **parameter** here
 * rather than a module constant. The brief puts these under an administrator's
 * control ("modifier les règles"), and `platform_settings` is where they now
 * live, so the rules have to be able to read a rate that changed this morning.
 * The mobile app's constants stay as the defaults an offline preview uses.
 *
 * Pure and dependency-free, like `orders/pricing.ts` and for the same reason:
 * these are the figures a shopper sees on their points screen, and they need to
 * be testable against the exact numbers the app renders.
 */

/** The subset of `platform_settings` these rules read. */
export interface LoyaltyRates {
  /** 1 $ of eligible spend = this many points. */
  pointsPerCad: number;
  /** This many points = 1 $ of discount. */
  pointsPerCadRedeemed: number;
  /** A points discount can cover at most this share of the order's subtotal. */
  maxRedemptionShare: number;
  /** Points earned on a given day expire this many months later. */
  pointsExpiryMonths: number;
  /** What both sides of a qualifying referral earn. */
  referralRewardPoints: number;
  /** The referred friend's first order must clear this, before tax and delivery. */
  referralMinFirstOrderCad: number;
  doublePointsActive: boolean;
  doublePointsStartsAt: Date | null;
  doublePointsEndsAt: Date | null;
}

/** The mobile app's own constants, used when no settings row has been read yet. */
export const DEFAULT_LOYALTY_RATES: LoyaltyRates = {
  pointsPerCad: 1,
  pointsPerCadRedeemed: 100,
  maxRedemptionShare: 0.2,
  pointsExpiryMonths: 12,
  referralRewardPoints: 300,
  referralMinFirstOrderCad: 60,
  doublePointsActive: false,
  doublePointsStartsAt: null,
  doublePointsEndsAt: null,
};

/**
 * Whether a "journée points doublés" is running right now.
 *
 * The mock had this as a hardcoded `false` with a comment saying the button
 * belonged to a back office. It is now a real toggle *plus a window*, and the
 * window is the point: an admin who flips the switch for a Saturday promotion
 * should not have to remember to flip it back on Sunday. A switch left on by
 * accident doubles every point the platform issues, indefinitely.
 *
 * Both bounds are optional. Set with no window, the toggle behaves exactly like
 * the old boolean.
 */
export function isDoublePointsActive(rates: LoyaltyRates, now: Date = new Date()): boolean {
  if (!rates.doublePointsActive) return false;
  if (rates.doublePointsStartsAt && now < rates.doublePointsStartsAt) return false;
  if (rates.doublePointsEndsAt && now >= rates.doublePointsEndsAt) return false;
  return true;
}

/**
 * What a delivered order is worth in points.
 *
 * Charged on `subtotalCad` alone — the brief is explicit that points are never
 * earned on tax, delivery, tips or service fees, and the subtotal is the one
 * figure on an order that excludes all four. Floored: a shopper does not earn a
 * fractional point on the cents.
 */
export function pointsEarnedFor(subtotalCad: number, rates: LoyaltyRates, now: Date = new Date()): number {
  const base = Math.floor(Math.max(0, subtotalCad) * rates.pointsPerCad);
  return isDoublePointsActive(rates, now) ? base * 2 : base;
}

/** When points earned now stop counting. */
export function pointsExpiryFrom(at: Date, rates: LoyaltyRates): Date {
  const expiry = new Date(at);
  expiry.setMonth(expiry.getMonth() + rates.pointsExpiryMonths);
  return expiry;
}

/** Whether an order clears the referral programme's minimum, before tax and delivery. */
export function qualifiesForReferralReward(subtotalCad: number, rates: LoyaltyRates): boolean {
  return subtotalCad >= rates.referralMinFirstOrderCad;
}
