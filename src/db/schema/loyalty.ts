import { relations, sql } from 'drizzle-orm';
import { index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './identity.js';
import { orders } from './orders.js';
import { vendors } from './catalog.js';

/** Direct port of the mobile app's `LoyaltyReason` (`data/types.ts`), built this session. */
export const loyaltyReasonEnum = pgEnum('loyalty_reason', [
  'order_delivered',
  'referral_referrer',
  'referral_referred',
  'redeemed',
  'order_refunded',
]);

export const loyaltyTransactions = pgTable(
  'loyalty_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull().references(() => profiles.id),
    /** Signed — positive for an earn, negative for a redemption or reversal. The balance is just a sum. */
    points: integer('points').notNull(),
    reason: loyaltyReasonEnum('reason').notNull(),
    orderId: uuid('order_id').references(() => orders.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Only an earn expires — a redemption's negative points have no shelf life. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('loyalty_transactions_customer_id_idx').on(t.customerId),
    index('loyalty_transactions_order_id_idx').on(t.orderId),
    // One movement per order per reason — the idempotency guarantee the whole
    // ledger rests on, held by the database rather than by a check-then-insert
    // that two concurrent callers would both pass. Crediting a delivery twice
    // is inventing money, and the credit path already has two callers by
    // design (the live delivery flow, and a backfill that replays history).
    //
    // Partial, because `order_id` is nullable: a future movement not tied to an
    // order (a goodwill adjustment, say) must not collide with every other one
    // of its reason. Every write today passes an order id and so is covered.
    uniqueIndex('loyalty_one_movement_per_order_reason')
      .on(t.orderId, t.reason)
      .where(sql`${t.orderId} is not null`),
  ]
);

export const couponDiscountTypeEnum = pgEnum('coupon_discount_type', ['percentage', 'fixed']);

/**
 * "Coupons promotionnels" — contracted (devis, "Programme de fidélité —
 * points, coupons, parrainage") but with zero rules specified anywhere.
 * Shape here is a reasonable default, not a confirmed spec — see "Confirm
 * before Phase 0" #6 in docs/BACKEND-BUILD-PHASES.md.
 */
export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  discountType: couponDiscountTypeEnum('discount_type').notNull(),
  discountValue: numeric('discount_value', { precision: 10, scale: 2 }).notNull(),
  /** Null means platform-wide; set means the coupon only applies to one vendor's orders. */
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  usageLimit: integer('usage_limit'),
  /**
   * Redemptions so far. Denormalised from `coupon_redemptions` on purpose, and
   * it is the *only* thing that can enforce `usage_limit`.
   *
   * The obvious implementation — `insert … where (select count(*) …) < limit` —
   * does not work, and this was verified rather than assumed: under READ
   * COMMITTED each transaction's counting subquery reads its own snapshot, so
   * two concurrent checkouts both see room for one more and both take it. A
   * single `update … set used_count = used_count + 1 where used_count < limit`
   * cannot do that: Postgres locks the row and re-evaluates the predicate
   * against the version the winner committed, so the loser's update matches
   * nothing.
   */
  usedCount: integer('used_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id').notNull().references(() => coupons.id),
    customerId: uuid('customer_id').notNull().references(() => profiles.id),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A coupon is redeemed on an order at most once — the same idempotency
    // guarantee `debitForRedemption` gives points redemption in the mock.
    uniqueIndex('coupon_redemptions_coupon_order_unique').on(t.couponId, t.orderId),
  ]
);

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({ one }) => ({
  customer: one(profiles, { fields: [loyaltyTransactions.customerId], references: [profiles.id] }),
  order: one(orders, { fields: [loyaltyTransactions.orderId], references: [orders.id] }),
}));
