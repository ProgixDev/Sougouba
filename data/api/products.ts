import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import type { PickedImage } from '../../hooks/useImagePicker';

import { api, ApiError, type Page } from '../http';
import type { ID, Product } from '../types';
import { toProduct } from './mappers';

/**
 * The API's own ceiling (`MAX_PAGE_SIZE`), and it **rejects** a bigger one
 * rather than clamping — a `?limit=200` is a 400, not 100 rows.
 */
const ALL = 100;

/** `productIdsSchema`'s ceiling on the API side; a longer list is a 400, not a truncation. */
const MAX_IDS = 100;

/**
 * ⚠️ **The reads and the writes see different catalogues, on purpose.**
 *
 * Every read below is the *shopper's* view — approved shops only, enforced by
 * the API. The three writes are the *merchant's* own, and go through
 * `/vendors/me/products`, which is scoped to their shop at any status so they
 * can stock it while the file is still in review.
 */

/**
 * The whole browsable catalogue, in one request.
 *
 * This used to be N+1 — it listed the approved shops and then asked each one
 * for its shelves, so the home screen cost 1 + one-request-per-shop and got
 * slower with every merchant who signed up. `GET /products` is the paginated
 * browse endpoint that note was waiting for: same filters as
 * `/products/search`, with the search term optional, answered by the same
 * single `product_page` call however many shops exist.
 *
 * Still capped at `ALL`. A catalogue larger than one page is a real paging UI,
 * not a bigger number here, and `getProductsByCategory`/`searchProducts` are
 * the narrower questions most screens actually want to ask.
 */
export async function getProducts(): Promise<Product[]> {
  const page = await api<Page<any>>('/products', {
    anonymous: true,
    query: { limit: ALL },
  });
  return page.items.map(toProduct);
}

export async function getProductById(id: ID): Promise<Product | undefined> {
  try {
    return toProduct(await api<any>(`/products/${id}`, { anonymous: true }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

export async function getProductsByVendor(vendorId: ID): Promise<Product[]> {
  const page = await api<Page<any>>(`/vendors/${vendorId}/products`, {
    anonymous: true,
    query: { limit: ALL },
  });
  return page.items.map(toProduct);
}

/**
 * One category, filtered in the database.
 *
 * Previously this pulled the entire catalogue and filtered it on the device —
 * the exact thing the API was built not to do. `?categoryId=` applies the same
 * rule server-side, so a category tap is one request for one category's rows.
 */
export async function getProductsByCategory(categoryId: ID): Promise<Product[]> {
  const page = await api<Page<any>>('/products', {
    anonymous: true,
    query: { categoryId, limit: ALL },
  });
  return page.items.map(toProduct);
}

/**
 * Specific products by id, in one request.
 *
 * For the screens that already hold ids and only need what is behind them —
 * the cart, checkout, and the favourites list. They used to download the whole
 * catalogue and filter it locally.
 *
 * ⚠️ **Ids that no longer resolve are absent from the result, not an error.**
 * A favourite whose shop has since been suspended should quietly drop off the
 * list rather than break the screen, so callers must treat a missing id as
 * "gone" rather than assuming the array lines up with what they asked for.
 * Capped at `MAX_IDS`, matching the API.
 */
export async function getProductsByIds(ids: ID[]): Promise<Product[]> {
  const wanted = [...new Set(ids)].slice(0, MAX_IDS);
  if (wanted.length === 0) return [];
  const rows = await api<any[]>('/products/by-ids', {
    anonymous: true,
    query: { ids: wanted.join(',') },
  });
  return rows.map(toProduct);
}

/**
 * Name-or-tag search, run in the database.
 *
 * The empty-query early return is kept: it saves a request, and "" matching
 * everything is not what an empty search box means. Everything else moved
 * server-side, where the tag match is `unnest`-ed rather than a `.some()` per
 * row and the `%` a shopper types is escaped rather than matching the catalogue.
 */
export async function searchProducts(query: string): Promise<Product[]> {
  const q = query.trim();
  if (!q) return [];
  const page = await api<Page<any>>('/products/search', {
    anonymous: true,
    query: { q, limit: ALL },
  });
  return page.items.map(toProduct);
}

/**
 * The signed-in merchant's own shelves, **at any shop status** — the merchant
 * screens' read. `getProductsByVendor` is the shopper's view and answers a
 * pending shop with a 404, which is exactly the state a new merchant is in.
 */
export async function getMyProducts(): Promise<Product[]> {
  const page = await api<Page<any>>('/vendors/me/products', { query: { limit: ALL } });
  return page.items.map(toProduct);
}

/**
 * One of the signed-in merchant's own products, at any shop status — the
 * editor's read. `getProductById` is the shopper's and answers a pending
 * shop's products with a 404.
 */
export async function getMyProduct(id: ID): Promise<Product | undefined> {
  try {
    return toProduct(await api<any>(`/vendors/me/products/${id}`));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

/** What the API accepts for a product photo (`PRODUCT_IMAGE_TYPES`) — no HEIC, Android cannot draw it. */
export type ProductImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** The picker does not always report a type, so the extension decides. `null` is a format we refuse. */
export function productImageType(image: Pick<PickedImage, 'fileName' | 'mimeType'>): ProductImageType | null {
  const reported = image.mimeType?.toLowerCase();
  if (reported === 'image/jpeg' || reported === 'image/png' || reported === 'image/webp') return reported;
  if (reported === 'image/jpg') return 'image/jpeg';
  const ext = image.fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/**
 * Upload one product photo and return the Storage path to save as `imageUrl`.
 *
 * Same two hops as `uploadRegistrationDocument`: the API picks the path (under
 * this merchant's own shop) and signs a one-shot URL for it, then the bytes go
 * straight to Storage rather than through the API.
 */
export async function uploadProductImage(image: PickedImage, contentType: ProductImageType): Promise<string> {
  const { path, uploadUrl } = await api<{ path: string; uploadUrl: string }>('/vendors/me/products/image-upload', {
    method: 'POST',
    body: { contentType },
  });
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new File(image.uri),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Envoi de la photo impossible. Veuillez réessayer.');
  }
  return path;
}

export async function createProduct(input: Omit<Product, 'id'>): Promise<Product> {
  // `vendorId` is not sent: the API takes the shop from the token, and letting
  // a client name the shop it is stocking is how a product ends up on someone
  // else's page.
  return toProduct(await api<any>('/vendors/me/products', { method: 'POST', body: toBody(input) }));
}

export async function updateProduct(id: ID, patch: Partial<Product>): Promise<Product | undefined> {
  try {
    return toProduct(await api<any>(`/vendors/me/products/${id}`, { method: 'PATCH', body: toBody(patch) }));
  } catch (error) {
    // A 404 is "not yours, or not there" — the API answers alike so an id you
    // do not own cannot be probed for existence.
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

export async function deleteProduct(id: ID): Promise<void> {
  await api(`/vendors/me/products/${id}`, { method: 'DELETE' });
}

/** The app's `Product` → the API's body. Only the fields a merchant may set. */
function toBody(input: Partial<Product>): Record<string, unknown> {
  const { nutrition, ...rest } = input;
  return {
    ...(rest.categoryId !== undefined ? { categoryId: rest.categoryId } : {}),
    ...(rest.sectionId !== undefined ? { sectionId: rest.sectionId } : {}),
    ...(rest.name !== undefined ? { name: rest.name } : {}),
    ...(rest.description !== undefined ? { description: rest.description } : {}),
    ...(rest.priceCad !== undefined ? { priceCad: rest.priceCad } : {}),
    ...(rest.compareAtPriceCad !== undefined ? { compareAtPriceCad: rest.compareAtPriceCad } : {}),
    ...(rest.imageUrl !== undefined ? { imageUrl: rest.imageUrl } : {}),
    ...(rest.stockQty !== undefined ? { stockQty: rest.stockQty } : {}),
    ...(rest.isAvailable !== undefined ? { isAvailable: rest.isAvailable } : {}),
    ...(rest.tags !== undefined ? { tags: rest.tags } : {}),
    // Sent whole or as an explicit null. `undefined` means "not in this patch"
    // and must not clear a block the merchant did not touch.
    ...(nutrition !== undefined ? { nutrition: nutrition ?? null } : {}),
  };
}
