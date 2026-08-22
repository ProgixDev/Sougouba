import { distanceKm } from './utils/geo';
import type { LatLng } from './types';

/**
 * What the shopper pays for delivery, decided by Sougouba rather than by the
 * shop.
 *
 * Shops used to set their own `deliveryFeeCad`, which made the same three
 * kilometres cost 2,99 $ from one grocery and 4,99 $ from its neighbour — and
 * it was never the shop's cost to price anyway: every courier is Sougouba's.
 * The fee is now a function of one thing, the distance the platform has to
 * cover.
 *
 * Lives in `data/` rather than `lib/` for the reason `data/taxes.ts` states: the
 * seed builder and the mock API both price orders, and `data/` must not import
 * from `lib/`.
 *
 * Bands rather than a per-kilometre rate, the way Uber Eats and DoorDash quote
 * it: a shopper comparing two shops can hold five numbers in their head, and a
 * band absorbs the error in an FSA-centroid distance (see `lib/postalGeo.ts`)
 * where a continuous rate would turn that error straight into cents.
 *
 * **Rates are a starting point — confirm with the client.** Changing them is an
 * edit to this table; changing the shape is not, which is why the rest of the
 * app only ever calls `deliveryFeeFor`.
 */
export interface DeliveryTier {
  /** Upper bound of the band, in kilometres, inclusive. */
  maxKm: number;
  feeCad: number;
}

export const DELIVERY_TIERS: DeliveryTier[] = [
  { maxKm: 2, feeCad: 2.99 },
  { maxKm: 5, feeCad: 3.99 },
  { maxKm: 8, feeCad: 5.49 },
  { maxKm: 12, feeCad: 6.99 },
  { maxKm: Infinity, feeCad: 8.99 },
];

/** What a shop's card advertises before the app knows where the shopper is. */
export const MIN_DELIVERY_FEE_CAD = DELIVERY_TIERS[0].feeCad;

/**
 * A negative or NaN distance is a bug upstream, not a free delivery — it falls
 * into the first band rather than pricing at zero.
 */
export function deliveryFeeFor(km: number): number {
  const safe = Number.isFinite(km) ? Math.max(0, km) : 0;
  return (DELIVERY_TIERS.find((tier) => safe <= tier.maxKm) ?? DELIVERY_TIERS.at(-1)!).feeCad;
}

/** The one call sites make: two points in, a fee out. */
export function deliveryFeeBetween(from: LatLng, to: LatLng): number {
  return deliveryFeeFor(distanceKm(from, to));
}
