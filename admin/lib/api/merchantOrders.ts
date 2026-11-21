import type { ID, Order, OrderStatus } from '../types';
import { ApiError, merchantApiGet, type Page } from './client';

/**
 * Order reads for the **merchant portal**, from the API's merchant endpoints.
 *
 * `/vendors/me/orders` resolves the shop from the caller's own token, so there
 * is no `vendorId` to pass and none a merchant could swap: another shop's order
 * id answers 404 on the server. (This used to be a localStorage mock that
 * filtered by `vendorId` in the browser.)
 */

/**
 * One page of the shop's orders, newest first, filtered by the API. The search
 * matches the customer's name, or a whole order id.
 */
export async function listMerchantOrders(
  filters: { status?: OrderStatus; search?: string },
  page: { offset: number; limit: number }
): Promise<Page<Order>> {
  return merchantApiGet<Page<Order>>('/vendors/me/orders', {
    status: filters.status,
    search: filters.search?.trim() || undefined,
    offset: page.offset,
    limit: page.limit,
  });
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
