import { apiGet, apiGetOrNull, apiPost, type Page, type PageQuery } from './client';
import type { AdminCourierDetail, AdminCourierListItem, AdminCourierStatus, ID } from '../types';

/**
 * The courier approval queue — the same shape as `vendors.ts`, and the same two
 * corrections: `rejected` is its own terminal state (the mock conflated it with
 * `suspended`), and the reason lives on the row as `statusReason` rather than in
 * a separate localStorage notes map.
 */
/** One page, filtered, searched (name or city) and sorted by the API. */
export async function listCouriers(
  filters: { status?: AdminCourierStatus; search?: string },
  page: PageQuery
): Promise<Page<AdminCourierListItem>> {
  return apiGet<Page<AdminCourierListItem>>('/admin/couriers', {
    status: filters.status,
    search: filters.search?.trim() || undefined,
    ...page,
  });
}

export async function getCourier(id: ID): Promise<AdminCourierDetail | null> {
  return apiGetOrNull<AdminCourierDetail>(`/admin/couriers/${id}`);
}

export async function approveCourier(id: ID): Promise<void> {
  await apiPost(`/admin/couriers/${id}/approve`, {});
}

/** Terminal — the API will not approve a rejected file afterwards. */
export async function rejectCourier(id: ID, reason: string): Promise<void> {
  await apiPost(`/admin/couriers/${id}/reject`, { reason });
}

/**
 * Reversible. Also forces the courier offline in the same write, so a suspended
 * courier cannot keep receiving dispatch offers.
 */
export async function suspendCourier(id: ID, reason: string): Promise<void> {
  await apiPost(`/admin/couriers/${id}/suspend`, { reason });
}
