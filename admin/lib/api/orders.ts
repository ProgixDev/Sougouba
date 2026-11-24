import { apiGet, apiGetOrNull, apiPost, apiUrl, type Page, type PageQuery } from './client';
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

/**
 * A link to the order's receipt PDF — the same document the shopper opens from
 * the app.
 *
 * A link rather than the file because it opens in a new tab, and a tab sends no
 * token: the API signs a URL that names this one order and stops working after
 * a few minutes. Ask for a fresh one on every click rather than keeping it.
 */
export async function getReceiptUrl(id: ID): Promise<string> {
  const { path } = await apiGet<{ path: string; expiresAt: string }>(`/admin/orders/${id}/receipt-link`);
  return apiUrl(path);
}

/**
 * Email the receipt to the shopper again. Audited (`order.receipt_resend`), and
 * refused with a 429 if it was already sent within the last minute.
 */
export async function resendReceipt(id: ID): Promise<{ sentAt: string }> {
  return apiPost<{ sentAt: string }>(`/admin/orders/${id}/receipt-email`);
}

/** What cancelling did: whether the money went back, and the courier it released. */
export interface CancellationOutcome {
  /** `failed` means the order is cancelled but Stripe did not send the refund — it has to be sent by hand. */
  refund: 'refunded' | 'not_needed' | 'failed';
  refundAmountCad: number | null;
  courierId: ID | null;
}

/**
 * Cancel an order that has not been delivered, with a reason. The shopper is
 * refunded in full, stock and points come back, and a courier carrying it is
 * released. Audited. Refused (409) on a delivered or already cancelled order.
 */
export async function cancelOrder(id: ID, reason: string): Promise<CancellationOutcome> {
  return apiPost<CancellationOutcome>(`/admin/orders/${id}/cancel`, { reason });
}

/** A packed order no courier has taken. */
export interface StalledOrder {
  orderId: ID;
  vendorId: ID;
  vendorName: string;
  customerName: string | null;
  totalCad: number;
  waitingSince: string;
  waitingMin: number;
  alerted: boolean;
  /** Couriers offered the run so far. 0 means nobody was even in range. */
  offers: number;
}

/**
 * Orders waiting for a courier past the alert delay, oldest first, with the two
 * delays from the settings (`cancelAfterMin` 0 = never cancelled automatically).
 * Empty against an API or a database that does not have the feature yet.
 */
export async function listOrdersWaitingForCourier(): Promise<{ alertAfterMin: number; cancelAfterMin: number; orders: StalledOrder[] }> {
  return apiGet('/admin/orders/waiting-for-courier');
}
