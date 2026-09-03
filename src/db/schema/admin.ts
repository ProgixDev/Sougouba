import { boolean, check, integer, numeric, pgTable, smallint, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Singleton row (`id` fixed at 1) — the admin-editable version of the
 * mobile app's `data/loyalty.ts` and `lib/monetization.ts` constants. Seeded
 * in the first migration with the values already verified against
 * `scripts/verify-loyalty.ts` and the CDC addendum this session.
 */
export const platformSettings = pgTable(
  'platform_settings',
  {
    id: smallint('id').primaryKey().default(1),
    pointsPerCad: numeric('points_per_cad', { precision: 6, scale: 2 }).notNull().default('1'),
    pointsPerCadRedeemed: numeric('points_per_cad_redeemed', { precision: 6, scale: 2 }).notNull().default('100'),
    maxRedemptionShare: numeric('max_redemption_share', { precision: 4, scale: 3 }).notNull().default('0.2'),
    pointsExpiryMonths: integer('points_expiry_months').notNull().default(12),
    referralRewardPoints: integer('referral_reward_points').notNull().default(300),
    referralMinFirstOrderCad: numeric('referral_min_first_order_cad', { precision: 10, scale: 2 })
      .notNull()
      .default('60'),
    /** The "journées points doublés" switch from the client brief — a real toggle now, not a hardcoded `false`. */
    doublePointsActive: boolean('double_points_active').notNull().default(false),
    doublePointsStartsAt: timestamp('double_points_starts_at', { withTimezone: true }),
    doublePointsEndsAt: timestamp('double_points_ends_at', { withTimezone: true }),
    /** CDC §05 — 12% commission + $70/month, cumulative. */
    commissionRate: numeric('commission_rate', { precision: 4, scale: 3 }).notNull().default('0.12'),
    monthlySubscriptionCad: numeric('monthly_subscription_cad', { precision: 10, scale: 2 }).notNull().default('70'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('platform_settings_singleton', sql`${t.id} = 1`)]
);
