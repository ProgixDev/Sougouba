import { useEffect, useState } from 'react';

import type { Courier, LatLng, Order, Vendor } from '@/data/types';
import { buildLeg, etaMinutes, positionAlong, progressAt, type RouteLeg } from '@/lib/courierRoute';

/** Which half of the run is happening, or neither. */
export type DeliveryPhase = 'awaiting_pickup' | 'to_pickup' | 'to_dropoff' | 'delivered';

export interface DeliveryProgress {
  phase: DeliveryPhase;
  /** Null before a courier has accepted — there is nothing on the map yet. */
  position: LatLng | null;
  bearing: number;
  /** The leg currently being driven, for the route line. */
  leg: RouteLeg | null;
  progress: number;
  /** Minutes to the end of the *current* leg. */
  etaMin: number;
  pickup: LatLng;
  dropoff: LatLng;
}

/**
 * Fast enough that the marker glides rather than steps.
 *
 * One second was enough while the simulation ran at 1x — a courier covered a few
 * metres per tick, well under a pixel, so the interval was really only feeding
 * the ETA. Under `DEMO_TIME_SCALE` the same tick moves the marker tens of metres
 * at once and the run reads as a series of jumps. 250 ms puts it back under the
 * threshold where the eye reads motion as continuous, and the work per tick is a
 * walk along at most fourteen waypoints.
 */
const TICK_MS = 250;

/**
 * Where the courier is, right now.
 *
 * **The same hook serves the courier and the shopper**, which is not a
 * convenience — it is the guarantee. Two implementations would eventually
 * disagree, and the bug would be a shopper watching a driver who is not where
 * the driver's own screen says they are.
 *
 * Nothing is stored. Every tick recomputes from `delivery.acceptedAt` /
 * `pickedUpAt` against a route regenerated from the order id, so the position is
 * a pure function of the wall clock. Kill the app mid-run and reopen it and the
 * courier is exactly where they should be, which a stored-and-nudged coordinate
 * cannot promise.
 *
 * Returns null when the order is not on the road, so callers can render the map
 * conditionally without threading a second flag.
 */
export function useDeliveryProgress(
  order: Order | null | undefined,
  vendor: Vendor | null | undefined,
  courier: Courier | null | undefined
): DeliveryProgress | null {
  const [now, setNow] = useState(() => Date.now());

  const delivery = order?.delivery;
  const settled = order?.status === 'delivered' || order?.status === 'cancelled';

  useEffect(() => {
    // No timer once the run is over or before it starts — a finished delivery
    // that keeps a 1 Hz interval alive is a battery leak on the orders list.
    if (!delivery || settled) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [delivery, settled]);

  if (!order || !vendor || !delivery) return null;

  const pickup = vendor.address;
  const dropoff = order.deliveryAddress;
  const vehicle = courier?.vehicle ?? 'car';

  if (order.status === 'delivered') {
    return {
      phase: 'delivered',
      position: dropoff,
      bearing: 0,
      leg: null,
      progress: 1,
      etaMin: 0,
      pickup,
      dropoff,
    };
  }

  // Two distinct legs, seeded differently, so the approach to the shop is not a
  // mirror of the run to the door.
  if (!delivery.pickedUpAt) {
    const from = courier?.base ?? pickup;
    const leg = buildLeg(from, pickup, `${order.id}:pickup`, vehicle);
    const progress = progressAt(delivery.acceptedAt, leg.durationMin, now);
    const { at, bearing } = positionAlong(leg, progress);
    return {
      // At the shop but not yet holding the bag: the courier has arrived and is
      // waiting on the counter, which is a different sentence from "en route".
      phase: progress >= 1 ? 'awaiting_pickup' : 'to_pickup',
      position: at,
      bearing,
      leg,
      progress,
      etaMin: etaMinutes(leg, progress),
      pickup,
      dropoff,
    };
  }

  const leg = buildLeg(pickup, dropoff, `${order.id}:dropoff`, vehicle);
  const progress = progressAt(delivery.pickedUpAt, leg.durationMin, now);
  const { at, bearing } = positionAlong(leg, progress);
  return {
    phase: 'to_dropoff',
    position: at,
    bearing,
    leg,
    progress,
    etaMin: etaMinutes(leg, progress),
    pickup,
    dropoff,
  };
}
