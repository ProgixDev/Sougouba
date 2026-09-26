import { api } from '../http';
import type { ID, LoyaltyTransaction, Order } from '../types';

/**
 * Points Sougouba, read from the ledger.
 *
 * ⚠️ **Every write in this module is gone.** Crediting a delivered order,
 * debiting a redemption and reversing a refund are not things a client may do —
 * each has to land in the same transaction as the event that causes it, or a
 * shopper loses points on an order that rolled back, or keeps points for an
 * order that was refunded. All three now live in database functions the API
 * calls (`order_place`, `loyalty_credit_delivered`, `order_refund`). The stubs
 * at the bottom throw rather than silently doing nothing.
 */

/** One customer's ledger fits in a page; the points screen shows it whole. */
const ALL = 100;

/**
 * ⚠️ The `customerId` argument is ignored on every read here. The API answers
 * from the token — `/me/loyalty/*` — and a shopper asking for a stranger's
 * balance is not a request that should have an answer. Kept in the signatures
 * so the points screens need no edit.
 */
/** ⚠️ Returns a bare array, not a `Page` — unlike every other list on this API. */
export async function getHistory(_customerId: ID): Promise<LoyaltyTransaction[]> {
  return api<LoyaltyTransaction[]>('/me/loyalty/history', { query: { limit: ALL } });
}

/**
 * The balance in points.
 *
 * ⚠️ The endpoint answers `{ points, valueCad, pointsPerCadRedeemed,
 * maxRedemptionShare }`, not a bare number — it sends the conversion rate along
 * so the app does not hold a rate an administrator can change. This returns just
 * the points to keep the mock's signature; `getBalanceDetail` is there for the
 * checkout screen, which needs the cap and the rate to show what is redeemable.
 */
export async function getBalance(_customerId: ID): Promise<number> {
  const { points } = await getBalanceDetail();
  return points;
}

export interface BalanceDetail {
  points: number;
  /** What the points are worth today, at the current rate. */
  valueCad: number;
  pointsPerCadRedeemed: number;
  /** The brief's cap — "Maximum 20 % du sous-total". */
  maxRedemptionShare: number;
}

export async function getBalanceDetail(): Promise<BalanceDetail> {
  return api<BalanceDetail>('/me/loyalty/balance');
}

/**
 * ⚠️ Filters the history client-side — there is no per-order endpoint, and one
 * customer's ledger is tens of rows. A route for this would exist only to save
 * a filter over data the caller has usually already fetched.
 */
export async function getTransactionForOrder(orderId: ID): Promise<LoyaltyTransaction | undefined> {
  const history = await getHistory('');
  return history.find((t) => t.orderId === orderId && t.reason === 'order_delivered');
}

export interface ReferralStats {
  code: string;
  referredCount: number;
  pointsFromReferrals: number;
}

export async function getReferralStats(_customerId: ID): Promise<ReferralStats> {
  return api<ReferralStats>('/me/loyalty/referral-stats');
}

// ── writes: all server-side now ─────────────────────────────────────────────

const SERVER_OWNED =
  'Loyalty movements are written by the server, inside the transaction that causes them. ' +
  'See order_place, loyalty_credit_delivered and order_refund in the API.';

/**
 * Was called by the app when an order reached `delivered`. The API does it
 * inside `delivery_complete` now — which is also the only place that knows the
 * delivery actually happened, rather than the place that heard it had.
 */
export async function creditForDeliveredOrder(
  _order: Order,
  _opts: { isFirstDeliveredOrder: boolean }
): Promise<void> {
  throw new Error(SERVER_OWNED);
}

/** Was called alongside `createOrder`. It is *inside* `order_place` now, which is the point. */
export async function debitForRedemption(_customerId: ID, _points: number, _orderId: ID): Promise<void> {
  throw new Error(SERVER_OWNED);
}

/** Was waiting for a refund flow to exist. It exists, and it calls this itself. */
export async function reverseForOrder(_orderId: ID): Promise<void> {
  throw new Error(SERVER_OWNED);
}
