import { hashString } from './utils/random';
import type { ID, VehicleType } from './types';

/**
 * Delivery primitives shared by the seed builder, the mock API and the
 * dispatcher in `lib/`.
 *
 * Here rather than in `lib/` for the reason `data/taxes.ts` states: the seed
 * needs them at module load, and `data/` must not import from `lib/`.
 */

/**
 * Average door-to-door speed in city traffic, not top speed.
 *
 * A car is barely faster than a scooter across Montréal once parking and lights
 * are counted, and on a short run it is often slower — which is why the numbers
 * sit closer together than a spec sheet would suggest.
 */
export const VEHICLE_SPEED_KMH: Record<VehicleType, number> = {
  bike: 15,
  scooter: 25,
  car: 22,
};

/** How long a leg takes, in whole minutes. Never zero — arriving instantly reads as broken. */
export function legDurationMin(distanceKm: number, vehicle: VehicleType): number {
  const hours = Math.max(0, distanceKm) / VEHICLE_SPEED_KMH[vehicle];
  return Math.max(1, Math.round(hours * 60));
}

/**
 * The four digits the shopper reads out at the door.
 *
 * Derived from the order id rather than generated, so it survives a restart and
 * is the same number on the courier's screen and the shopper's. It is a
 * hand-off token, not a secret — anyone holding the order can compute it, which
 * is precisely what both ends need to do.
 */
export function deliveryPin(orderId: ID): string {
  return String(hashString(`pin:${orderId}`) % 10000).padStart(4, '0');
}
