import { useCallback, useEffect, useRef } from 'react';

import { couriersApi, ordersApi } from '@/data/api';
import type { Courier } from '@/data/types';
import { courierPosition } from '@/lib/courierPosition';
import { isOfferExpired } from '@/lib/dispatch';
import { useDispatchStore } from '@/store/useDispatchStore';

/** How often the countdown on a live offer is checked. */
const TICK_MS = 1000;
/**
 * How often to ask the server for an offer. The API budgets `/courier/offers`
 * at 20 requests a minute; every 5 s is 12, leaving room for accept/decline.
 */
const LOOK_MS = 5000;
/** Under the server's two-minute roster TTL, with room for one missed beat. */
const HEARTBEAT_MS = 45_000;
/** How often a courier carrying a bag reports where they are, for the shopper's map. */
const PING_MS = 15_000;

/**
 * The courier's side of dispatch.
 *
 * The dispatcher itself runs on the server: it picks the nearest eligible
 * courier and writes an offer addressed to them. This hook does the three
 * things only the phone can:
 *
 *   1. tells the server when the courier goes on or off shift — until it does,
 *      the courier is not in the pool and is never offered anything;
 *   2. sends a heartbeat while waiting, because the server drops a courier it
 *      has not heard from in two minutes — and, while carrying a run, the
 *      position the shopper's tracking map shows;
 *   3. polls for the offer addressed to this courier and shows it, then lets
 *      its countdown run out on screen. Expiry itself is the server's: an offer
 *      that times out here has already been re-offered there.
 *
 * It used to be a client-side dispatcher over the mock order table — fetching
 * "open orders", ranking them against every shop and building the offer on the
 * phone. Against the API that built offers with made-up ids the server could
 * not accept, for a courier the server did not know was online.
 *
 * Mounted once, in the missions screen. Mounting it per screen would run
 * several pollers against one store.
 */
export function useDispatchEngine(courier: Courier | null): void {
  const online = useDispatchStore((s) => s.online);
  const offer = useDispatchStore((s) => s.offer);
  const activeOrderId = useDispatchStore((s) => s.activeOrderId);
  const receiveOffer = useDispatchStore((s) => s.receiveOffer);
  const clearOffer = useDispatchStore((s) => s.clearOffer);

  const busy = useRef(false);
  const lastLook = useRef(0);

  const approved = courier?.status === 'approved';
  const idle = !online || Boolean(activeOrderId) || !approved;

  // Primitives, not `courier.base`: the profile re-reads on focus and hands back
  // a new object each time, which would re-send the shift on every tab switch.
  const baseLat = courier?.base?.lat;
  const baseLng = courier?.base?.lng;

  // 1. The shift, as the server sees it. Re-sent on mount too, so a courier who
  //    was online when the app was killed is back in the pool on relaunch.
  //    Going online carries a position — the dispatcher ranks from it.
  useEffect(() => {
    if (!approved || baseLat === undefined || baseLng === undefined) return;
    const base = { lat: baseLat, lng: baseLng };
    let cancelled = false;
    (async () => {
      const position = online ? await courierPosition(base) : undefined;
      if (!cancelled) await couriersApi.setShift(online, position).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [online, approved, baseLat, baseLng]);

  // 2. Keep-alive while on shift and waiting, with a fresh position.
  useEffect(() => {
    if (!online || !approved || baseLat === undefined || baseLng === undefined || activeOrderId) return;
    const base = { lat: baseLat, lng: baseLng };
    const id = setInterval(async () => {
      couriersApi.heartbeat(await courierPosition(base)).catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [online, approved, baseLat, baseLng, activeOrderId]);

  // 2b. While carrying a run: live position for the shopper's tracking map.
  //     Strict — no fallback to the base address, which would draw a courier
  //     parked at home while they are actually on the road.
  useEffect(() => {
    if (!activeOrderId) return;
    const ping = async () => {
      const position = await courierPosition(null);
      if (position) couriersApi.pingLocation(activeOrderId, position).catch(() => undefined);
    };
    void ping();
    const id = setInterval(ping, PING_MS);
    return () => clearInterval(id);
  }, [activeOrderId]);

  // 3. The offer addressed to this courier.
  const look = useCallback(async () => {
    if (busy.current || !courier) return;
    busy.current = true;
    lastLook.current = Date.now();
    try {
      const offers = await ordersApi.getDispatchableOrders();
      const state = useDispatchStore.getState();
      // The world may have moved while the request was in flight.
      if (!state.online || state.offer || state.activeOrderId) return;

      // No `passedOrderIds` filter here: the server never re-offers an order a
      // courier declined or let expire, so whatever it sends is live. Filtering
      // again on the phone only ever hid offers the server meant.
      const next = offers.find((o) => !isOfferExpired(o, Date.now()));
      if (next) receiveOffer({ ...next, courierId: courier.id });
    } catch {
      // A failed poll is retried on the next look; it is not worth a banner.
    } finally {
      busy.current = false;
    }
  }, [courier, receiveOffer]);

  useEffect(() => {
    if (idle && !offer) return;

    const tick = () => {
      const current = useDispatchStore.getState().offer;
      if (current) {
        if (isOfferExpired(current, Date.now())) clearOffer('expired');
        return;
      }
      if (idle || Date.now() - lastLook.current < LOOK_MS) return;
      void look();
    };

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [idle, offer, look, clearOffer]);
}
