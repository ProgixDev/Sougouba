import { apiGet, apiPost, type Page } from './client';

export interface AdminReview {
  /** A review is keyed by its order — one review per order. */
  orderId: string;
  vendor: { id: string; name: string } | null;
  customerName: string | null;
  courierName: string | null;
  vendorRating: number;
  courierRating: number | null;
  comment: string | null;
  createdAt: string;
  /** The words are hidden from the merchant; the stars still count. */
  commentHiddenAt: string | null;
  /** The review no longer counts in any average, and the merchant no longer sees it. */
  removedAt: string | null;
  moderationReason: string | null;
}

export type ReviewFilter = 'all' | 'with_comment' | 'low' | 'hidden' | 'removed';
export type ReviewAction = 'hide_comment' | 'show_comment' | 'remove' | 'restore';

export interface AdminCoupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  vendor: { id: string; name: string } | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
  active: boolean;
}

export interface AdminProduct {
  id: string;
  name: string;
  priceCad: number;
  imageUrl: string;
  isAvailable: boolean;
  stockQty: number;
  vendor: { id: string; name: string; status: string } | null;
  createdAt: string;
  /** Hidden from every shopper read by the back office. */
  hiddenAt: string | null;
  hiddenReason: string | null;
}

export async function listReviews(filter: ReviewFilter, offset = 0, limit = 50): Promise<Page<AdminReview>> {
  return apiGet<Page<AdminReview>>('/admin/reviews', { filter, offset, limit });
}

/** Hiding a comment or removing a review needs a reason; undoing either does not. */
export async function moderateReview(orderId: string, action: ReviewAction, reason?: string): Promise<void> {
  await apiPost(`/admin/reviews/${orderId}/moderate`, { action, ...(reason ? { reason } : {}) });
}

export async function listCoupons(
  status: 'active' | 'ended' | 'all',
  search?: string,
  offset = 0,
  limit = 50
): Promise<Page<AdminCoupon>> {
  return apiGet<Page<AdminCoupon>>('/admin/coupons', { status, search, offset, limit });
}

/** Ends a merchant's code now. The reason lands in the audit log. */
export async function deactivateCoupon(id: string, reason: string): Promise<void> {
  await apiPost(`/admin/coupons/${id}/deactivate`, { reason });
}

export async function listProducts(
  hidden: 'all' | 'only',
  search?: string,
  offset = 0,
  limit = 50
): Promise<Page<AdminProduct>> {
  return apiGet<Page<AdminProduct>>('/admin/products', { hidden, search, offset, limit });
}

export async function hideProduct(id: string, reason: string): Promise<void> {
  await apiPost(`/admin/products/${id}/hide`, { reason });
}

export async function unhideProduct(id: string): Promise<void> {
  await apiPost(`/admin/products/${id}/unhide`, {});
}
