import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import { referralCodeFor } from '../common/loyalty/referral.js';
import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { pointsEarnedFor, pointsExpiryFrom, qualifiesForReferralReward } from './loyalty-rules.js';
import { SettingsService } from './settings.service.js';

/**
 * The Points Sougouba ledger.
 *
 * Append-only: every row is a signed movement, and a balance is their sum. No
 * stored total anywhere — a balance column would be a second source of truth
 * that a half-failed write could leave disagreeing with the movements that
 * produced it, and reconciling the two after the fact is guesswork.
 *
 * Every write is **idempotent on `(order_id, reason)`**, enforced in the
 * database by `loyalty_one_movement_per_order_reason` rather than by a
 * check-then-insert that two concurrent callers both pass. This matters more
 * here than anywhere else in the codebase: crediting a delivery twice is
 * inventing money, and the mock's own credit path was already called from two
 * places (the live delivery flow and a backfill that replays history).
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService
  ) {}

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * Sum of every still-live movement.
   *
   * An expired earn simply stops counting — it is not deleted and no
   * compensating row is written, so the history still shows what was earned and
   * when. Redemptions and reversals carry no expiry, so they always count:
   * expiring a *debit* would hand points back for something already spent.
   */
  async balance(customerId: string): Promise<number> {
    // Summed here rather than in SQL. The rows are one customer's ledger — tens,
    // not thousands — and PostgREST has no `sum()`; an RPC for an addition this
    // small would be a function to maintain for no gain. `or(expires_at.is.null,
    // expires_at.gt.now)` cannot be expressed against the database's own clock
    // either, so the cutoff is this process's — a few milliseconds of skew on a
    // points expiry that is measured in months.
    const rows = await unwrap<{ points: number; expiresAt: string | null }[]>(
      this.db
        .from('loyalty_transactions')
        .select('points, expiresAt:expires_at')
        .eq('customer_id', customerId)
    );
    const now = Date.now();
    // An expired earn simply stops counting. Redemptions and reversals carry no
    // expiry, so they always count: expiring a *debit* would hand points back
    // for something already spent.
    return rows.reduce(
      (sum, r) => (r.expiresAt === null || Date.parse(r.expiresAt) > now ? sum + r.points : sum),
      0
    );
  }

  /** Newest first, matching the points screen. Includes expired rows — the history is a record, not a balance. */
  async history(customerId: string, limit: number, offset: number, paged = false, orderId?: string) {
    let q = this.db.from('loyalty_transactions').select('*', { count: 'exact' }).eq('customer_id', customerId);
    if (orderId) q = q.eq('order_id', orderId);
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException('Database request failed');
    const items = camelize<unknown[]>(data ?? []);
    // The bare array is what builds already installed expect; `paged` opts in.
    return paged ? { items, total: count ?? 0, limit, offset } : items;
  }

  /** How this account's own referral code has paid off — read off the ledger rather than a separate counter. */
  async referralStats(customerId: string) {
    const rows = await unwrap<{ points: number }[]>(
      this.db
        .from('loyalty_transactions')
        .select('points')
        .eq('customer_id', customerId)
        .eq('reason', 'referral_referrer')
    );

    return {
      code: referralCodeFor(customerId),
      referredCount: rows.length,
      pointsFromReferrals: rows.reduce((sum, r) => sum + r.points, 0),
    };
  }

  // ── writes ────────────────────────────────────────────────────────────────

  /**
   * Insert one movement, or do nothing if that order already has one for this
   * reason. Returns whether it actually wrote.
   *
   * `onConflictDoNothing` rather than a preceding `SELECT`: the check-then-act
   * version is a race two concurrent deliveries of the same order would both
   * win. Rows with a null `order_id` (none today) would not be covered by the
   * partial index, which is why every caller here passes one.
   */
  /**
   * ⚠️ No transaction handle any more. This writes a movement that stands
   * alone — the delivery credit and its referral reward moved into
   * `loyalty_credit_delivered`, and the redemption debit into `order_place`,
   * precisely because those must not be separate requests.
   */
  private async record(values: {
    customerId: string;
    points: number;
    reason: 'order_delivered' | 'referral_referrer' | 'referral_referred' | 'redeemed' | 'order_refunded';
    orderId: string;
    expiresAt?: Date | null;
    createdAt?: Date;
  }): Promise<boolean> {
    const { data, error } = await this.db
      .from('loyalty_transactions')
      .insert({
        customer_id: values.customerId,
        points: values.points,
        reason: values.reason,
        order_id: values.orderId,
        expires_at: values.expiresAt?.toISOString() ?? null,
        ...(values.createdAt ? { created_at: values.createdAt.toISOString() } : {}),
      })
      .select('id');
    // A duplicate is the "already recorded" answer, not a failure — the shape
    // `onConflictDoNothing().returning()` gave by row count.
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return false;
      throw unexpectedDbError(error);
    }
    return (data?.length ?? 0) > 0;
  }

  /**
   * Spend points at checkout.
   *
   * `points` is trusted here the way nothing else about an order is: by the
   * time this runs `OrdersService.place` has already clamped the request
   * against the real balance and the share cap (`maxRedeemablePoints`), so this
   * only writes the debit down. Called inside the order's own transaction, so a
   * failed order never leaves a debit behind.
   */
  async debitForRedemption(customerId: string, points: number, orderId: string): Promise<void> {
    if (points <= 0) return;
    // No expiry on a debit — see `balance`.
    await this.record({ customerId, points: -points, reason: 'redeemed', orderId });
  }

  /**
   * Credit a delivered order — the only moment the brief allows points to be
   * earned ("Crédit des points — Après livraison réussie").
   *
   * Called from Phase 5's `POST /courier/:orderId/complete`, which is the one
   * place an order actually becomes delivered. Until that endpoint exists
   * nothing reaches this, exactly as `reverseForOrder` sat unwired in the mock.
   *
   * The referral reward rides along because it is conditioned on the same
   * event: the brief pays both sides only once the referred friend's *first*
   * order has actually been delivered and cleared the floor — not when they
   * sign up, and not when they place it.
   */
  async creditForDeliveredOrder(orderId: string, deliveredAt: Date = new Date()): Promise<void> {
    const rates = await this.settings.loyaltyRates();

    const order = await unwrap<{
      id: string;
      customerId: string;
      subtotalCad: string;
      status: string;
      createdAt: string;
    } | null>(
      this.db
        .from('orders')
        .select('id, customerId:customer_id, subtotalCad:subtotal_cad, status, createdAt:created_at')
        .eq('id', orderId)
        .maybeSingle()
    );
    if (!order) return;
    if (order.status !== 'delivered') {
      // Defence in depth: the caller is the completion endpoint, but crediting
      // an order that is not delivered would be paying for work not done.
      this.logger.warn(`Refused to credit order ${orderId}: status is "${order.status}", not "delivered"`);
      return;
    }

    const subtotalCad = Number(order.subtotalCad);
    const points = pointsEarnedFor(subtotalCad, rates, deliveredAt);
    const expiresAt = pointsExpiryFrom(deliveredAt, rates);

    // The credit and the referral reward it can trigger, in one transaction —
    // both are conditioned on the same event, and the "first delivered order"
    // count has to be read inside it. See `loyalty_credit_delivered`.
    const outcome = await unwrapRpc<string>(
      this.db.rpc('loyalty_credit_delivered', {
        p_order_id: order.id,
        p_customer_id: order.customerId,
        p_points: points,
        p_expires_at: (expiresAt?.toISOString() ?? null) as string,
        p_created_at: deliveredAt.toISOString(),
        p_referral_points: rates.referralRewardPoints,
        p_qualifies_for_referral: qualifiesForReferralReward(subtotalCad, rates),
      })
    );

    if (outcome === 'referral') {
      // ⚠️ The brief's other anti-fraud gate — a **verified phone number** — is
      // still not enforced. Without it, one person with two email addresses can
      // refer themselves and collect both sides. The mock admitted the same
      // gap; it needs an SMS OTP decision (Twilio vs. Supabase phone auth)
      // before this is safe to run with real money behind it. Logged so the
      // exposure is visible rather than silent.
      this.logger.log(
        `Referral reward paid on order ${order.id} without phone verification — see docs/BACKEND-BUILD-PHASES.md, Phase 4.`
      );
    }
  }

  /**
   * Points come back off a refunded order — the brief's remaining anti-fraud
   * rule ("retrait des points si la commande est remboursée").
   *
   * Reverses exactly what was credited rather than recomputing it: the rates
   * may have changed since, and taking back more than was given is a worse
   * error than taking back too little. Still unwired, like its counterpart in
   * the mock — Phase 6's refund flow is the caller it is waiting for.
   */
  async reverseForOrder(orderId: string): Promise<void> {
    const earned = await unwrap<{ customerId: string; points: number } | null>(
      this.db
        .from('loyalty_transactions')
        .select('customerId:customer_id, points')
        .eq('order_id', orderId)
        .eq('reason', 'order_delivered')
        .maybeSingle()
    );
    // Nothing was ever credited — an order refunded before delivery, which is
    // the common case. Not an error: there is simply nothing to take back.
    if (!earned) return;

    await this.record({
      customerId: earned.customerId,
      points: -earned.points,
      reason: 'order_refunded',
      orderId,
    });
  }
}

/** Postgres's own code for "unique violation". */
const UNIQUE_VIOLATION = '23505';

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
