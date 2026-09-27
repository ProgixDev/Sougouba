import { randomInt } from 'node:crypto';

/**
 * What a livreur earns on a run, how long a leg takes, and the four digits at
 * the door.
 *
 * Ports of `data/courierPay.ts` and `data/delivery.ts` — with one deliberate
 * break from the original, `deliveryPin`, documented below.
 */

// ── pay (`data/courierPay.ts`) ──────────────────────────────────────────────

/**
 * ⚠️ **Placeholder rates, still unconfirmed with the client** — the CDC fixes
 * the merchant side (12 % + 70 $/month) but says nothing about courier pay, so
 * the shape here is the industry-standard one (flat pickup fee + per-km + tip
 * passed through) and the numbers are the mock's. "Confirm before Phase 0" #3.
 * Changing them is a two-line edit; changing the shape is not, which is why
 * they are constants rather than numbers scattered through the earnings code.
 */
export const BASE_FARE_CAD = 3.5;
export const PER_KM_CAD = 0.9;

/** Shop-to-shopper distance only. The leg to the shop is the cost of doing business. */
export function courierFare(distanceKm: number): number {
  return round2(BASE_FARE_CAD + Math.max(0, distanceKm) * PER_KM_CAD);
}

/**
 * The tip is not revenue the platform touches: it is added after the fare and
 * carries no commission, which is why it is added here rather than folded into
 * the fare.
 */
export function courierEarnings(distanceKm: number, tipCad = 0): number {
  return round2(courierFare(distanceKm) + Math.max(0, tipCad));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── travel time (`data/delivery.ts`) ────────────────────────────────────────

export type VehicleType = 'bike' | 'scooter' | 'car';

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

// ── the PIN ─────────────────────────────────────────────────────────────────

/**
 * The four digits the shopper reads out at the door.
 *
 * **This is the one place Phase 5 deliberately refuses to port the mock.**
 * `data/delivery.ts` derives its PIN from the order id (`hashString('pin:' +
 * orderId) % 10000`) and its own doc comment is candid about what that means:
 * "It is a hand-off token, not a secret — anyone holding the order can compute
 * it." That was fine when both ends needed to compute the same number with no
 * server between them. It is not fine now: the order id travels in URLs, in
 * push payloads and in the merchant's own dashboard, so a derived PIN proves
 * nothing about who is standing at the door.
 *
 * Generated once at courier assignment, stored on `order_deliveries`, and
 * verified server-side at completion. `randomInt` rather than `Math.random`:
 * this is a credential, and a predictable PRNG for a credential is the same
 * bug in a different costume.
 */
export function generateDeliveryPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

/**
 * Constant-time-ish comparison of two PINs.
 *
 * Four digits is a small space, so this is not the main defence — the endpoint
 * rate-limits and the courier must already own the run. It costs nothing to
 * avoid leaking position-of-first-difference through timing, so it is done.
 */
export function pinMatches(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}
