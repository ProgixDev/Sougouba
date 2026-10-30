import { useEffect, useRef, useState } from 'react';

import type { Courier, LatLng, Order, Vendor } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';
import { locateOnRoute, type RouteLeg } from '@/lib/courierRoute';
import { routeBetween } from '@/lib/directions';
import type { LivePosition } from './useOwnPosition';

/** Which half of the run is happening, or neither. */
export type DeliveryPhase = 'awaiting_pickup' | 'to_pickup' | 'to_dropoff' | 'delivered';

export interface DeliveryProgress {
  phase: DeliveryPhase;
  /** The courier's real position, or null when there is no fresh GPS fix. */
  position: LatLng | null;
  bearing: number;
  /** The road route being driven, for the line on the map. Null while it loads. */
  leg: RouteLeg | null;
  /** Share of `leg` already behind the courier. */
  progress: number;
  /** Minutes to the end of the *current* leg, or null when the courier's position is unknown. */
  etaMin: number | null;
  pickup: LatLng;
  dropoff: LatLng;
}

/** Further than this from the line and the courier has taken another road: ask for a new route. */
const OFF_ROUTE_KM = 0.075;
/** At the shop, near enough to be waiting at the counter. */
const AT_SHOP_KM = 0.08;
/** At most one re-route per this long, however much GPS jitter there is. */
const REROUTE_MS = 15_000;

/**
 * Where the courier is, from GPS, on the road route they are driving.
 *
 * **The same hook serves the courier and the shopper**, so the two screens
 * cannot disagree. Only the source of `live` differs: the courier's own phone
 * (`useOwnPosition`) on their screens, and the pings it sends
 * (`/orders/:id/courier-location`) on the shopper's.
 *
 * The line is a Mapbox Directions route from the courier's position to where
 * they are going, fetched again when they leave it. Without a position the map
 * still shows the run — shop to door, or base to shop — but no marker and no
 * ETA, rather than a courier placed somewhere invented.
 *
 * Returns null when the order is not on the road.
 */
export function useDeliveryProgress(
  order: Order | null | undefined,
  vendor: Vendor | null | undefined,
  courier: Courier | null | undefined,
  live: LivePosition | null
): DeliveryProgress | null {
  const delivery = order?.delivery;
  const pickup = vendor?.address;
  const dropoff = order?.deliveryAddress;
  const vehicle = courier?.vehicle ?? 'car';
  const delivered = order?.status === 'delivered';
  const pickedUp = Boolean(delivery?.pickedUpAt);

  // Where the line runs from and to. With a fix: from the courier to the stop
  // they are heading for. Without one: the trip itself, so the map still says
  // where the bag is going.
  const base = courier?.base;
  const target = !pickup || !dropoff ? null : pickedUp ? dropoff : pickup;
  const origin: LatLng | null = live ?? (!pickup ? null : pickedUp ? pickup : (base ?? pickup));
  const routeTo = live || pickedUp || base ? target : dropoff;
  const mode = live ? 'live' : pickedUp ? 'shop' : base ? 'base' : 'trip';
  const wantKey = target && routeTo ? `${mode}>${routeTo.lat},${routeTo.lng}:${vehicle}` : null;

  const [route, setRoute] = useState<{ key: string; leg: RouteLeg } | null>(null);
  const requested = useRef<{ key: string; at: number } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!delivery || delivered || !wantKey || !origin || !routeTo) return;
    const current = route?.key === wantKey ? route.leg : null;
    const sinceLast = requested.current ? Date.now() - requested.current.at : Infinity;

    const stale =
      !current ||
      (live !== null && sinceLast > REROUTE_MS && locateOnRoute(current.points, live).offRouteKm > OFF_ROUTE_KM);
    // Asked already and still waiting: one request per route key at a time.
    const inFlight = requested.current?.key === wantKey && !current && sinceLast < REROUTE_MS;
    if (!stale || inFlight) return;

    const ticket = { key: wantKey, at: Date.now() };
    requested.current = ticket;
    void routeBetween(origin, routeTo, vehicle).then((leg) => {
      if (mounted.current && requested.current === ticket) setRoute({ key: wantKey, leg });
    });
    // `origin` and `routeTo` are read through `wantKey` and `live`; listing the
    // objects would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery, delivered, wantKey, live?.lat, live?.lng, route]);

  if (!order || !pickup || !dropoff || !delivery) return null;

  if (delivered) {
    return { phase: 'delivered', position: dropoff, bearing: 0, leg: null, progress: 1, etaMin: 0, pickup, dropoff };
  }

  const leg = route?.key === wantKey ? route.leg : null;
  const fix = live && leg ? locateOnRoute(leg.points, live) : null;
  const progress = fix?.progress ?? 0;
  const atShop = !pickedUp && live !== null && distanceKm(live, pickup) <= AT_SHOP_KM;

  return {
    // At the shop but not yet holding the bag: the courier has arrived and is
    // waiting on the counter, which is a different sentence from "en route".
    phase: pickedUp ? 'to_dropoff' : atShop ? 'awaiting_pickup' : 'to_pickup',
    position: live ? { lat: live.lat, lng: live.lng } : null,
    bearing: live?.heading ?? fix?.bearing ?? 0,
    leg,
    progress,
    etaMin: atShop ? 0 : leg && live ? Math.max(0, Math.ceil(leg.durationMin * (1 - progress))) : null,
    pickup,
    dropoff,
  };
}
