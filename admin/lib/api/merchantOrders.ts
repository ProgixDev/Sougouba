import type { ID, Order } from '../types';
import { ApiError, merchantApiGet, type Page } from './client';

/**
 * Order reads for the **merchant portal**, from the API's merchant endpoints.
 *
 * `/vendors/me/orders` resolves the shop from the caller's own token, so there
 * is no `vendorId` to pass and none a merchant could swap: another shop's order
 * id answers 404 on the server. (This used to be a localStorage mock that
 * filtered by `vendorId` in the browser.)
 */

/** The API's own page ceiling. A shop with more orders than this needs paging, not a bigger number. */
const ALL = 100;

/** Newest first, as the API returns them. */
export async function listMerchantOrders(): Promise<Order[]> {
  const page = await merchantApiGet<Page<Order>>('/vendors/me/orders', { limit: ALL });
  return page.items;
}

/** `undefined` for an order that is not this shop's — or not there at all; the API answers both alike. */
export async function getMerchantOrder(id: ID): Promise<Order | undefined> {
  try {
    return await merchantApiGet<Order>(`/vendors/me/orders/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return undefined;
    throw error;
  }
}
