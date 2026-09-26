import { api, ApiError } from '../http';
import type {
  Courier,
  CourierInsurance,
  CourierPayout,
  CourierStatus,
  ID,
  VehicleType,
} from '../types';

/**
 * The courier file.
 *
 * ⚠️ Same shape as `vendors.ts`: a courier reads and edits **their own** file
 * through `/couriers/me`, and everything about *other* couriers — the roster,
 * approving one, rewriting a history — is either an administrator's action or
 * has no endpoint at all. The `id` arguments below are kept so the courier
 * screens need no edit, and ignored.
 */

export async function getCourierById(id: ID): Promise<Courier | undefined> {
  const mine = await getMine();
  // A courier may read their own file and nobody else's. Returning undefined
  // rather than throwing keeps every caller's existing branch.
  return mine && mine.id === id ? mine : undefined;
}

export async function getCourierByUserId(_userId: ID): Promise<Courier | undefined> {
  return getMine();
}

async function getMine(): Promise<Courier | undefined> {
  try {
    return await api<Courier>('/couriers/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 401)) return undefined;
    throw error;
  }
}

/**
 * ⚠️ **No endpoint, and there should not be one.** The mock could list every
 * approved courier because it held the table; a shopper or merchant asking the
 * server for the courier roster is asking for a directory of people's names,
 * phone numbers and home areas. The back office has this behind `AdminGuard`
 * (`GET /admin/couriers`).
 *
 * The one legitimate consumer — the tracking map's "who is carrying my order" —
 * gets the courier through the order, not from a roster.
 */
export async function getApprovedCouriers(): Promise<Courier[]> {
  throw new Error(
    'The courier roster is not readable by the app — it is a back-office list. Read the courier off the order instead.'
  );
}

export interface CourierApplication {
  userId: ID;
  fullName: string;
  phone: string;
  vehicle: VehicleType;
  plate?: string;
  licenceNumber?: string;
  insurance?: CourierInsurance;
  payout?: CourierPayout;
  city: string;
  postalCode?: string;
  base: { lat: number; lng: number };
  photoUrl?: string;
}

/**
 * A file lands in the queue, not on the road: the API creates it `pending` and
 * it stays there until an administrator decides (CDC addendum v1.1, §04).
 *
 * ⚠️ `payout` is **not sent**. The mock stored `{ bankId, transit, account }`;
 * this database deliberately holds no raw bank details — Stripe collects them
 * during Connect onboarding, and `courier_payouts` holds an account id, not a
 * transit number. The signup form's payout step needs rerouting to
 * `POST /couriers/me/stripe/onboard`; until it is, those fields are collected
 * and dropped, which is better than storing them but is not finished work.
 *
 * `base` is dropped too: the API geocodes the postal code and city itself, for
 * the same reason it re-prices an order — a client-supplied coordinate is a
 * client-supplied delivery fee.
 */
export async function submitApplication(input: CourierApplication): Promise<Courier> {
  return api<Courier>('/couriers/apply', {
    method: 'POST',
    body: {
      fullName: input.fullName,
      phone: input.phone,
      vehicle: input.vehicle,
      plate: input.plate,
      licenceNumber: input.licenceNumber,
      city: input.city,
      postalCode: input.postalCode,
      photoUrl: input.photoUrl,
      ...(input.insurance
        ? {
            insurerName: input.insurance.insurerName,
            insurancePolicy: input.insurance.policyNumber,
            insuranceExpiry: input.insurance.expiry,
          }
        : {}),
    },
  });
}

/**
 * ⚠️ **Removed.** This wrote a fabricated delivery count and rating onto a
 * courier's own file so a demo would not open on "Nouveau · aucune course".
 * Against a real backend that is inventing a reputation in the database, which
 * `deliveryCount` is not — it is incremented by `delivery_complete`, once, per
 * actual delivery.
 */
export async function recordDemoHistory(_id: ID, _deliveryCount: number): Promise<Courier | undefined> {
  throw new Error('recordDemoHistory wrote a fake reputation and has no equivalent against the real API.');
}

/**
 * ⚠️ **Removed.** Approving a courier is an administrator's decision, audited
 * and guarded — `POST /admin/couriers/:id/approve`. Left throwing so the demo
 * hook that calls it fails at the call site rather than quietly doing nothing.
 */
export async function setCourierStatus(_id: ID, _status: CourierStatus): Promise<Courier | undefined> {
  throw new Error(
    'setCourierStatus is not available to the app — approving a courier is an administrator action in the back office.'
  );
}

/** Editable from the courier's own profile. Identity, rating and status are not. */
export async function updateCourier(
  _id: ID,
  patch: Partial<Pick<Courier, 'phone' | 'vehicle' | 'plate' | 'city' | 'base' | 'photoUrl'>>
): Promise<Courier | undefined> {
  const { base: _base, ...sendable } = patch;
  try {
    return await api<Courier>('/couriers/me', { method: 'PATCH', body: sendable });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}
