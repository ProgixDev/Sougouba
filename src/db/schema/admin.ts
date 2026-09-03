import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './identity.js';

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
    /**
     * How long a courier's GPS trail is kept after it is recorded.
     *
     * Settings rather than a constant for the same reason the loyalty rates are:
     * the privacy policy has to state a number, and a number the client cannot
     * change without a migration is a number that will go stale and turn the
     * policy into a lie. Changing it is audited like every other setting.
     *
     * 30 days by default. The trail's three jobs are all short-lived — showing
     * the shopper a moving pin, ranking the nearest courier, and measuring the
     * distance that sets the pay — and the last of those is already frozen onto
     * `order_deliveries` at delivery. What is left is a minute-by-minute record
     * of where a named person went, which is the most sensitive thing this
     * database holds and the one with the least reason to persist.
     */
    courierLocationRetentionDays: integer('courier_location_retention_days').notNull().default(30),
    /**
     * How long a signature or delivery photo is kept.
     *
     * A year, and longer than the GPS trail on purpose: this is the evidence
     * that answers "it never arrived", so it has to outlive the window in which
     * someone can say that. A proof attached to an unresolved dispute is never
     * purged regardless of age — see `RetentionService`.
     */
    deliveryProofRetentionDays: integer('delivery_proof_retention_days').notNull().default(365),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('platform_settings_singleton', sql`${t.id} = 1`)]
);

/**
 * What an audited action was done *to*. Coarse on purpose — the fine detail
 * lives in `action`, and this is the axis a reader filters on ("show me
 * everything that happened to this shop").
 */
export const auditSubjectEnum = pgEnum('audit_subject', [
  'vendor',
  'courier',
  'order',
  'dispute',
  'courier_issue',
  'settings',
]);

/**
 * Who did what, to whom, and when — the record that did not exist.
 *
 * `SettingsService.update` carried the ⚠️ that named this table: an
 * administrator could change the commission rate or end a double-points day and
 * nothing anywhere said who, or when. The same was true of every approval,
 * rejection, suspension, dispute ruling and refund: the *outcome* was stored on
 * the row it changed (`reviewed_by`, `resolved_by`, `refund_reason`), so the
 * current state was attributable but its history was not. A shop suspended and
 * then reinstated left no trace that it had ever been suspended.
 *
 * Two decisions worth stating:
 *
 * **Append-only in the database, not by convention.** A trigger refuses UPDATE
 * and DELETE on this table for every role including the owner the API connects
 * as. Grants would not do it — the API is the table owner — and an audit log
 * its own application can rewrite is not evidence of anything.
 *
 * **Names are snapshotted, not joined.** `actor_name` and `subject_label` are
 * copies taken at the moment of the action. An administrator can be renamed and
 * a shop can be deleted; what the log has to answer is what was true then, and
 * a join answers what is true now. `actor_id` keeps the link for filtering and
 * survives the person's deletion as null.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null once the administrator's account is gone. The entry stays; `actor_name` still names them. */
    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    /**
     * Dotted `subject.verb` — `vendor.approve`, `settings.update`,
     * `order.refund`. Text rather than an enum: the set grows with every phase
     * (payouts in 7, notifications in 9), and a migration per new verb would
     * buy nothing the `AdminAction` union in `audit.service.ts` does not
     * already give the writing side.
     */
    action: text('action').notNull(),
    subjectType: auditSubjectEnum('subject_type').notNull(),
    /** Null for `settings`, which is a singleton with no uuid. */
    subjectId: uuid('subject_id'),
    /** The shop or courier name as it read at the time. */
    subjectLabel: text('subject_label'),
    /** The written motive the back office already requires on a reject, a suspend or a refund. */
    reason: text('reason'),
    /**
     * `{ field: { from, to } }` — populated for settings changes, where the
     * interesting fact is not "the rates were edited" but "commission went from
     * 0.12 to 0.20". Only fields that actually moved are recorded.
     */
    changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The default read is "most recent first", unfiltered.
    index('admin_audit_log_created_at_idx').on(t.createdAt.desc()),
    // "Everything that ever happened to this shop."
    index('admin_audit_log_subject_idx').on(t.subjectType, t.subjectId),
    index('admin_audit_log_actor_idx').on(t.actorId),
  ]
);
