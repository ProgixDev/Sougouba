import {
  isTransactionLive,
  pointsEarnedFor,
  pointsExpiryFrom,
  qualifiesForReferralReward,
  REFERRAL_REWARD_POINTS,
} from '../loyalty';
import type { ID, LoyaltyReason, LoyaltyTransaction, Order } from '../types';
import { delay } from '../utils/delay';
import { generateId } from '../utils/ids';
import { createPersistedTable } from '../utils/persistedTable';
import { mockGetUserById } from './auth';

/**
 * The mock "backend"'s Points Sougouba ledger.
 *
 * Unlike every other table in `data/api/`, this one seeds empty rather than
 * from a hand-written or generated history: a shopper's balance is entirely a
 * function of the orders they already have, so it is backfilled from those the
 * first time it is needed (`ordersApi.ensureLoyaltyBackfill`) rather than
 * authored twice.
 */
const table = createPersistedTable<LoyaltyTransaction>('sougouba-mock-loyalty-v1', []);

function snapshot(tx: LoyaltyTransaction): LoyaltyTransaction {
  return { ...tx };
}

async function record(
  customerId: ID,
  points: number,
  reason: LoyaltyReason,
  opts: { orderId?: ID; expiresAt?: string; at?: string } = {}
): Promise<LoyaltyTransaction> {
  const tx: LoyaltyTransaction = {
    id: generateId('lpt'),
    customerId,
    points,
    reason,
    createdAt: opts.at ?? new Date().toISOString(),
    ...(opts.orderId ? { orderId: opts.orderId } : {}),
    ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
  };
  await table.add(tx);
  return snapshot(tx);
}

export async function getHistory(customerId: ID): Promise<LoyaltyTransaction[]> {
  await table.ready;
  await delay();
  return table
    .rows()
    .filter((t) => t.customerId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(snapshot);
}

/** Sum of every still-live transaction — an expired earn simply stops counting, the same way a courier's live position is never stored, only recomputed. */
export async function getBalance(customerId: ID): Promise<number> {
  await table.ready;
  const now = Date.now();
  return table
    .rows()
    .filter((t) => t.customerId === customerId && isTransactionLive(t, now))
    .reduce((sum, t) => sum + t.points, 0);
}

/** The exact points a specific delivery earned — what the "commande livrée" notification reads out. */
export async function getTransactionForOrder(orderId: ID): Promise<LoyaltyTransaction | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = table.rows().find((t) => t.orderId === orderId && t.reason === 'order_delivered');
  return found ? snapshot(found) : undefined;
}

export interface ReferralStats {
  referredCount: number;
  pointsFromReferrals: number;
}

/** How this account's own referral code has paid off, read straight off the ledger rather than a separate counter. */
export async function getReferralStats(customerId: ID): Promise<ReferralStats> {
  await table.ready;
  await delay();
  const rows = table.rows().filter((t) => t.customerId === customerId && t.reason === 'referral_referrer');
  return { referredCount: rows.length, pointsFromReferrals: rows.reduce((sum, t) => sum + t.points, 0) };
}

/**
 * Credit a delivered order — the only moment the brief allows points to be
 * earned ("Crédit des points — Après livraison réussie"). Idempotent by
 * `orderId`, so the same call is safe from the live delivery flow
 * (`ordersApi.completeDelivery`) and from `ordersApi.ensureLoyaltyBackfill`,
 * which replays every order an account already had the first time its balance
 * is read.
 *
 * `isFirstDeliveredOrder` is the caller's to answer, not this function's — it
 * already has the order table in scope, and asking this module to import
 * `data/api/orders.ts` in order to answer it would be a mock "backend"
 * importing its own caller.
 */
export async function creditForDeliveredOrder(
  order: Order,
  opts: { isFirstDeliveredOrder: boolean }
): Promise<void> {
  await table.ready;
  if (table.rows().some((t) => t.orderId === order.id && t.reason === 'order_delivered')) return;

  const at = order.delivery?.deliveredAt ?? order.createdAt;
  const points = pointsEarnedFor(order.subtotalCad);
  if (points > 0) {
    await record(order.customerId, points, 'order_delivered', {
      orderId: order.id,
      expiresAt: pointsExpiryFrom(at),
      at,
    });
  }

  // Referral reward: only on the customer's first delivered order, only past
  // the brief's 60 $ floor, and only once per new client — see
  // `data/loyalty.ts`. The brief's other anti-fraud gate, a verified phone
  // number, waits on real phone verification landing with the backend; the
  // mock cannot honestly enforce a check it has no way to perform.
  if (!opts.isFirstDeliveredOrder || !qualifiesForReferralReward(order)) return;
  const referred = await mockGetUserById(order.customerId);
  if (!referred?.referredBy) return;
  if (table.rows().some((t) => t.customerId === order.customerId && t.reason === 'referral_referred')) return;

  await record(order.customerId, REFERRAL_REWARD_POINTS, 'referral_referred', { orderId: order.id, at });
  await record(referred.referredBy, REFERRAL_REWARD_POINTS, 'referral_referrer', { orderId: order.id, at });
}

/**
 * Spend points at checkout.
 *
 * `points` is trusted here the way nothing else about an order is: by the time
 * this runs, `ordersApi.createOrder` has already clamped the shopper's request
 * against their real balance and the 20 % cap (`maxRedeemablePoints`), so this
 * only has to write the debit down. Idempotent by `orderId` for the same
 * reason every other write here is.
 */
export async function debitForRedemption(customerId: ID, points: number, orderId: ID): Promise<void> {
  if (points <= 0) return;
  await table.ready;
  if (table.rows().some((t) => t.orderId === orderId && t.reason === 'redeemed')) return;
  await record(customerId, -points, 'redeemed', { orderId });
}

/**
 * The brief's remaining anti-fraud rule: points come back off a refunded or
 * cancelled order. Nothing in the app can refund or cancel an order that has
 * already been *delivered* — cancellation only exists earlier in the pipeline,
 * before anything was ever credited — so no screen calls this today. It exists
 * so that whichever flow eventually does has a matching reversal to reach for,
 * the same way `authApi.mockAttachVendor` sits waiting on an administration
 * back office that does not exist yet either.
 */
export async function reverseForOrder(orderId: ID): Promise<void> {
  await table.ready;
  const earned = table.rows().find((t) => t.orderId === orderId && t.reason === 'order_delivered');
  if (!earned) return;
  if (table.rows().some((t) => t.orderId === orderId && t.reason === 'order_refunded')) return;
  await record(earned.customerId, -earned.points, 'order_refunded', { orderId });
}
