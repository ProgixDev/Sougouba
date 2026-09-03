import { relations, sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { profiles } from './identity.js';
import { products, vendors } from './catalog.js';
import { couriers } from './courier.js';

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

export const proofMethodEnum = pgEnum('proof_method', ['photo', 'signature', 'pin']);

export const disputeReasonEnum = pgEnum('dispute_reason', [
  'missing_items',
  'wrong_order',
  'quality',
  'late',
  'other',
]);
/**
 * `resolved`/`rejected` are new — the mock's `OrderDispute.status` only ever
 * reached `open`/`answered`, because nothing in the app was entitled to close
 * one. Phase 6 is that entitlement.
 */
export const disputeStatusEnum = pgEnum('dispute_status', ['open', 'answered', 'resolved', 'rejected']);

export const courierIssueReasonEnum = pgEnum('courier_issue_reason', [
  'customer_absent',
  'wrong_address',
  'access_problem',
  'shop_not_ready',
  'order_incomplete',
  'other',
]);
/** The mock's `CourierIssue` has no status at all — nothing ever closes one. Phase 6 adds it. */
export const courierIssueStatusEnum = pgEnum('courier_issue_status', ['open', 'resolved']);

/**
 * One vendor per order — matches the mobile app's actual (tested, shipped)
 * cart behaviour, not the contract's "commandes multi-commerces" line. See
 * "Confirm before Phase 0" #7 in docs/BACKEND-BUILD-PHASES.md: if multi-vendor
 * checkout is confirmed later, it layers a `checkout_sessions` parent over
 * several of these rows rather than reshaping this table.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull().references(() => profiles.id),
    /** Snapshot at checkout — an order must not change if the account's name later does. */
    customerName: text('customer_name'),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
    status: orderStatusEnum('status').notNull().default('pending'),
    subtotalCad: numeric('subtotal_cad', { precision: 10, scale: 2 }).notNull(),
    /** TPS/TVQ — computed on `subtotal_cad` alone, never on delivery. See `data/taxes.ts` in the mobile app. */
    gstCad: numeric('gst_cad', { precision: 10, scale: 2 }).notNull(),
    qstCad: numeric('qst_cad', { precision: 10, scale: 2 }).notNull(),
    deliveryFeeCad: numeric('delivery_fee_cad', { precision: 10, scale: 2 }).notNull(),
    pointsRedeemed: integer('points_redeemed'),
    pointsDiscountCad: numeric('points_discount_cad', { precision: 10, scale: 2 }),
    /**
     * The coupon code as it was applied, and what it took off. Snapshotted onto
     * the order like the item prices and the delivery address: a coupon can be
     * edited or deleted, and a past receipt must still say what it actually
     * charged. `coupon_redemptions` records *that* it was used; this records
     * what it was worth at the time.
     */
    couponCode: text('coupon_code'),
    couponDiscountCad: numeric('coupon_discount_cad', { precision: 10, scale: 2 }),
    totalCad: numeric('total_cad', { precision: 10, scale: 2 }).notNull(),
    deliveryAddressLabel: text('delivery_address_label').notNull(),
    deliveryAddressStreet: text('delivery_address_street').notNull(),
    deliveryAddressCity: text('delivery_address_city').notNull(),
    deliveryAddressPostalCode: text('delivery_address_postal_code').notNull(),
    deliveryAddressLat: doublePrecision('delivery_address_lat').notNull(),
    deliveryAddressLng: doublePrecision('delivery_address_lng').notNull(),
    /**
     * The Stripe PaymentIntent this order was paid by. **Unique**, and that is
     * the point: `POST /orders` is a write triggered by a client that has just
     * been through a payment sheet, so a retry, a double-tap or a flaky network
     * can deliver it twice. The constraint makes the second attempt a conflict
     * instead of a second order against one payment.
     *
     * Nullable only for rows this API did not create — the seeded/imported
     * history from the mock has no Stripe side. Every order created from
     * Phase 3 on carries one.
     */
    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
    /**
     * Money that went back. Recorded on the order rather than inferred from
     * Stripe: a receipt has to say what was actually refunded without a network
     * call, and a partial refund is a figure the shopper, the merchant and the
     * admin who granted it all need to agree on.
     *
     * `refunded_at` is what everything else keys off — a null here means no
     * refund, whatever Stripe may separately know.
     */
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundAmountCad: numeric('refund_amount_cad', { precision: 10, scale: 2 }),
    stripeRefundId: text('stripe_refund_id'),
    refundReason: text('refund_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_customer_id_idx').on(t.customerId),
    index('orders_vendor_id_idx').on(t.vendorId),
    index('orders_status_idx').on(t.status),
  ]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id),
    /** Name/price snapshot at order time — the catalogue is mutable, an order must not change after it's placed. */
    name: text('name').notNull(),
    qty: integer('qty').notNull(),
    unitPriceCad: numeric('unit_price_cad', { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [index('order_items_order_id_idx').on(t.orderId)]
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    status: orderStatusEnum('status').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [index('order_status_history_order_id_idx').on(t.orderId)]
);

/**
 * 1:1 with an order, present once a courier accepts. **No stored position
 * column** — Phase 5 replaces the mock's derived-from-elapsed-time trick with
 * real GPS pings (`courier_locations`), so there is nothing to keep in sync
 * here.
 */
export const orderDeliveries = pgTable(
  'order_deliveries',
  {
    orderId: uuid('order_id').primaryKey().references(() => orders.id, { onDelete: 'cascade' }),
    courierId: uuid('courier_id').notNull().references(() => couriers.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    pickupEtaMin: integer('pickup_eta_min').notNull(),
    dropoffEtaMin: integer('dropoff_eta_min').notNull(),
    distanceKm: numeric('distance_km', { precision: 6, scale: 2 }).notNull(),
    /** Server-generated random 4 digits, unlike the mock's id-derived (and, by its own admission, guessable) PIN. */
    pin: text('pin').notNull(),
    tipCad: numeric('tip_cad', { precision: 10, scale: 2 }).notNull().default('0'),
    /** The courier's take, frozen at `complete` — never re-derived after the fact. See `data/courierPay.ts`. */
    earningsCad: numeric('earnings_cad', { precision: 10, scale: 2 }).notNull(),
    /**
     * When this run's earnings actually reached the courier, and the Stripe
     * Transfer that carried them.
     *
     * The *run* is what gets marked paid, not a date range on a batch: a run
     * missed by a failed batch has to appear in the next one, and a payout
     * query keyed on "since last Friday" would drop it forever. `paid_out_at is
     * null` is therefore the whole definition of "owed".
     */
    paidOutAt: timestamp('paid_out_at', { withTimezone: true }),
    stripeTransferId: text('stripe_transfer_id'),
  },
  (t) => [
    // A courier's own delivery history (`getOrdersForCourier`'s real-backend equivalent) is a confirmed query pattern.
    index('order_deliveries_courier_id_idx').on(t.courierId),
    // The weekly payout batch's own query. Partial because that set is small
    // and empties after each Friday, while the table it sits on grows forever.
    index('order_deliveries_unpaid_idx')
      .on(t.courierId)
      .where(sql`${t.paidOutAt} is null and ${t.deliveredAt} is not null`),
  ]
);

export const deliveryProofs = pgTable('delivery_proofs', {
  orderId: uuid('order_id').primaryKey().references(() => orderDeliveries.orderId, { onDelete: 'cascade' }),
  method: proofMethodEnum('method').notNull(),
  /** Storage path — the mock's `photo`/`signature` methods never persisted anything past a local device URI. */
  imagePath: text('image_path'),
  note: text('note'),
  at: timestamp('at', { withTimezone: true }).notNull(),
});

/** 1:1 with an order — a shopper reports what was in the bag, once. */
export const disputes = pgTable('disputes', {
  orderId: uuid('order_id').primaryKey().references(() => orders.id, { onDelete: 'cascade' }),
  reason: disputeReasonEnum('reason').notNull(),
  message: text('message').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  status: disputeStatusEnum('status').notNull().default('open'),
  merchantReply: text('merchant_reply'),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => profiles.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

/** 1:1 with an order — a courier reports what stopped delivery. Never changes `orders.status` itself. */
export const courierIssues = pgTable('courier_issues', {
  orderId: uuid('order_id').primaryKey().references(() => orders.id, { onDelete: 'cascade' }),
  reason: courierIssueReasonEnum('reason').notNull(),
  message: text('message').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  status: courierIssueStatusEnum('status').notNull().default('open'),
  resolvedBy: uuid('resolved_by').references(() => profiles.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(profiles, { fields: [orders.customerId], references: [profiles.id] }),
  vendor: one(vendors, { fields: [orders.vendorId], references: [vendors.id] }),
  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
  delivery: one(orderDeliveries, { fields: [orders.id], references: [orderDeliveries.orderId] }),
  dispute: one(disputes, { fields: [orders.id], references: [disputes.orderId] }),
  courierIssue: one(courierIssues, { fields: [orders.id], references: [courierIssues.orderId] }),
}));

export const orderDeliveriesRelations = relations(orderDeliveries, ({ one }) => ({
  order: one(orders, { fields: [orderDeliveries.orderId], references: [orders.id] }),
  courier: one(couriers, { fields: [orderDeliveries.courierId], references: [couriers.id] }),
  proof: one(deliveryProofs, { fields: [orderDeliveries.orderId], references: [deliveryProofs.orderId] }),
}));

/**
 * The other half of `ordersRelations`'s two `many()` declarations.
 *
 * A `many()` on its own is not enough for Drizzle's relational query builder:
 * it carries no columns, so the join has to be read off the matching `one()`
 * on the child. Without these, `db.query.orders.findFirst({ with: { items:
 * true } })` fails at runtime with "There is not enough information to infer
 * relation orders.items" — and only at runtime, since `many()` type-checks
 * happily on its own.
 *
 * Declared here and not in a migration: `relations()` is TypeScript metadata
 * that never reaches the database. The foreign keys these describe already
 * exist on the tables above, so `drizzle-kit generate` emits nothing for them.
 */
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, { fields: [orderStatusHistory.orderId], references: [orders.id] }),
}));
