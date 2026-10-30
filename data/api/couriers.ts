import { api, ApiError } from '../http';
import type {
  Courier,
  CourierInsurance,
  CourierStatus,
  ID,
  LatLng,
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

/**
 * The API sends the courier's base as flat `baseLat`/`baseLng`; the app reads
 * `courier.base`. Passed through unmapped, `base` was undefined — so going
 * online had no position to send and the dispatcher never saw the courier.
 */
function toCourier(row: Courier & { baseLat?: number; baseLng?: number }): Courier {
  const { baseLat, baseLng, ...rest } = row;
  return baseLat !== undefined && baseLng !== undefined ? { ...rest, base: { lat: baseLat, lng: baseLng } } : row;
}

async function getMine(): Promise<Courier | undefined> {
  try {
    return toCourier(await api<Courier>('/couriers/me'));
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
  city: string;
  postalCode?: string;
  base: { lat: number; lng: number };
  photoUrl?: string;
}

/**
 * A file lands in the queue, not on the road: the API creates it `pending` and
 * it stays there until an administrator decides (CDC addendum v1.1, §04).
 *
 * Banking is not part of the file: Stripe collects it after approval, through
 * {@link startPayoutOnboarding}, and this database holds an account id.
 *
 * `base` is dropped: the API geocodes the postal code and city itself, for
 * the same reason it re-prices an order — a client-supplied coordinate is a
 * client-supplied delivery fee.
 */
export async function submitApplication(input: CourierApplication): Promise<Courier> {
  return toCourier(await api<Courier>('/couriers/apply', {
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
  }));
}

/**
 * Test phase only: the courier clears their own pending file. The API answers
 * 404 unless `ALLOW_DEMO_SELF_APPROVAL` is set on the deploy — the real
 * decision is `POST /admin/couriers/:id/approve`, in the back office.
 */
export async function demoApproveMine(): Promise<Courier> {
  return toCourier(await api<Courier>('/couriers/me/demo-approve', { method: 'POST' }));
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
    return toCourier(await api<Courier>('/couriers/me', { method: 'PATCH', body: sendable }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

// ── shift & dispatch ────────────────────────────────────────────────────────

/**
 * Going on or off shift, as the server sees it.
 *
 * The online switch used to live only in `useDispatchStore`, so the dispatcher —
 * which runs on the server now — never saw anyone online and never offered a
 * run. The API refuses to put a pending or suspended courier online.
 */
export async function setShift(isOnline: boolean, position?: LatLng): Promise<void> {
  // Going online requires a position: the dispatcher ranks couriers from it.
  await api('/couriers/me/shift', { method: 'POST', body: { isOnline, ...(isOnline ? position : {}) } });
}

/** Keep-alive while waiting for work. The server drops a courier it has not heard from in two minutes. */
export async function heartbeat(position?: LatLng): Promise<void> {
  await api('/couriers/me/heartbeat', { method: 'POST', body: position ?? {} });
}

/**
 * Where the courier is while carrying `orderId` — what the shopper's tracking
 * map reads. Also counts as a heartbeat on the server.
 */
export async function pingLocation(orderId: ID, position: LatLng): Promise<void> {
  await api(`/couriers/me/runs/${orderId}/location`, { method: 'POST', body: position });
}

/** Pass on an offer, so the server re-offers the run to the next courier straight away instead of at expiry. */
export async function declineOffer(offerId: ID): Promise<void> {
  await api(`/couriers/me/offers/${offerId}/decline`, { method: 'POST', body: {} });
}

// ── payouts ─────────────────────────────────────────────────────────────────

/**
 * Where the courier stands with Stripe — asked of Stripe by the API, not read
 * from a cached column, because `payoutsEnabled` flips when Stripe finishes its
 * own checks and nothing tells us.
 */
export interface PayoutStatus {
  /** The courier finished Stripe's form (`details_submitted`). */
  onboarded: boolean;
  /** Stripe will actually send money to their bank. */
  payoutsEnabled: boolean;
  /** `not_started` until the first onboarding link is asked for. */
  status: 'not_started' | 'onboarding' | 'active' | string;
}

export async function getPayoutStatus(): Promise<PayoutStatus> {
  return api<PayoutStatus>('/couriers/me/stripe/status');
}

/** What has been delivered and not yet paid out — the amount the next Friday transfer carries. */
export async function getPendingPayout(): Promise<{ pendingCad: number; runCount: number }> {
  return api('/couriers/me/payouts/pending');
}

/**
 * The URL the in-app browser waits for. The API's `/stripe/connect/return`
 * redirects here, so the sheet closes itself when Stripe is done.
 */
export const PAYOUT_RETURN_URL = 'sougouba://payouts-return';

/**
 * A one-time Stripe onboarding link for the courier's Connect account.
 *
 * Both return addresses are the API's own HTTPS route, which bounces to
 * {@link PAYOUT_RETURN_URL}: `refresh` is where Stripe sends a link that
 * expired before it was finished.
 */
export async function startPayoutOnboarding(): Promise<string> {
  const back = `${process.env.EXPO_PUBLIC_API_URL}/stripe/connect/return`;
  const { url } = await api<{ url: string }>('/couriers/me/stripe/onboard', {
    method: 'POST',
    body: { returnUrl: `${back}?state=done`, refreshUrl: `${back}?state=refresh` },
  });
  return url;
}

// ── test phase ──────────────────────────────────────────────────────────────

/**
 * Test phase only: a demonstration run — a real `ready` order at the nearest
 * shop, offered to this courier straight away. The API answers 404 unless
 * `ALLOW_DEMO_RUNS` is set on the deploy.
 */
export async function startDemoRun(): Promise<{ orderId: ID; offerId: ID }> {
  return api('/couriers/me/demo-run', { method: 'POST', body: {} });
}
