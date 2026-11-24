import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import type { PickedImage } from '../../hooks/useImagePicker';
import type { PlatformPlan } from '../../lib/monetization';
import type { PickedDocument } from '../../lib/validation/merchant';

import { ApiError, api, type Page } from '../http';
import type { Address, ID, Vendor, VendorHours, VendorStatus, VendorType } from '../types';
import { toVendor } from './mappers';
import { uploadMediaImage, type MediaImageType } from './media';

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
  // Not anonymous: `/vendors/me` is answered from the token, so sending none
  // is a 401 "Missing bearer token" every time.
  return single('/vendors/me', { anonymous: false });
}

/** Public shop reads skip the session by default; pass `anonymous: false` for the caller's own. */
async function single(path: string, { anonymous = true } = {}): Promise<Vendor | undefined> {
  try {
    return toVendor(await api<any>(path, { anonymous }));
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
  /** An entry of the back-office specialty list for this `vendorType`. */
  specialtyId: ID;
  isHalalCertified: boolean;
  address: Address;
  deliveryEtaMin: number;
  registration: {
    legalName: string;
    /** Absent when a proof of registration was attached instead. */
    neq?: string;
    gstNumber: string;
    qstNumber: string;
    contactName: string;
    contactPhone: string;
    mapaqNumber: string;
    /** `YYYY-MM-DD`. */
    mapaqExpiresOn: string;
    payoutMethod: 'stripe' | 'bank_document';
    /** Storage paths returned by {@link uploadRegistrationDocument}. */
    idDocumentPath: string;
    businessNumberDocumentPath?: string;
    mapaqDocumentPath: string;
    bankDocumentPath?: string;
  };
}

export type RegistrationDocumentKind = 'id' | 'business_number' | 'mapaq' | 'bank';

/**
 * Upload one registration document and return where it landed.
 *
 * Two hops, on purpose: the API picks the path and signs a one-shot upload URL
 * for it (merchants hold no Storage policy on this bucket — nothing on the
 * device can overwrite a document once an administrator has read it), then the
 * file goes straight to Storage rather than through the API. `vendor_apply`
 * later refuses any path with nothing behind it.
 */
export async function uploadRegistrationDocument(
  kind: RegistrationDocumentKind,
  document: PickedDocument
): Promise<string> {
  const { path, uploadUrl } = await api<{ path: string; uploadUrl: string }>('/vendors/apply/documents', {
    method: 'POST',
    body: { kind, contentType: document.mimeType },
  });
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': document.mimeType },
    body: new File(document.uri),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Envoi du document impossible. Veuillez réessayer.');
  }
  return path;
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
 * `specialtyId` is an entry of the back-office list; the API copies its French
 * name onto the shop, which is what cards and search show.
 */
export async function submitShopApplication(input: ShopApplication): Promise<Vendor> {
  const created = await api<any>('/vendors/apply', {
    method: 'POST',
    body: {
      name: input.name,
      vendorType: input.vendorType,
      specialtyId: input.specialtyId,
      isHalalCertified: input.isHalalCertified,
      street: input.address.street,
      city: input.address.city,
      postalCode: input.address.postalCode,
      deliveryEtaMin: input.deliveryEtaMin,
      ...input.registration,
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

// ── merchant self-service ───────────────────────────────────────────────────

/** What a merchant may change about their own shop — `updateVendorSchema` on the API. */
export interface ShopPatch {
  name?: string;
  isHalalCertified?: boolean;
  deliveryEtaMin?: number;
  /** A Storage path returned by {@link uploadShopCover}, or `''` to remove the photo. */
  coverUrl?: string;
}

export async function updateMyShop(patch: ShopPatch): Promise<Vendor> {
  return toVendor(await api<any>('/vendors/me', { method: 'PATCH', body: patch }));
}

/** The whole week, all seven days — the API replaces it in one transaction. */
export async function setMyHours(week: VendorHours[]): Promise<Vendor> {
  return toVendor(await api<any>('/vendors/me/hours', { method: 'PUT', body: week }));
}

/** The commission rate and monthly subscription an administrator has set — the same for every merchant. */
export async function getMyPlan(): Promise<PlatformPlan> {
  return api<PlatformPlan>('/vendors/me/plan');
}

// ── the monthly subscription ────────────────────────────────────────────────

/**
 * Where the shop's monthly subscription stands (CDC addendum v1.1, §05).
 *
 * `inactive` has never subscribed; `past_due` has a renewal the card refused;
 * `canceled` has ended. `cancelAt` is set while a subscription the merchant
 * cancelled is still running out the month already paid for.
 */
export interface MerchantSubscription {
  status: 'inactive' | 'active' | 'past_due' | 'canceled';
  /** What this shop is billed each month — or, before it subscribes, what subscribing costs. */
  priceCad: number;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  /** False when the server cannot reach Stripe: there is nothing to subscribe with. */
  available: boolean;
}

export async function getMySubscription(): Promise<MerchantSubscription> {
  return api<MerchantSubscription>('/vendors/me/subscription');
}

/**
 * The URL the in-app browser waits for. The API's `/stripe/billing/return`
 * redirects here, so the sheet closes itself when Stripe is done.
 */
export const SUBSCRIPTION_RETURN_URL = 'sougouba://subscription-return';

const billingReturn = (state: 'done' | 'cancel') => `${process.env.EXPO_PUBLIC_API_URL}/stripe/billing/return?state=${state}`;

/** A link to Stripe's hosted checkout, where the merchant enters a card and the subscription starts. */
export async function startSubscriptionCheckout(): Promise<string> {
  const { url } = await api<{ url: string }>('/vendors/me/subscription/checkout', {
    method: 'POST',
    body: { successUrl: billingReturn('done'), cancelUrl: billingReturn('cancel') },
  });
  return url;
}

/** A link to Stripe's portal: change the card, read the invoices, cancel. */
export async function openSubscriptionPortal(): Promise<string> {
  const { url } = await api<{ url: string }>('/vendors/me/subscription/portal', {
    method: 'POST',
    body: { returnUrl: billingReturn('done') },
  });
  return url;
}

/** Upload the shop's cover photo and return the Storage path to save as `coverUrl`. */
export async function uploadShopCover(image: PickedImage, contentType: MediaImageType): Promise<string> {
  return uploadMediaImage('/vendors/me/media-upload', image, contentType);
}

export interface VendorPageFilters {
  type?: VendorType;
  halal?: boolean;
  /** Posted delivery time at most this many minutes. */
  maxEtaMin?: number;
  openNow?: boolean;
  /** The shopper's delivery point: with it, open shops first, then nearest. */
  near?: { lat: number; lng: number } | null;
  /** Exactly these shops (at most 100). */
  ids?: ID[];
}

/** One page of approved shops, filtered and ordered by the API. */
export async function getVendorsPage(filters: VendorPageFilters, offset: number, limit: number): Promise<Page<Vendor>> {
  const page = await api<Page<any>>('/vendors', {
    anonymous: true,
    query: {
      type: filters.type,
      halal: filters.halal || undefined,
      maxEtaMin: filters.maxEtaMin,
      openNow: filters.openNow || undefined,
      lat: filters.near?.lat,
      lng: filters.near?.lng,
      ids: filters.ids?.join(','),
      offset,
      limit,
    },
  });
  return { ...page, items: page.items.map(toVendor) };
}
