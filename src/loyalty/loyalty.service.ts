import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { referralCodeFor } from '../common/loyalty/referral.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { loyaltyTransactions, orders, profiles } from '../db/schema/index.js';
import { pointsEarnedFor, pointsExpiryFrom, qualifiesForReferralReward } from './loyalty-rules.js';
import { SettingsService } from './settings.service.js';

/**
 * The connection *or* an open transaction on it. Every write below is called
 * both standalone and from inside a caller's transaction (the redemption debit
 * runs inside the order's own, so a failed order leaves no debit behind), and
 * Drizzle types the two differently.
 */
type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

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
    const [row] = await this.db
      .select({ balance: sql<number>`coalesce(sum(${loyaltyTransactions.points}), 0)::int` })
      .from(loyaltyTransactions)
      .where(
        and(
          eq(loyaltyTransactions.customerId, customerId),
          sql`(${loyaltyTransactions.expiresAt} is null or ${loyaltyTransactions.expiresAt} > now())`
        )
      );
    return row?.balance ?? 0;
  }

  /** Newest first, matching the points screen. Includes expired rows — the history is a record, not a balance. */
  history(customerId: string, limit: number, offset: number) {
    return this.db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customerId))
      .orderBy(desc(loyaltyTransactions.createdAt), desc(loyaltyTransactions.id))
      .limit(limit)
      .offset(offset);
  }

  /** How this account's own referral code has paid off — read off the ledger rather than a separate counter. */
  async referralStats(customerId: string) {
    const [row] = await this.db
      .select({
        referredCount: sql<number>`count(*)::int`,
        pointsFromReferrals: sql<number>`coalesce(sum(${loyaltyTransactions.points}), 0)::int`,
      })
      .from(loyaltyTransactions)
      .where(
        and(eq(loyaltyTransactions.customerId, customerId), eq(loyaltyTransactions.reason, 'referral_referrer'))
      );

    return {
      code: referralCodeFor(customerId),
      referredCount: row?.referredCount ?? 0,
      pointsFromReferrals: row?.pointsFromReferrals ?? 0,
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
  private async record(
    tx: DbOrTx,
    values: {
      customerId: string;
      points: number;
      reason: 'order_delivered' | 'referral_referrer' | 'referral_referred' | 'redeemed' | 'order_refunded';
      orderId: string;
      expiresAt?: Date | null;
      createdAt?: Date;
    }
  ): Promise<boolean> {
    const inserted = await tx
      .insert(loyaltyTransactions)
      .values({
        customerId: values.customerId,
        points: values.points,
        reason: values.reason,
        orderId: values.orderId,
        expiresAt: values.expiresAt ?? null,
        ...(values.createdAt ? { createdAt: values.createdAt } : {}),
      })
      .onConflictDoNothing()
      .returning({ id: loyaltyTransactions.id });
    return inserted.length > 0;
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
  async debitForRedemption(tx: DbOrTx, customerId: string, points: number, orderId: string): Promise<void> {
    if (points <= 0) return;
    // No expiry on a debit — see `balance`.
    await this.record(tx, { customerId, points: -points, reason: 'redeemed', orderId });
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

    const [order] = await this.db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        subtotalCad: orders.subtotalCad,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return;
    if (order.status !== 'delivered') {
      // Defence in depth: the caller is the completion endpoint, but crediting
      // an order that is not delivered would be paying for work not done.
      this.logger.warn(`Refused to credit order ${orderId}: status is "${order.status}", not "delivered"`);
      return;
    }

    const subtotalCad = Number(order.subtotalCad);
    const points = pointsEarnedFor(subtotalCad, rates, deliveredAt);

    await this.db.transaction(async (tx) => {
      if (points > 0) {
        const credited = await this.record(tx, {
          customerId: order.customerId,
          points,
          reason: 'order_delivered',
          orderId: order.id,
          expiresAt: pointsExpiryFrom(deliveredAt, rates),
          createdAt: deliveredAt,
        });
        // Already credited — a retry, or a webhook arriving twice. Everything
        // below is conditioned on the same order, so stopping here keeps the
        // referral reward from being paid a second time too.
        if (!credited) return;
      }

      if (!qualifiesForReferralReward(subtotalCad, rates)) return;

      const [customer] = await tx
        .select({ referredBy: profiles.referredBy })
        .from(profiles)
        .where(eq(profiles.id, order.customerId))
        .limit(1);
      if (!customer?.referredBy) return;

      // Only on the *first* delivered order. Counted rather than flagged: a
      // "has been rewarded" column would be a second source of truth, and the
      // ledger already knows — this order plus any earlier delivered one.
      const [{ earlier }] = await tx
        .select({ earlier: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.customerId, order.customerId),
            eq(orders.status, 'delivered'),
            sql`${orders.id} <> ${order.id}`,
            // Strictly earlier by placement time, not by delivery time: two
            // orders can be delivered out of the order they were placed in,
            // and "first order" in the brief means the first one they made.
            sql`${orders.createdAt} < ${order.createdAt}`
          )
        );
      if (earlier > 0) return;

      // ⚠️ The brief's other anti-fraud gate — a **verified phone number** —
      // is still not enforced. Without it, one person with two email addresses
      // can refer themselves and collect both sides. The mock admitted the same
      // gap; it needs an SMS OTP decision (Twilio vs. Supabase phone auth)
      // before this is safe to run with real money behind it. Logged so the
      // exposure is visible rather than silent.
      this.logger.log(
        `Referral reward paid on order ${order.id} without phone verification — see docs/BACKEND-BUILD-PHASES.md, Phase 4.`
      );

      await this.record(tx, {
        customerId: order.customerId,
        points: rates.referralRewardPoints,
        reason: 'referral_referred',
        orderId: order.id,
        expiresAt: pointsExpiryFrom(deliveredAt, rates),
        createdAt: deliveredAt,
      });
      await this.record(tx, {
        customerId: customer.referredBy,
        points: rates.referralRewardPoints,
        reason: 'referral_referrer',
        orderId: order.id,
        expiresAt: pointsExpiryFrom(deliveredAt, rates),
        createdAt: deliveredAt,
      });
    });
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
  async reverseForOrder(orderId: string, tx: DbOrTx = this.db): Promise<void> {
    const [earned] = await tx
      .select({ customerId: loyaltyTransactions.customerId, points: loyaltyTransactions.points })
      .from(loyaltyTransactions)
      .where(and(eq(loyaltyTransactions.orderId, orderId), eq(loyaltyTransactions.reason, 'order_delivered')))
      .limit(1);
    // Nothing was ever credited — an order refunded before delivery, which is
    // the common case. Not an error: there is simply nothing to take back.
    if (!earned) return;

    await this.record(tx, {
      customerId: earned.customerId,
      points: -earned.points,
      reason: 'order_refunded',
      orderId,
    });
  }
}
