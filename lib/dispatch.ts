import { courierEarnings } from '@/data/courierPay';
import type { Courier, ID, LatLng, Order, Vendor } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';

/**
 * Who gets offered a run, and for how long.
 *
 * Pure functions only — the timers and the state live in
 * `store/useDispatchStore.ts` and `hooks/useDispatchEngine.ts`, so everything
 * here can be reasoned about (and asserted on) without mounting anything.
 */

/**
 * How long a courier has to accept.
 *
 * Thirty seconds is what the big platforms use, and the reason is not
 * arbitrary: it is long enough to read a shop name and a payout while holding a
 * phone at a red light, and short enough that a shopper waiting on a packed
 * order is not paying for someone's indecision.
 */
export const OFFER_TIMEOUT_MS = 30_000;

export interface DeliveryOffer {
  id: ID;
  orderId: ID;
  courierId: ID;
  vendorId: ID;
  offeredAt: string;
  expiresAt: string;
  /** Courier to shop. The unpaid leg — shown so nobody accepts a run blind. */
  distanceToPickupKm: number;
  /** Shop to shopper. What the fare is calculated on. */
  distanceToDropoffKm: number;
  estimatedEarningsCad: number;
}

/**
 * Couriers nearest the shop first.
 *
 * Distance from the *shop*, not from the shopper: the first thing that has to
 * happen is someone reaching the counter, and a courier who lives beside the
 * customer but forty minutes from the kitchen leaves the food under a heat lamp.
 */
export function rankCouriers(couriers: Courier[], pickup: LatLng): Courier[] {
  return [...couriers]
    .filter((c) => c.status === 'approved')
    .sort((a, b) => distanceKm(a.base, pickup) - distanceKm(b.base, pickup));
}

export function buildOffer(
  order: Order,
  vendor: Vendor,
  courier: Courier,
  from: LatLng,
  nowMs: number
): DeliveryOffer {
  const toPickup = distanceKm(from, vendor.address);
  const toDropoff = distanceKm(vendor.address, order.deliveryAddress);
  return {
    // Derived from the pair rather than generated: re-offering the same order to
    // the same courier must not look like a second, different offer.
    id: `off_${order.id}_${courier.id}`,
    orderId: order.id,
    courierId: courier.id,
    vendorId: vendor.id,
    offeredAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + OFFER_TIMEOUT_MS).toISOString(),
    distanceToPickupKm: toPickup,
    distanceToDropoffKm: toDropoff,
    // The tip is unknown at offer time and is not promised here. Quoting a
    // number that later shrinks is worse than quoting the floor.
    estimatedEarningsCad: courierEarnings(toDropoff),
  };
}

/** Milliseconds left on the countdown ring. Never negative. */
export function offerRemainingMs(offer: DeliveryOffer, nowMs: number): number {
  return Math.max(0, Date.parse(offer.expiresAt) - nowMs);
}

export function isOfferExpired(offer: DeliveryOffer, nowMs: number): boolean {
  return offerRemainingMs(offer, nowMs) === 0;
}
