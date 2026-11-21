import { apiGet, apiGetOrNull, type Page, type PageQuery } from './client';
import type { AdminOrderDetail, AdminOrderListItem, ID, OrderStatus } from '../types';

export interface OrderFilters {
  status?: OrderStatus;
  vendorId?: ID;
  search?: string;
}

/**
 * Orders across the whole platform.
 *
 * ⚠️ **Filtering happens on the server now.** The mock ignored these arguments
 * — the page called `listOrders()` with nothing and re-filtered the full array
 * in a `useMemo`. That worked because every order was already in the browser.
 * With a paginated endpoint it would silently filter one page and present the
 * result as the whole answer, so the filters must be passed down.
 */
export async function listOrders(filters: OrderFilters, page: PageQuery): Promise<Page<AdminOrderListItem>> {
  return apiGet<Page<AdminOrderListItem>>('/admin/orders', {
    status: filters.status,
    vendorId: filters.vendorId,
    search: filters.search?.trim() || undefined,
    ...page,
  });
}

/** Null for an id that does not exist — a detail page renders "introuvable", not an error. */
export async function getOrder(id: ID): Promise<AdminOrderDetail | null> {
  return apiGetOrNull<AdminOrderDetail>(`/admin/orders/${id}`);
}
