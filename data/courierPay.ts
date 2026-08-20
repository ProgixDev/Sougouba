/**
 * What a livreur earns on a run.
 *
 * Lives in `data/` rather than `lib/` for the same reason `data/taxes.ts` does:
 * both the seed builder and the mock API need it, and `data/` must not import
 * from `lib/`.
 *
 * Sibling of `lib/monetization.ts`, and the same caveat applies: the CDC
 * addendum fixes the merchant side (12 % commission + 70 $/month) but says
 * nothing about courier pay, so the shape here — a flat pickup fee, a rate per
 * kilometre, and the tip passed through untouched — is the industry-standard
 * one and the rates are placeholders. **Confirm with the client.** Changing them
 * is a two-line edit; changing the shape is not, which is why they are constants
 * rather than numbers scattered through the earnings screens.
 *
 * The tip is not revenue the platform touches: it is added after the fare and
 * carries no commission, which is why `courierEarnings` adds it rather than
 * folding it into the fare.
 */

export const BASE_FARE_CAD = 3.5;
export const PER_KM_CAD = 0.9;

/** Shop-to-shopper distance only. The leg to the shop is the cost of doing business. */
export function courierFare(distanceKm: number): number {
  return round2(BASE_FARE_CAD + Math.max(0, distanceKm) * PER_KM_CAD);
}

export function courierEarnings(distanceKm: number, tipCad = 0): number {
  return round2(courierFare(distanceKm) + Math.max(0, tipCad));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
