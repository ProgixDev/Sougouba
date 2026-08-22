import { couriers as seedCouriers } from '../seed/couriers';
import type {
  Courier,
  CourierInsurance,
  CourierPayout,
  CourierStatus,
  ID,
  VehicleType,
} from '../types';
import { delay } from '../utils/delay';
import { generateId } from '../utils/ids';
import { hashString, mulberry32 } from '../utils/random';
import { createPersistedTable } from '../utils/persistedTable';

/**
 * Courier files persist: someone who registers during a demo, kills the app and
 * comes back to "vous n'avez pas de dossier" would read that as a bug rather
 * than a mock. Same table helper, same rules — seeds re-read from code each
 * launch, only app-written rows stored.
 */
const table = createPersistedTable<Courier>('sougouba-mock-couriers', seedCouriers);

/** Copies out, so callers can't mutate the table by holding a reference. */
function snapshot(courier: Courier): Courier {
  return {
    ...courier,
    base: { ...courier.base },
    ...(courier.insurance ? { insurance: { ...courier.insurance } } : {}),
    ...(courier.payout ? { payout: { ...courier.payout } } : {}),
  };
}

export async function getCourierById(id: ID): Promise<Courier | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = table.rows().find((c) => c.id === id);
  return found ? snapshot(found) : undefined;
}

export async function getCourierByUserId(userId: ID): Promise<Courier | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = table.rows().find((c) => c.userId === userId);
  return found ? snapshot(found) : undefined;
}

/**
 * Everyone the dispatcher is allowed to offer a run to.
 *
 * Pending and suspended files are not "couriers who happen to be offline" — they
 * are people the platform has not cleared to carry someone's dinner, so they
 * never enter the ranking at all.
 */
export async function getApprovedCouriers(): Promise<Courier[]> {
  await table.ready;
  await delay();
  return table
    .rows()
    .filter((c) => c.status === 'approved')
    .map(snapshot);
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
 * A file lands in the queue, not on the road: `status` is `pending` and stays
 * there until an administrator says otherwise (CDC addendum v1.1, §04). The app
 * has no way to approve anything, which is exactly what `CourierPending` and its
 * demo shortcut are for.
 */
export async function submitApplication(input: CourierApplication): Promise<Courier> {
  await table.ready;
  await delay(500, 900);
  const courier: Courier = {
    id: generateId('crr'),
    userId: input.userId,
    fullName: input.fullName,
    ...(input.photoUrl ? { photoUrl: input.photoUrl } : {}),
    phone: input.phone,
    vehicle: input.vehicle,
    ...(input.plate ? { plate: input.plate } : {}),
    ...(input.licenceNumber ? { licenceNumber: input.licenceNumber } : {}),
    ...(input.insurance ? { insurance: { ...input.insurance } } : {}),
    ...(input.payout ? { payout: { ...input.payout } } : {}),
    city: input.city,
    ...(input.postalCode ? { postalCode: input.postalCode } : {}),
    base: input.base,
    // A new courier has no history. Showing "4,8 ★" before the first run would
    // be inventing a reputation.
    rating: 0,
    deliveryCount: 0,
    status: 'pending',
    joinedAt: new Date().toISOString(),
  };
  await table.add(courier);
  return snapshot(courier);
}

/**
 * Reconcile a courier's headline figures with the runs they have.
 *
 * Called once, by `ensureDemoRuns`'s caller, after a demo history is written.
 * A file created in the app starts at `deliveryCount: 0` and `rating: 0` —
 * correct at the time, and wrong the moment thirty days of deliveries exist
 * behind it. Left alone, the profile screen reads "Nouveau · aucune course"
 * over a Courses tab holding eighty of them.
 *
 * The rating is derived from the id rather than passed in, on the same argument
 * `data/seed/couriers.ts` makes: a hand-picked 4,8 reads as a placeholder, and a
 * fresh `Math.random()` each launch would fight the persisted row.
 */
export async function recordDemoHistory(id: ID, deliveryCount: number): Promise<Courier | undefined> {
  await table.ready;
  const courier = table.rows().find((c) => c.id === id);
  if (!courier || deliveryCount <= 0) return undefined;
  courier.deliveryCount = deliveryCount;
  // 4.6 - 5.0. Narrower than the seed's 4.4 - 5.0: this is someone's own
  // profile, and a demo that opens on a mediocre score reads as a bug report.
  courier.rating = Math.round((4.6 + mulberry32(hashString(`rating:${id}`))() * 0.4) * 10) / 10;
  await table.save(courier.id);
  return snapshot(courier);
}

export async function setCourierStatus(id: ID, status: CourierStatus): Promise<Courier | undefined> {
  await table.ready;
  await delay(300, 600);
  const courier = table.rows().find((c) => c.id === id);
  if (!courier) return undefined;
  courier.status = status;
  await table.save(courier.id);
  return snapshot(courier);
}

/** Editable from the courier's own profile. Identity, rating and status are not. */
export async function updateCourier(
  id: ID,
  patch: Partial<Pick<Courier, 'phone' | 'vehicle' | 'plate' | 'city' | 'base' | 'photoUrl'>>
): Promise<Courier | undefined> {
  await table.ready;
  await delay();
  const courier = table.rows().find((c) => c.id === id);
  if (!courier) return undefined;
  Object.assign(courier, patch);
  await table.save(courier.id);
  return snapshot(courier);
}
