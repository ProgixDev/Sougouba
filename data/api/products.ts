import { api, ApiError, type Page } from '../http';
import type { ID, Product } from '../types';
import { toProduct } from './mappers';

/**
 * The API's own ceiling (`MAX_PAGE_SIZE`), and it **rejects** a bigger one
 * rather than clamping — a `?limit=200` is a 400, not 100 rows.
 */
const ALL = 100;

/**
 * ⚠️ **The reads and the writes see different catalogues, on purpose.**
 *
 * Every read below is the *shopper's* view — approved shops only, enforced by
 * the API. The three writes are the *merchant's* own, and go through
 * `/vendors/me/products`, which is scoped to their shop at any status so they
 * can stock it while the file is still in review.
 */

/**
 * The whole browsable catalogue.
 *
 * ⚠️ **This is a stopgap and it is N+1.** There is no "all products" endpoint,
 * deliberately — `/products/search` requires a term, because shipping the whole
 * catalogue to the phone to filter it there is precisely what the API was built
 * not to do (docs/BACKEND-BUILD-PHASES.md, Phase 2). So this walks the approved
 * shops and asks each for its shelves: ten requests today, one per shop, growing
 * with the marketplace.
 *
 * It exists because four screens still ask for the catalogue as one array —
 * home, search, favourites and the cart — and each wants something narrower:
 *
 *   - **home** wants a page of featured products → a paginated browse endpoint
 *   - **search** should call `searchProducts(q)` as the shopper types, not prefetch
 *   - **favourites** and **cart** want *specific ids* → `GET /products?ids=…`
 *
 * None of those exists yet. Replacing this with them is the next real piece of
 * catalogue work; until then the screens keep working and the cost is visible
 * here rather than hidden in a slow home screen nobody can explain.
 */
export async function getProducts(): Promise<Product[]> {
  const vendors = await api<Page<{ id: string }>>('/vendors', {
    anonymous: true,
    query: { limit: ALL },
  });
  const shelves = await Promise.all(vendors.items.map((v) => getProductsByVendor(v.id)));
  return shelves.flat();
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
 * ⚠️ Same shape as `getProducts` and for the same reason: `/products/search`
 * needs a term, so a category browse cannot go through it. Filtered here off
 * the walk above.
 */
export async function getProductsByCategory(categoryId: ID): Promise<Product[]> {
  const all = await getProducts();
  return all.filter((p) => p.categoryId === categoryId);
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
