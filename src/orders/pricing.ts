/**
 * What an order is worth — the server's answer, not the checkout screen's.
 *
 * Every function here is a port of a file the mobile app already ships and the
 * seed builder already agrees with: `data/taxes.ts`, `data/deliveryPricing.ts`,
 * `data/utils/geo.ts` and the redemption half of `data/loyalty.ts`. They are
 * copied rather than reinvented because the app still computes an optimistic
 * preview at checkout, and a receipt that disagrees with what was charged is
 * the one bug a marketplace cannot explain away.
 *
 * Pure and dependency-free on purpose: no database, no Stripe, no Nest. That is
 * what lets the rules be tested against the exact figures the app renders.
 */

// ── money ───────────────────────────────────────────────────────────────────

/** Money is summed from floats, so round once at each boundary. */
export function roundCad(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Québec sales tax (`data/taxes.ts`) ──────────────────────────────────────

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export interface OrderTaxes {
  gstCad: number;
  qstCad: number;
}

/**
 * TPS (federal) and TVQ (provincial) on the products only — the delivery fee is
 * added afterwards, untaxed. Both come off the same base rather than
 * compounding: Québec de-harmonised TVQ in 2013, so it is no longer levied on
 * top of the TPS. Confirmed against the CDC addendum, which states both rates.
 */
export function taxesOn(subtotalCad: number): OrderTaxes {
  return {
    gstCad: roundCad(subtotalCad * GST_RATE),
    qstCad: roundCad(subtotalCad * QST_RATE),
  };
}

/** The one place the bottom line is computed, before any points discount. */
export function orderTotal(subtotalCad: number, taxes: OrderTaxes, deliveryFeeCad: number): number {
  return roundCad(subtotalCad + taxes.gstCad + taxes.qstCad + deliveryFeeCad);
}

// ── distance (`data/utils/geo.ts`) ──────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in kilometres — as the crow flies, not as the courier
 * drives; on the island of Montréal the two differ by roughly a third.
 *
 * Still the crow's distance here, deliberately: it is what the *fee bands* were
 * drawn against, and swapping in a road distance would silently reprice every
 * delivery. Phase 5's Mapbox Directions call answers the different question of
 * how long the courier will actually take.
 */
export function distanceKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// ── delivery fee (`data/deliveryPricing.ts`) ────────────────────────────────

export interface DeliveryTier {
  /** Upper bound of the band, in kilometres, inclusive. */
  maxKm: number;
  feeCad: number;
}

/**
 * What the shopper pays for delivery, decided by Sougouba rather than by the
 * shop — every courier is Sougouba's, so the shop was never the one to price
 * the run.
 *
 * Bands rather than a per-kilometre rate, the way Uber Eats and DoorDash quote
 * it: a shopper comparing two shops can hold five numbers in their head.
 *
 * ⚠️ **These rates are still the mock's starting point and remain unconfirmed
 * with the client** — "Confirm before Phase 0" #3 in the plan doc. They are
 * ported as-is so nothing silently changes price during the cutover; when the
 * real rates arrive this table is the only edit, and Phase 8's
 * `platform_settings` is where they should ultimately live so a rate change
 * does not need a deploy.
 */
export const DELIVERY_TIERS: DeliveryTier[] = [
  { maxKm: 2, feeCad: 2.99 },
  { maxKm: 5, feeCad: 3.99 },
  { maxKm: 8, feeCad: 5.49 },
  { maxKm: 12, feeCad: 6.99 },
  { maxKm: Infinity, feeCad: 8.99 },
];

/**
 * A negative or NaN distance is a bug upstream, not a free delivery — it falls
 * into the first band rather than pricing at zero.
 */
export function deliveryFeeFor(km: number): number {
  const safe = Number.isFinite(km) ? Math.max(0, km) : 0;
  return (DELIVERY_TIERS.find((tier) => safe <= tier.maxKm) ?? DELIVERY_TIERS[DELIVERY_TIERS.length - 1]).feeCad;
}

export function deliveryFeeBetween(from: LatLng, to: LatLng): number {
  return deliveryFeeFor(distanceKm(from, to));
}

// ── points redemption (`data/loyalty.ts`) ───────────────────────────────────

/**
 * Defaults only. Both rates are admin-editable from Phase 4 on
 * (`platform_settings`), so every function below takes them as arguments and
 * these are what an offline preview falls back to — they match the mobile
 * app's own `data/loyalty.ts` constants.
 */
export const POINTS_PER_CAD_REDEEMED = 100;
/** A points discount can cover at most 20 % of the order's subtotal (client brief, août 2026). */
export const MAX_REDEMPTION_SHARE = 0.2;

/** What a stack of points is worth off a receipt. */
export function pointsToDiscountCad(points: number, pointsPerCadRedeemed = POINTS_PER_CAD_REDEEMED): number {
  return roundCad(Math.max(0, points) / pointsPerCadRedeemed);
}

/**
 * The most a shopper can redeem against this order: capped by the share rule,
 * by what they actually have, and rounded down to a whole point.
 *
 * The cap is taken against the **subtotal alone** — never the tax or delivery
 * lines the order also carries. The checkout screen shows a preview of what a
 * shopper *could* spend; this is what actually clears.
 */
export function maxRedeemablePoints(
  subtotalCad: number,
  availablePoints: number,
  rates: { pointsPerCadRedeemed: number; maxRedemptionShare: number } = {
    pointsPerCadRedeemed: POINTS_PER_CAD_REDEEMED,
    maxRedemptionShare: MAX_REDEMPTION_SHARE,
  }
): number {
  const capCad = roundCad(Math.max(0, subtotalCad) * rates.maxRedemptionShare);
  const capPoints = Math.floor(capCad * rates.pointsPerCadRedeemed);
  return Math.max(0, Math.min(capPoints, Math.max(0, availablePoints)));
}

// ── the whole receipt ───────────────────────────────────────────────────────

export interface PricedLine {
  productId: string;
  name: string;
  qty: number;
  unitPriceCad: number;
}

export interface PricedOrder {
  items: PricedLine[];
  subtotalCad: number;
  gstCad: number;
  qstCad: number;
  deliveryFeeCad: number;
  distanceKm: number;
  pointsRedeemed: number;
  pointsDiscountCad: number;
  /** Null when no coupon was applied. The code is echoed back so the receipt can name it. */
  couponCode: string | null;
  couponDiscountCad: number;
  totalCad: number;
}

/** A coupon already looked up and found valid for this order — see `CouponsService`. */
export interface ApplicableCoupon {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
}

/**
 * What a coupon takes off, against the subtotal.
 *
 * Off the **subtotal only**, like points and for the same reason: discounting
 * the tax lines would mean remitting to Revenu Québec money that was never
 * collected, and discounting delivery would mean the platform paying a courier
 * out of a promotion.
 *
 * ⚠️ `percentage` reads `discountValue` as a **percent** (15 → 15 %), not a
 * rate. This is one of several coupon semantics that are assumed rather than
 * specified — see the warning on `CouponsService`.
 */
export function couponDiscountFor(coupon: ApplicableCoupon | null, subtotalCad: number): number {
  if (!coupon) return 0;
  const base = Math.max(0, subtotalCad);
  const raw =
    coupon.discountType === 'percentage'
      ? base * (Math.min(100, Math.max(0, coupon.discountValue)) / 100)
      : Math.max(0, coupon.discountValue);
  // Never more than the goods are worth: a 20 $ coupon on a 12 $ basket takes
  // 12 $, not 20 $, and certainly does not start eating the delivery fee.
  return roundCad(Math.min(raw, base));
}

/**
 * One order, priced end to end.
 *
 * Every input is something the server looked up for itself — line prices from
 * the catalogue, both coordinates from stored addresses, the points balance
 * from the ledger. Nothing a client sent is trusted as a price, which is the
 * rule the mock's own `createOrder` already followed and the plan restates as
 * "money, identity and delivery proof are never trusted from the client".
 *
 * The total can reach zero (a small order fully covered by points is
 * arithmetically possible only if the 20 % cap were removed, so in practice it
 * cannot) but never goes negative: the discount is bounded by a share of the
 * subtotal, which is itself one of the terms being added.
 */
export function priceOrder(input: {
  items: PricedLine[];
  vendorLocation: LatLng;
  deliveryLocation: LatLng;
  requestedPoints: number;
  availablePoints: number;
  coupon?: ApplicableCoupon | null;
  rates?: { pointsPerCadRedeemed: number; maxRedemptionShare: number };
}): PricedOrder {
  const subtotalCad = roundCad(input.items.reduce((sum, item) => sum + item.unitPriceCad * item.qty, 0));
  const taxes = taxesOn(subtotalCad);

  const km = distanceKm(input.vendorLocation, input.deliveryLocation);
  const deliveryFeeCad = deliveryFeeFor(km);

  const rates = input.rates ?? { pointsPerCadRedeemed: POINTS_PER_CAD_REDEEMED, maxRedemptionShare: MAX_REDEMPTION_SHARE };

  const pointsRedeemed =
    input.requestedPoints > 0
      ? maxRedeemablePoints(subtotalCad, Math.min(input.requestedPoints, input.availablePoints), rates)
      : 0;
  const pointsDiscountCad = pointsRedeemed > 0 ? pointsToDiscountCad(pointsRedeemed, rates.pointsPerCadRedeemed) : 0;

  const coupon = input.coupon ?? null;
  const couponDiscountCad = couponDiscountFor(coupon, subtotalCad);

  // Both discounts are computed against the **original** subtotal, and their
  // sum is then capped at it. Two rules that need stating because neither is
  // forced by the arithmetic:
  //
  // - Computing the points cap against a coupon-reduced subtotal would mean a
  //   coupon silently shrinking what a shopper's own points are worth, which is
  //   a surprising way to punish using both.
  // - Capping the *sum* is what keeps taxes and delivery payable: without it, a
  //   large coupon plus points could exceed the goods' value and start eating
  //   the tax the platform still has to remit.
  //
  // ⚠️ Whether coupons and points may be combined at all is unspecified (see
  // "Confirm before Phase 0" #6). This allows it; forbidding it later is a
  // one-line change in `CouponsService`, not a repricing.
  const totalDiscountCad = roundCad(Math.min(pointsDiscountCad + couponDiscountCad, subtotalCad));

  return {
    items: input.items,
    subtotalCad,
    gstCad: taxes.gstCad,
    qstCad: taxes.qstCad,
    deliveryFeeCad,
    distanceKm: roundCad(km),
    pointsRedeemed,
    pointsDiscountCad,
    couponCode: coupon?.code ?? null,
    couponDiscountCad,
    totalCad: roundCad(orderTotal(subtotalCad, taxes, deliveryFeeCad) - totalDiscountCad),
  };
}

/**
 * The total in cents, which is the only unit Stripe accepts.
 *
 * `Math.round` rather than a truncation: `19.99 * 100` is `1998.9999999999998`
 * in IEEE 754, and `Math.trunc` would charge 19,98 $ for a 19,99 $ order — a
 * one-cent shortfall on roughly half of all totals, and a receipt that does not
 * match the charge.
 */
export function toStripeAmount(totalCad: number): number {
  return Math.round(totalCad * 100);
}
