import { apiGet, apiGetOrNull, apiPatch, type Page } from './client';
import type { AdminCourierIssue, CourierIssueStatus, ID } from '../types';

/** Keyed by order id, like disputes — `courier_issues`' primary key is `order_id`. */
export async function listCourierIssues(status?: CourierIssueStatus, limit = 100): Promise<AdminCourierIssue[]> {
  const page = await apiGet<Page<AdminCourierIssue>>('/admin/courier-issues', { status, limit });
  return page.items;
}

export async function getCourierIssue(orderId: ID): Promise<AdminCourierIssue | null> {
  return apiGetOrNull<AdminCourierIssue>(`/admin/courier-issues/${orderId}`);
}

/**
 * Close a courier issue.
 *
 * ⚠️ **`note` is now required** (minimum 5 characters, enforced server-side).
 * The mock's version took no argument at all — a click flipped the status and
 * recorded nothing about why. The note is appended to the issue's message, so
 * whoever reads it later can see what was actually done about a courier
 * reporting a locked building.
 *
 * The order's own status is deliberately untouched: resolving the report is not
 * the same as the delivery having succeeded.
 */
export async function resolveCourierIssue(orderId: ID, note: string): Promise<void> {
  await apiPatch(`/admin/courier-issues/${orderId}/resolve`, { note });
}
