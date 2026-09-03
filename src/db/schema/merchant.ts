import { relations } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { vendors } from './catalog.js';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'inactive',
  'active',
  'past_due',
  'canceled',
]);

/**
 * 1:1 with `vendors` — the CDC §05 monetization model: 12% commission
 * (taken via `application_fee_amount` at PaymentIntent time, Phase 3) plus
 * this $70/month subscription, both cumulative, never an either/or.
 */
export const merchantSubscriptions = pgTable('merchant_subscriptions', {
  vendorId: uuid('vendor_id').primaryKey().references(() => vendors.id, { onDelete: 'cascade' }),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: subscriptionStatusEnum('status').notNull().default('inactive'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const merchantSubscriptionsRelations = relations(merchantSubscriptions, ({ one }) => ({
  vendor: one(vendors, { fields: [merchantSubscriptions.vendorId], references: [vendors.id] }),
}));
