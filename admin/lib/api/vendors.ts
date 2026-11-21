import { apiGet, apiGetOrNull, apiPost, type Page, type PageQuery } from './client';
import type { AdminVendorDetail, AdminVendorListItem, AdminVendorStatus, ID } from '../types';

/**
 * The merchant approval queue.
 *
 * Two behaviours changed with the real API, both of which the mock got wrong:
 *
 * - **`rejected` is a distinct state.** The mock's `rejectVendor` set
 *   `status: 'suspended'`, because `data/types.ts` has no `rejected` — the
 *   mobile app has no back office and never needed the distinction. They are
 *   not the same decision: rejection is terminal (a rejected file cannot later
 *   be approved), suspension is reversible.
 * - **The rejection reason is a column, not a side table.** `getVendorNote`
 *   and the `sougouba-admin-vendor-notes` localStorage map are gone;
 *   `statusReason` comes back on the row.
 */
/** One page, filtered, searched (name or city) and sorted by the API. */
export async function listVendors(
  filters: { status?: AdminVendorStatus; search?: string },
  page: PageQuery
): Promise<Page<AdminVendorListItem>> {
  return apiGet<Page<AdminVendorListItem>>('/admin/vendors', {
    status: filters.status,
    search: filters.search?.trim() || undefined,
    ...page,
  });
}

export async function getVendor(id: ID): Promise<AdminVendorDetail | null> {
  return apiGetOrNull<AdminVendorDetail>(`/admin/vendors/${id}`);
}

/** No reason required — an approval needs no explanation, unlike the two below. */
export async function approveVendor(id: ID): Promise<void> {
  await apiPost(`/admin/vendors/${id}/approve`, {});
}

/**
 * Terminal. The API refuses to approve a rejected file afterwards, so this is
 * the decision that cannot be walked back.
 *
 * `reason` is mandatory server-side (minimum 5 characters) — a file closed
 * with no reasoning is one nobody can defend later.
 */
export async function rejectVendor(id: ID, reason: string): Promise<void> {
  await apiPost(`/admin/vendors/${id}/reject`, { reason });
}

/** Reversible: a suspended shop can be approved again once the cause is resolved. */
export async function suspendVendor(id: ID, reason: string): Promise<void> {
  await apiPost(`/admin/vendors/${id}/suspend`, { reason });
}
