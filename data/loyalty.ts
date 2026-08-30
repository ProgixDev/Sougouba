import type { LoyaltyTransaction, Order } from './types';
import { hashString } from './utils/random';

/**
 * Points Sougouba — the loyalty program (client brief, août 2026, "Portefeuille
 * Points Sougouba").
 *
 * Lives in `data/` rather than `lib/` for the same reason `data/taxes.ts` and
 * `data/courierPay.ts` do: the mock API needs it and `data/` must not import
 * from `lib/`.
 *
 * Every rate is a constant rather than a number scattered through checkout and
 * the points screen, because the brief itself puts them under an
 * administrator's control ("modifier les règles"). The back office that would
 * let someone actually change these waits on real admin authentication — a
 * backend concern — but the rules it will edit already have one home to edit.
 */

/** 1 $ of eligible spend = 1 point. */
export const POINTS_PER_CAD = 1;
/** 100 points = 1 $ of discount. */
export const POINTS_PER_CAD_REDEEMED = 100;
/** A points discount can cover at most 20 % of the order's subtotal. */
export const MAX_REDEMPTION_SHARE = 0.2;
/** Points earned on a given day expire 12 months later. */
export const POINTS_EXPIRY_MONTHS = 12;
/** What both sides of a qualifying referral earn. */
export const REFERRAL_REWARD_POINTS = 300;
/** The referred friend's first order has to clear this, before tax and delivery, to trigger the reward. */
export const REFERRAL_MIN_FIRST_ORDER_CAD = 60;

/**
 * The "journées points doublés" switch from the brief. Nothing in the app can
 * turn this on yet — that button belongs to the back office — so it sits here
 * as the one place `creditForDeliveredOrder` reads it, ready to become a
 * setting instead of a constant without the crediting logic itself changing.
 */
export const DOUBLE_POINTS_ACTIVE = false;

/**
 * What a delivered order is worth in points.
 *
 * Charged on `subtotalCad` alone — the brief is explicit that points are never
 * earned on tax, delivery, tips or service fees, and `subtotalCad` is already
 * the one figure on `Order` that excludes all four. Floored: a shopper does
 * not earn a fractional point on the cents.
 */
export function pointsEarnedFor(subtotalCad: number): number {
  const base = Math.floor(Math.max(0, subtotalCad) * POINTS_PER_CAD);
  return DOUBLE_POINTS_ACTIVE ? base * 2 : base;
}

/** What a stack of points is worth off a receipt. */
export function pointsToDiscountCad(points: number): number {
  return Math.round((Math.max(0, points) / POINTS_PER_CAD_REDEEMED) * 100) / 100;
}

/**
 * The most a shopper can redeem against this order: capped by the 20 % rule,
 * by what they actually have, and rounded down to a whole point — the same
 * "round once at the boundary" discipline `data/taxes.ts` follows for money.
 */
export function maxRedeemablePoints(subtotalCad: number, availablePoints: number): number {
  const capCad = Math.round(Math.max(0, subtotalCad) * MAX_REDEMPTION_SHARE * 100) / 100;
  const capPoints = Math.floor(capCad * POINTS_PER_CAD_REDEEMED);
  return Math.max(0, Math.min(capPoints, Math.max(0, availablePoints)));
}

/** A points-earning transaction expires this many months after it was posted. */
export function pointsExpiryFrom(iso: string): string {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + POINTS_EXPIRY_MONTHS);
  return date.toISOString();
}

/**
 * A shopper's own referral code, derived from their account id rather than
 * stored on it — one function every screen calls is a code that cannot drift
 * from what a second copy remembered writing down.
 *
 * Hashed rather than taken as a literal suffix of the id: the seed's ids are
 * `usr_<role>_<name>`, and two accounts sharing a first name — a customer and
 * a courier both called `youssef`, say — would otherwise end their id the
 * same way and be handed the same code. `hashString` (also used to seed the
 * mock delivery routes) spreads the whole id across the result instead.
 */
export function referralCodeFor(userId: string): string {
  const code = hashString(userId).toString(36).toUpperCase().padStart(6, '0').slice(-6);
  return `SGB-${code}`;
}

/** Whether a transaction still counts toward the balance — unexpired, or not the kind that expires. */
export function isTransactionLive(tx: Pick<LoyaltyTransaction, 'expiresAt'>, now = Date.now()): boolean {
  return !tx.expiresAt || new Date(tx.expiresAt).getTime() > now;
}

/** Whether an order clears the referral program's minimum, before tax and delivery. */
export function qualifiesForReferralReward(order: Pick<Order, 'subtotalCad'>): boolean {
  return order.subtotalCad >= REFERRAL_MIN_FIRST_ORDER_CAD;
}
