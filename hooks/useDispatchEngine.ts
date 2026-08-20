import { useCallback, useEffect, useRef } from 'react';

import { ordersApi, vendorsApi } from '@/data/api';
import type { Courier, Order, Vendor } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';
import { buildOffer, isOfferExpired } from '@/lib/dispatch';
import { useDispatchStore } from '@/store/useDispatchStore';

/** How often the dispatcher looks for work, and checks the countdown. */
const TICK_MS = 1000;

/**
 * The dispatcher, standing in for a backend that does not exist.
 *
 * On a real platform this runs server-side and pushes an offer to the phone.
 * Here it polls the mock table on a one-second tick, which is the same shape
 * from the screen's point of view: an offer appears, a countdown runs, and if
 * nobody accepts it goes away.
 *
 * Mounted once, in `app/(courier)/_layout.tsx` — the same place the customer
 * group mounts `useDemoSeed`. Mounting it per screen would run several
 * dispatchers against one store and hand out the same order more than once.
 *
 * Three rules, in order:
 *   1. offline, mid-run, or no approved file -> do nothing;
 *   2. an offer on screen -> only check whether it has expired;
 *   3. otherwise -> offer the nearest packed order this courier has not passed
 *      on, with age breaking ties.
 *
 * Nearest first, because the leg to the shop is unpaid: ranking purely by age
 * offered a courier in Villeray a pickup in Longueuil while a shop two streets
 * away was also waiting, which is a run nobody accepts. Age still matters — an
 * order going cold should not sit behind a fresher one at the same distance —
 * so it decides between shops within a few hundred metres of each other.
 */
export function useDispatchEngine(courier: Courier | null): void {
  const online = useDispatchStore((s) => s.online);
  const offer = useDispatchStore((s) => s.offer);
  const activeOrderId = useDispatchStore((s) => s.activeOrderId);
  const passedOrderIds = useDispatchStore((s) => s.passedOrderIds);
  const receiveOffer = useDispatchStore((s) => s.receiveOffer);
  const clearOffer = useDispatchStore((s) => s.clearOffer);

  // Guards a fetch that outlives its tick: without it a slow mock read can
  // deliver an offer after the courier has already gone offline or accepted.
  const busy = useRef(false);

  const idle = !online || Boolean(activeOrderId) || courier?.status !== 'approved';

  const look = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const open = await ordersApi.getDispatchableOrders();
      const state = useDispatchStore.getState();
      // Re-read rather than closing over: this resolves a tick or two later and
      // the courier may have accepted, declined or gone offline in between.
      if (!state.online || state.offer || state.activeOrderId || !courier) return;

      const candidates = open.filter((o) => !state.passedOrderIds.includes(o.id));
      if (candidates.length === 0) return;

      // One fetch for the whole catalogue rather than one per candidate: the
      // mock layer delays every call, and this runs on a one-second tick.
      const vendors = await vendorsApi.getVendors();
      const byId = new Map(vendors.map((v) => [v.id, v]));

      const picked = pickNearest(candidates, byId, courier);
      if (!picked) return;
      const { order: next, vendor } = picked;

      const after = useDispatchStore.getState();
      if (!after.online || after.offer || after.activeOrderId) return;

      receiveOffer(buildOffer(next, vendor, courier, courier.base, Date.now()));
    } finally {
      busy.current = false;
    }
  }, [courier, receiveOffer]);

  useEffect(() => {
    // Expiry is *not* gated on `idle`. An offer already on screen has to be
    // able to time out whatever else is true — and it can outlive the state
    // that produced it, because the store persists it: accepting a run, killing
    // the app and reopening it restored a live offer over the run in progress,
    // with a countdown frozen at three seconds and no tick left running to
    // clear it. Looking for *new* work is the part that waits.
    if (idle && !offer) return;

    const tick = () => {
      const current = useDispatchStore.getState().offer;
      if (current) {
        // Letting it lapse counts as passing on it — same as tapping Refuser,
        // which is what a courier who ignored it meant.
        if (isOfferExpired(current, Date.now())) clearOffer('expired');
        return;
      }
      if (idle) return;
      void look();
    };

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
    // `offer` is in the deps so accepting or declining restarts the loop
    // immediately rather than waiting out the current interval.
  }, [idle, offer, passedOrderIds, look, clearOffer]);
}

/** ~500 m. Inside this the two shops are the same trip, so the older order wins. */
const TIE_KM = 0.5;

function pickNearest(
  orders: Order[],
  vendors: Map<string, Vendor>,
  courier: Courier
): { order: Order; vendor: Vendor } | null {
  const scored = orders
    .map((order) => {
      const vendor = vendors.get(order.vendorId);
      return vendor ? { order, vendor, km: distanceKm(courier.base, vendor.address) } : null;
    })
    .filter((x): x is { order: Order; vendor: Vendor; km: number } => x !== null);

  if (scored.length === 0) return null;

  scored.sort((a, b) =>
    Math.abs(a.km - b.km) < TIE_KM
      ? a.order.createdAt.localeCompare(b.order.createdAt)
      : a.km - b.km
  );
  return { order: scored[0].order, vendor: scored[0].vendor };
}
