import { api, type Page } from '../http';
import type { Coupon, ID } from '../types';

/**
 * The merchant's own promo codes — `/vendors/me/coupons`.
 *
 * The shop is resolved from the token on every call, so nothing here takes a
 * vendor id. There is no edit and no delete on purpose: a printed code keeps
 * the value it was printed with, and is ended rather than removed.
 */

export interface CreateCouponInput {
  code: string;
  discountType: Coupon['discountType'];
  discountValue: number;
  /** Total uses across all shoppers. Omitted = unlimited. */
  usageLimit?: number;
  /** Omitted = no expiry. */
  validDays?: number;
}

/** ⚠️ A bare array, newest first — a shop's codes are a handful, not a page. */
export async function getMyCoupons(): Promise<Coupon[]> {
  return api<Coupon[]>('/vendors/me/coupons');
}

/** Throws an `ApiError` whose message is the sentence to show — "Ce code est déjà utilisé", a field rule. */
export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  return api<Coupon>('/vendors/me/coupons', { method: 'POST', body: input });
}

/** Ends the code now. Safe to call twice. */
export async function deactivateCoupon(id: ID): Promise<Coupon> {
  return api<Coupon>(`/vendors/me/coupons/${id}/deactivate`, { method: 'POST' });
}

/** One page of the shop's promo codes, newest first, with its total. */
export async function getMyCouponsPage(offset: number, limit: number): Promise<Page<Coupon>> {
  return api<Page<Coupon>>('/vendors/me/coupons', { query: { paged: true, offset, limit } });
}
