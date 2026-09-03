import { apiGet, apiGetOrNull, apiPatch, type Page } from './client';
import type { AdminDispute, AdminDisputeStatus, ID } from '../types';

/**
 * Disputes are keyed by their **order id**, not by an id of their own — the
 * `disputes` table's primary key is `order_id`, because a shopper reports what
 * was in the bag once per order. The mock invented a separate `id`; every
 * function here takes the order id instead.
 */
export async function listDisputes(status?: AdminDisputeStatus, limit = 100): Promise<AdminDispute[]> {
  const page = await apiGet<Page<AdminDispute>>('/admin/disputes', { status, limit });
  return page.items;
}

export async function getDispute(orderId: ID): Promise<AdminDispute | null> {
  return apiGetOrNull<AdminDispute>(`/admin/disputes/${orderId}`);
}

/**
 * Settle a dispute.
 *
 * `resolved` means the shopper was right, in whole or in part; `rejected` means
 * the order stands. Both are terminal and both require a note of at least five
 * characters, enforced server-side.
 *
 * `refundAmountCad` is optional, and the API refuses it on a `rejected`
 * outcome. Omitting it is a real decision, not an oversight: the complaint may
 * be upheld without money moving, or the merchant may have made it right
 * directly. When present the refund runs **first** — if Stripe refuses, the
 * dispute stays open and can be retried, whereas a dispute marked
 * resolved-with-refund whose refund never happened has already told the shopper
 * they were paid.
 */
export async function resolveDispute(
  orderId: ID,
  resolutionNote: string,
  outcome: 'resolved' | 'rejected',
  refundAmountCad?: number
): Promise<void> {
  await apiPatch(`/admin/disputes/${orderId}/resolve`, {
    outcome,
    note: resolutionNote,
    ...(outcome === 'resolved' && refundAmountCad !== undefined ? { refundAmountCad } : {}),
  });
}
