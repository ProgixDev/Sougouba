import {
  ApiError,
  merchantApiDelete,
  merchantApiGet,
  merchantApiPatch,
  merchantApiPost,
  merchantApiPut,
  type Page,
} from './client';
import type { ID } from '../types';
import { mediaUrl } from '../media';
import { t } from '../i18n';

/**
 * The merchant portal's shop and catalogue: everything a shop owner can change
 * about what they sell and when they are open.
 *
 * Every call goes to `/vendors/me/*`, which resolves the shop from the
 * signed-in merchant's token — there is no shop id to pass, and none a merchant
 * could swap for someone else's. These are the same endpoints the mobile app's
 * merchant screens use, so a product edited here and one edited on the phone
 * obey the same rules and show up in the same place.
 */

// ── images ──────────────────────────────────────────────────────────────────

/** A stored image path as an address — shared with the back office (`lib/media.ts`). */
export { mediaUrl };

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Large enough for a phone photo, small enough that a mistaken 40 MB file is refused before it uploads. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Send an image to Storage and return the path to save on the product or shop.
 *
 * Two steps, because the browser uploads straight to Storage rather than
 * through the API: the API hands back a signed upload URL for a path it chose
 * (under this shop's own folder), and the file goes there.
 */
async function uploadImage(endpoint: string, file: File): Promise<string> {
  const contentType = IMAGE_TYPES.find((type) => type === file.type);
  if (!contentType) throw new ApiError(400, t('common.upload.format'));
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(400, t('common.upload.tooLarge'));

  const { path, uploadUrl } = await merchantApiPost<{ path: string; uploadUrl: string }>(endpoint, { contentType });
  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  } catch {
    throw new ApiError(0, t('common.upload.network'));
  }
  if (!response.ok) throw new ApiError(response.status, t('common.upload.failed'));
  return path;
}

export const uploadProductImage = (file: File) => uploadImage('/vendors/me/products/image-upload', file);
export const uploadShopImage = (file: File) => uploadImage('/vendors/me/media-upload', file);

// ── the shop ────────────────────────────────────────────────────────────────

export interface ShopHours {
  /** 0 = Sunday, as `Date.getDay()`. */
  day: number;
  /** `HH:MM`, 24-hour. */
  open: string;
  close: string;
  closed: boolean;
}

export interface ShopSection {
  id: ID;
  nameFr: string;
  position: number;
}

export interface Shop {
  id: ID;
  name: string;
  vendorType: 'grocery' | 'restaurant';
  specialtyFr: string;
  logoUrl: string;
  coverUrl: string;
  categoryIds: ID[];
  city: string;
  address: { street: string; city: string; postalCode: string };
  deliveryEtaMin: number;
  isHalalCertified: boolean;
  hours: ShopHours[];
  sections: ShopSection[];
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  isOpen: boolean;
}

export const getMyShop = () => merchantApiGet<Shop>('/vendors/me');

export interface ShopPatch {
  name?: string;
  specialtyFr?: string;
  isHalalCertified?: boolean;
  deliveryEtaMin?: number;
  coverUrl?: string;
}

export const updateMyShop = (patch: ShopPatch) => merchantApiPatch<Shop>('/vendors/me', patch);

/** The whole week, all seven days — the API replaces it in one go. */
export const setMyHours = (week: ShopHours[]) => merchantApiPut<Shop>('/vendors/me/hours', week);

/** A shelf (« rayon ») or menu section: the shop's own grouping of its products. */
export const addSection = (nameFr: string) => merchantApiPost<ShopSection>('/vendors/me/sections', { nameFr });
export const renameSection = (id: ID, nameFr: string) => merchantApiPatch<ShopSection>(`/vendors/me/sections/${id}`, { nameFr });
/** Refused by the API while products still sit in the section. */
export const removeSection = (id: ID) => merchantApiDelete<void>(`/vendors/me/sections/${id}`);

// ── products ────────────────────────────────────────────────────────────────

export interface Product {
  id: ID;
  categoryId: ID;
  sectionId: ID;
  name: string;
  description: string;
  priceCad: number;
  /** The price before a promotion — shown struck through beside `priceCad`. */
  compareAtPriceCad?: number;
  /** A Storage path; `mediaUrl` turns it into something an `<img>` can load. */
  imageUrl: string;
  stockQty: number;
  isAvailable: boolean;
  tags: string[];
  nutrition?: { calories: number; proteinG: number; fatG: number; weightG: number };
  /** Set when the back office hid the product from shoppers. */
  hiddenByAdmin?: { at: string; reason: string | null };
}

/** What the editor sends. The same fields the API validates for the mobile app. */
export interface ProductInput {
  name: string;
  description: string;
  categoryId: ID;
  sectionId: ID;
  priceCad: number;
  compareAtPriceCad?: number | null;
  stockQty: number;
  isAvailable: boolean;
  tags: string[];
  imageUrl: string;
  /** `null` on an update takes the nutrition strip off the product; left out, it is unchanged. */
  nutrition?: NonNullable<Product['nutrition']> | null;
}

export interface ProductFilters {
  search?: string;
  sectionId?: ID;
}

/** One page of the shop's own products — including unavailable ones, which shoppers never see. */
export function listMyProducts(filters: ProductFilters, page: { offset: number; limit: number }): Promise<Page<Product>> {
  return merchantApiGet<Page<Product>>('/vendors/me/products', {
    q: filters.search?.trim() || undefined,
    sectionId: filters.sectionId,
    // By shelf, then by name: the order a merchant walks their own shop in.
    sort: 'section',
    offset: page.offset,
    limit: page.limit,
  });
}

/** Null for an id that is not this shop's — the editor shows "introuvable". */
export async function getMyProduct(id: ID): Promise<Product | null> {
  try {
    return await merchantApiGet<Product>(`/vendors/me/products/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const createProduct = (input: ProductInput) => merchantApiPost<Product>('/vendors/me/products', input);
export const updateProduct = (id: ID, patch: Partial<ProductInput>) => merchantApiPatch<Product>(`/vendors/me/products/${id}`, patch);
export const removeProduct = (id: ID) => merchantApiDelete<void>(`/vendors/me/products/${id}`);

// ── categories ──────────────────────────────────────────────────────────────

export interface Category {
  id: ID;
  nameFr: string;
}

/**
 * The platform's categories — what shoppers browse by. The route is public;
 * it is read with the merchant's token only because that is the client this
 * portal has (`apiGet` would send the administrator's, which a merchant lacks).
 */
export const listCategories = () => merchantApiGet<Category[]>('/categories');
