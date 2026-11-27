import { merchantApiGet, merchantApiPost, type Page } from './client';
import type { ID } from '../types';

/**
 * What a shop pays and what it offers: its promo codes and its monthly
 * subscription. Same `/vendors/me/*` endpoints as the mobile app.
 */

// ── promo codes ─────────────────────────────────────────────────────────────

export interface Coupon {
  id: ID;
  code: string;
  discountType: 'percentage' | 'fixed';
  /** A percent (15 → 15 %) or an amount in dollars, by `discountType`. */
  discountValue: number;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  /** Started, not ended, not used up — decided by the API, so the list and the checkout agree. */
  active: boolean;
}

export interface CouponInput {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  usageLimit?: number;
  /** How many days it stays valid from now. Omitted: no end date. */
  validDays?: number;
}

export function listMyCoupons(page: { offset: number; limit: number }): Promise<Page<Coupon>> {
  return merchantApiGet<Page<Coupon>>('/vendors/me/coupons', { paged: true, ...page });
}

export const createCoupon = (input: CouponInput) => merchantApiPost<Coupon>('/vendors/me/coupons', input);
/** Ends a code now. It stays in the list, as ended. */
export const deactivateCoupon = (id: ID) => merchantApiPost<Coupon>(`/vendors/me/coupons/${id}/deactivate`);

// ── the monthly subscription ────────────────────────────────────────────────

export interface Subscription {
  status: 'inactive' | 'active' | 'past_due' | 'canceled';
  /** What this shop is billed each month — or, before it subscribes, what subscribing costs. */
  priceCad: number;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  /** False when the server cannot reach Stripe: there is nothing to subscribe with. */
  available: boolean;
}

export const getMySubscription = () => merchantApiGet<Subscription>('/vendors/me/subscription');

/** The commission rate and monthly fee the platform has set — the same for every shop. */
export const getMyPlan = () => merchantApiGet<{ commissionRate: number; monthlySubscriptionCad: number }>('/vendors/me/plan');

/** Where Stripe sends the browser back to: this portal's own shop page. */
const backTo = (state: 'done' | 'cancel') => `${window.location.origin}/merchant/shop?abonnement=${state}`;

/** A link to Stripe's hosted checkout, where the merchant enters a card and the subscription starts. */
export async function startSubscriptionCheckout(): Promise<string> {
  const { url } = await merchantApiPost<{ url: string }>('/vendors/me/subscription/checkout', {
    successUrl: backTo('done'),
    cancelUrl: backTo('cancel'),
  });
  return url;
}

/** A link to Stripe's portal: change the card, read the invoices, cancel. */
export async function openSubscriptionPortal(): Promise<string> {
  const { url } = await merchantApiPost<{ url: string }>('/vendors/me/subscription/portal', { returnUrl: backTo('done') });
  return url;
}

// ── payouts ─────────────────────────────────────────────────────────────────

/** Where the shop stands with Stripe — asked of Stripe by the API each time. */
export interface PayoutStatus {
  /** The merchant finished Stripe's form. */
  onboarded: boolean;
  /** Stripe will actually send money to their bank. */
  payoutsEnabled: boolean;
}

export const getMyPayoutStatus = () => merchantApiGet<PayoutStatus>('/vendors/me/stripe/status');

export interface Payout {
  id: ID;
  amountCad: number;
  orderCount: number;
  /** `pending`: on its way. A payment Stripe refused is not listed — it went back into the balance. */
  status: 'pending' | 'paid';
  createdAt: string;
  paidAt: string | null;
}

/** What the next weekly payment carries, and the last few payments. */
export interface PayoutSummary {
  /** False until Sougouba has opened payouts to shops: balances add up, nothing is sent yet. */
  enabled: boolean;
  pendingCad: number;
  orderCount: number;
  /** `2026-12-04` — the coming Friday. */
  nextPayoutOn: string;
  payouts: Payout[];
}

export const getMyPayouts = () => merchantApiGet<PayoutSummary>('/vendors/me/payouts');

/**
 * A link to Stripe's form, where the merchant gives the bank account their
 * payments go to. Stripe sends the browser back to the statements page —
 * `refresh` is where it sends a link that expired before it was finished.
 */
export async function startPayoutOnboarding(): Promise<string> {
  const back = (state: 'done' | 'refresh') => `${window.location.origin}/merchant/statements?versements=${state}`;
  const { url } = await merchantApiPost<{ url: string }>('/vendors/me/stripe/onboard', {
    returnUrl: back('done'),
    refreshUrl: back('refresh'),
  });
  return url;
}
