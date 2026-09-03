/**
 * Who gets offered a run, and for how long.
 *
 * The *rules* from the mobile app's `lib/dispatch.ts`, kept pure. What does not
 * come across is where they ran: the mock's timers and state lived in
 * `store/useDispatchStore.ts` and `hooks/useDispatchEngine.ts`, on the
 * courier's own phone. That made the whole thing advisory — a courier whose app
 * was backgrounded was invisible to the dispatcher, and one who stayed offline
 * at the right moment could dodge an expiry. Phase 5 moves the loop to
 * `DispatchService`; these are the decisions it makes.
 */

/**
 * How long a courier has to accept.
 *
 * Thirty seconds is what the big platforms use, and the reason is not
 * arbitrary: long enough to read a shop name and a payout while holding a phone
 * at a red light, short enough that a shopper waiting on a packed order is not
 * paying for someone's indecision.
 */
export const OFFER_TIMEOUT_MS = 30_000;

/**
 * How stale a heartbeat may be before a courier stops counting as on shift.
 *
 * `is_online` alone is not enough: an app killed mid-shift never sends "going
 * offline", so without this the dispatcher would keep offering runs to a phone
 * in someone's pocket and every one would expire. Two minutes is comfortably
 * longer than the ping interval below, so an ordinary hiccup does not drop a
 * working courier off the roster.
 */
export const HEARTBEAT_TTL_MS = 120_000;

/**
 * How often a courier's app reports its position while carrying an order.
 * Advisory — the server accepts pings at any rate; this is what the client is
 * told to aim for, and what `HEARTBEAT_TTL_MS` is sized against.
 */
export const LOCATION_PING_INTERVAL_MS = 8_000;

/**
 * The ranking rule, stated once.
 *
 * Distance from the **shop**, not from the shopper: the first thing that has to
 * happen is someone reaching the counter, and a courier who lives beside the
 * customer but forty minutes from the kitchen leaves the food under a heat
 * lamp. Verbatim from `rankCouriers`.
 *
 * The comparison itself runs in SQL (`DispatchService`) rather than here — the
 * candidate set is "every approved, online courier", and pulling all of them
 * into Node to sort would be a table scan per dispatch tick. This constant
 * exists so the rule has a name and the SQL has something to point at.
 */
export const RANK_BY = 'distance from the courier’s base to the shop, nearest first' as const;

/**
 * How far a courier will be asked to travel to a pickup.
 *
 * The mock had no such limit — it ranked every approved courier and would
 * happily offer a Laval courier a run in Verdun once the nearer ones passed.
 * A cap means an order with nobody sensible nearby waits (and eventually shows
 * up as an unassigned-order alert) rather than being pushed at someone who will
 * decline it, or worse, accept it and arrive cold.
 *
 * ⚠️ Not a client-confirmed number — see `BASE_FARE_CAD`'s note.
 */
export const MAX_PICKUP_DISTANCE_KM = 15;

/** Milliseconds left on the countdown ring. Never negative. */
export function offerRemainingMs(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

export function isOfferExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return offerRemainingMs(expiresAt, now) === 0;
}

/** When an offer made now would lapse. */
export function offerExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + OFFER_TIMEOUT_MS);
}
