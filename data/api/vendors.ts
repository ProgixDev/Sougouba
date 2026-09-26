import { api, type Page } from '../http';
import type { Address, ID, LocalizedText, ShopRegistration, Vendor, VendorStatus, VendorType } from '../types';
import { toVendor } from './mappers';

/**
 * ⚠️ Every read here returns **approved shops only** — the API enforces it, not
 * this file. A shop whose file is still in the queue is not "a shop that
 * happens to be closed"; it is one the platform has not vouched for, and
 * putting it in front of someone who could order from it is what the approval
 * step exists to prevent. `getVendorByOwnerId` is the deliberate exception.
 */

/** The API paginates; the app's callers expect the whole list. 100 covers every served city today. */
const ALL = 100;

export async function getVendors(): Promise<Vendor[]> {
  const page = await api<Page<any>>('/vendors', { anonymous: true, query: { limit: ALL } });
  return page.items.map(toVendor);
}

export async function getVendorById(id: ID): Promise<Vendor | undefined> {
  return single(`/vendors/${id}`);
}

export async function getVendorBySlug(slug: string): Promise<Vendor | undefined> {
  return single(`/vendors/slug/${encodeURIComponent(slug)}`);
}

export async function getVendorsByType(vendorType: VendorType): Promise<Vendor[]> {
  const page = await api<Page<any>>('/vendors', {
    anonymous: true,
    query: { type: vendorType, limit: ALL },
  });
  return page.items.map(toVendor);
}

export async function getVendorsByCategory(categoryId: ID): Promise<Vendor[]> {
  const page = await api<Page<any>>('/vendors', {
    anonymous: true,
    query: { categoryId, limit: ALL },
  });
  return page.items.map(toVendor);
}

/**
 * The signed-in merchant's own shop, **at any status** — how a pending applicant
 * watches their queue position.
 *
 * ⚠️ The `ownerId` argument is ignored. The API answers `/vendors/me` from the
 * token, and asking for someone else's shop by owner id is not a thing a
 * merchant may do. Kept in the signature so the business screens need no edit.
 */
export async function getVendorByOwnerId(_ownerId: ID): Promise<Vendor | undefined> {
  return single('/vendors/me');
}

async function single(path: string): Promise<Vendor | undefined> {
  try {
    return toVendor(await api<any>(path, { anonymous: true }));
  } catch (error) {
    // A 404 is "no such shop", which every caller already handles as undefined.
    if ((error as { status?: number }).status === 404) return undefined;
    throw error;
  }
}

export interface ShopApplication {
  ownerId: ID;
  name: string;
  vendorType: VendorType;
  /** The merchant's own words, in the language they typed them. */
  specialty: LocalizedText;
  isHalalCertified: boolean;
  address: Address;
  deliveryEtaMin: number;
  registration: Omit<ShopRegistration, 'submittedAt'>;
}

/**
 * Register a shop.
 *
 * The default hours and starting sections that used to be built here are the
 * API's now — `vendor_apply` writes the shop, its paperwork, a nine-to-nine
 * week and the opening sections in one transaction, and links the owner's
 * profile to it. A merchant left with a shop row and no hours would have a shop
 * that is closed forever with no way to say otherwise.
 *
 * ⚠️ `specialty` is sent as its French text. The API column is `specialty_fr`;
 * there is nowhere to put a second language yet.
 */
export async function submitShopApplication(input: ShopApplication): Promise<Vendor> {
  const created = await api<any>('/vendors/apply', {
    method: 'POST',
    body: {
      name: input.name,
      vendorType: input.vendorType,
      specialtyFr: input.specialty.fr,
      isHalalCertified: input.isHalalCertified,
      street: input.address.street,
      city: input.address.city,
      postalCode: input.address.postalCode,
      deliveryEtaMin: input.deliveryEtaMin,
      neq: input.registration.neq,
      contactName: input.registration.contactName,
      contactPhone: input.registration.contactPhone,
      mapaqNumber: input.registration.mapaqNumber,
    },
  });
  return toVendor(created);
}

/**
 * ⚠️ **Removed, deliberately — this now always throws.**
 *
 * `setVendorStatus` let the app approve its own shop, which was a demo
 * convenience the mock could afford because it was the only writer. Approving a
 * merchant is an administrator's decision, taken in the back office, audited,
 * and guarded — `POST /admin/vendors/:id/approve` behind `AdminGuard`.
 *
 * Left as a throwing stub rather than deleted so the two demo hooks that call it
 * fail loudly at the call site instead of silently doing nothing. They should be
 * removed once the review queue is the only path.
 */
export async function setVendorStatus(_id: ID, _status: VendorStatus): Promise<Vendor | undefined> {
  throw new Error(
    'setVendorStatus is not available to the app — approving a shop is an administrator action in the back office.'
  );
}
