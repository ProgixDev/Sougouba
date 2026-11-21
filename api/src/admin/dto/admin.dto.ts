import { z } from 'zod';

import { paginationSchema } from '../../catalog/dto/query.dto.js';
import { PERMISSIONS, type Permission } from '../permissions.js';

/**
 * `GET /admin/orders`.
 *
 * The filters exist so the back office can narrow server-side. The mock the
 * dashboard runs on today fetches every order and filters in a `useMemo` —
 * fine over 250 seeded rows, and wrong the moment the list is paginated, since
 * the client would then be filtering one page and calling it the result.
 */
export const orderListQuerySchema = paginationSchema.extend({
  status: z
    .enum(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])
    .optional(),
  vendorId: z.string().uuid().optional(),
  /** Matches an order id prefix, the customer's name, or the shop's name. */
  search: z.string().trim().min(1).max(100).optional(),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/**
 * `GET /admin/stats/overview`.
 *
 * An enum rather than a bounded number: the three ranges are the three the
 * dashboard offers, and each one costs a full scan of the orders table. Letting
 * a caller ask for 3650 days would be a denial-of-service with a query string.
 */
export const overviewQuerySchema = z.object({
  range: z
    .enum(['7', '30', '90'])
    .default('30')
    .transform((v) => Number(v) as 7 | 30 | 90),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

export const disputeQuerySchema = paginationSchema.extend({
  status: z.enum(['open', 'answered', 'resolved', 'rejected']).optional(),
  /** Internal — `disputeDetail` narrows the queue query to one order. */
  orderId: z.string().uuid().optional(),
  /** The triage default: everything still waiting on a human. */
  openOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export type DisputeQuery = z.infer<typeof disputeQuerySchema>;

/**
 * Settling a dispute.
 *
 * `resolved` means the shopper was right (in whole or in part); `rejected`
 * means the order stands as delivered. Both are terminal, and both require a
 * note — a dispute closed with no reasoning is one nobody can defend three
 * months later when the merchant asks why they were charged back.
 */
export const resolveDisputeSchema = z
  .object({
    outcome: z.enum(['resolved', 'rejected'], { message: 'Issue requise' }),
    note: z.string().trim().min(5, 'Expliquez la décision').max(2000),
    /**
     * Optional refund, in dollars. Absent means "decision recorded, no money
     * moves" — which is a real outcome: a merchant may make it right directly,
     * or the complaint may be upheld without a monetary remedy.
     */
    refundAmountCad: z.number().positive().max(99_999_999.99).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.outcome === 'rejected' && values.refundAmountCad !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['refundAmountCad'],
        message: 'Un litige rejeté ne peut pas être remboursé',
      });
    }
  });

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

export const courierIssueQuerySchema = paginationSchema.extend({
  status: z.enum(['open', 'resolved']).optional(),
  /** Internal — `courierIssueDetail` narrows the queue query to one order. */
  orderId: z.string().uuid().optional(),
});

export type CourierIssueQuery = z.infer<typeof courierIssueQuerySchema>;

export const resolveCourierIssueSchema = z.object({
  note: z.string().trim().min(5, 'Expliquez la résolution').max(2000),
});

export type ResolveCourierIssueInput = z.infer<typeof resolveCourierIssueSchema>;

/** A courier reports what stopped a delivery. Ported from the mock's `reportCourierIssue`. */
export const reportCourierIssueSchema = z.object({
  reason: z.enum(['customer_absent', 'wrong_address', 'access_problem', 'shop_not_ready', 'order_incomplete', 'other'], {
    message: 'Choisissez un motif',
  }),
  message: z.string().trim().min(5, 'Décrivez le problème').max(2000),
});

export type ReportCourierIssueInput = z.infer<typeof reportCourierIssueSchema>;

// ── approval queues ─────────────────────────────────────────────────────────

const applicationStatusSchema = z.enum(['pending', 'approved', 'suspended', 'rejected']);

export const reviewQuerySchema = paginationSchema.extend({
  status: applicationStatusSchema.optional(),
});

export type ReviewQuery = z.infer<typeof reviewQuerySchema>;

/**
 * The note behind a decision.
 *
 * Optional on an approval — "yes" needs no explanation — and **required** on a
 * rejection or suspension, enforced at the route rather than here, because the
 * two share this schema and only the destination knows which it is. A merchant
 * told only "rejected" has nothing to fix and nothing to appeal.
 */
export const reviewDecisionSchema = z.object({
  reason: z.string().trim().min(5, 'Expliquez la décision').max(2000).optional(),
});

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

export const userQuerySchema = paginationSchema.extend({
  role: z.enum(['customer', 'business', 'courier', 'admin']).optional(),
  /** Matches a name or an email address. */
  search: z.string().trim().min(1).max(100).optional(),
});

/**
 * `GET /admin/search?q=` — the back office's typeahead.
 *
 * Two characters minimum, enforced here rather than trusting the client's own
 * guard: a one-character query scans four tables to return noise.
 */
export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Au moins 2 caractères').max(100),
  perType: z.coerce.number().int().positive().max(10).default(5),
});

export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;

export type UserQuery = z.infer<typeof userQuerySchema>;

// ── platform settings ───────────────────────────────────────────────────────

/**
 * The rates the client brief puts under an administrator's control ("modifier
 * les règles"), plus the CDC's monetization figures.
 *
 * Every field is optional — this is a patch, and an admin turning on a
 * double-points day should not have to resend the commission rate. Each carries
 * the bound its column actually holds, so an impossible value is a 400 rather
 * than a Postgres overflow.
 */
export const updateSettingsSchema = z
  .object({
    pointsPerCad: z.number().min(0).max(9999.99).optional(),
    pointsPerCadRedeemed: z.number().min(1, 'Au moins 1 point par dollar').max(9999.99).optional(),
    maxRedemptionShare: z.number().min(0).max(1, 'Une part, entre 0 et 1').optional(),
    pointsExpiryMonths: z.number().int().min(1).max(120).optional(),
    referralRewardPoints: z.number().int().min(0).max(1_000_000).optional(),
    referralMinFirstOrderCad: z.number().min(0).max(99_999_999.99).optional(),
    doublePointsActive: z.boolean().optional(),
    /** Null clears a bound — an open-ended promotion, or one with no start. */
    doublePointsStartsAt: z.coerce.date().nullable().optional(),
    doublePointsEndsAt: z.coerce.date().nullable().optional(),
    /** CDC §05: 12 % commission + 70 $/month, cumulative. */
    commissionRate: z.number().min(0).max(1, 'Un taux, entre 0 et 1').optional(),
    monthlySubscriptionCad: z.number().min(0).max(99_999_999.99).optional(),
    /**
     * Retention periods, in days. Editable because the privacy policy publishes
     * them: a number the client cannot change without a migration is a number
     * that goes stale and turns a published policy into a lie.
     *
     * Floored at 1, not 0. Zero reads as "delete on sight", which breaks live
     * tracking for the GPS trail and destroys a delivery proof the moment it is
     * created — neither is a retention period, and both are easier to type by
     * accident than to notice afterwards.
     */
    courierLocationRetentionDays: z.number().int().min(1).max(3650).optional(),
    deliveryProofRetentionDays: z.number().int().min(1).max(3650).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Aucun champ à modifier')
  .refine(
    (v) => !(v.doublePointsStartsAt && v.doublePointsEndsAt) || v.doublePointsStartsAt < v.doublePointsEndsAt,
    { message: 'La fin doit suivre le début', path: ['doublePointsEndsAt'] }
  );

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/**
 * A refund granted outside a dispute — an order cancelled after payment, a
 * merchant who could not fulfil, the sold-out-mid-checkout case
 * `OrdersService.place` logs.
 */
export const refundOrderSchema = z.object({
  /** Absent refunds the whole order total. */
  amountCad: z.number().positive().max(99_999_999.99).optional(),
  reason: z.string().trim().min(5, 'Motif requis').max(500),
});

export type RefundOrderInput = z.infer<typeof refundOrderSchema>;

// ── audit log ───────────────────────────────────────────────────────────────

/**
 * Reading the trail.
 *
 * `subjectId` without `subjectType` is allowed and useful — uuids are unique
 * across the tables here, so "everything that ever touched this id" answers the
 * question without the reader having to know which kind of thing it is.
 *
 * The dates are coerced rather than parsed as strings: a filter that silently
 * matches nothing because `?since=2026-09-01` arrived as text is worse than a
 * 400.
 */
export const auditQuerySchema = paginationSchema.extend({
  action: z.string().trim().min(1).max(60).optional(),
  subjectType: z.enum(['vendor', 'courier', 'order', 'dispute', 'courier_issue', 'settings', 'user', 'specialty', 'support', 'review', 'coupon', 'product', 'admin_role']).optional(),
  subjectId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

// ── shop specialties ────────────────────────────────────────────────────────

/** 40: one line under a shop's name — the table's own check (`0033`). */
const specialtyName = z.string().trim().min(2, 'Au moins 2 caractères').max(40, '40 caractères maximum');

export const createSpecialtySchema = z.object({
  vendorType: z.enum(['grocery', 'restaurant']),
  nameFr: specialtyName,
  nameEn: specialtyName,
  position: z.number().int().min(0).max(10_000).optional(),
});

export type CreateSpecialtyInput = z.infer<typeof createSpecialtySchema>;

/** The type is not editable: a shop's specialty must stay in its own list. */
export const updateSpecialtySchema = z
  .object({
    nameFr: specialtyName.optional(),
    nameEn: specialtyName.optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Aucun champ à modifier');

export type UpdateSpecialtyInput = z.infer<typeof updateSpecialtySchema>;

// ── support inbox ───────────────────────────────────────────────────────────

/** `escalated` is the inbox; `closed` the resolved ones; `all` both (never the assistant-only `open`). */
export const supportQuerySchema = paginationSchema.extend({
  status: z.enum(['escalated', 'closed', 'all']).default('escalated'),
});

export type SupportQuery = z.infer<typeof supportQuerySchema>;

export const supportReplySchema = z.object({
  content: z.string().trim().min(1, 'Message vide').max(2000, 'Message trop long (2000 caractères au plus)'),
});

export type SupportReplyInput = z.infer<typeof supportReplySchema>;

// ── moderation: reviews, coupons, products ──────────────────────────────────

export const adminReviewQuerySchema = paginationSchema.extend({
  /** `low` is 2 stars or fewer for the shop — where abuse and real problems both show up first. */
  filter: z.enum(['all', 'with_comment', 'low', 'hidden', 'removed']).default('all'),
});

export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>;

export const moderateReviewSchema = z.object({
  action: z.enum(['hide_comment', 'show_comment', 'remove', 'restore']),
  reason: z.string().trim().max(1000).optional(),
});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const adminCouponQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'ended', 'all']).default('all'),
  search: z.string().trim().min(1).max(40).optional(),
});

export type AdminCouponQuery = z.infer<typeof adminCouponQuerySchema>;

export const adminProductQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  hidden: z.enum(['all', 'only']).default('all'),
});

export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;

// ── administrator accounts ──────────────────────────────────────────────────

export const createAdminSchema = z.object({
  // Trimmed and lowered before the format check — a pasted address often carries a space.
  email: z.string().trim().toLowerCase().pipe(z.email('Courriel invalide')),
  fullName: z.string().trim().min(2, 'Nom requis').max(80, 'Nom trop long'),
  roleId: z.uuid('Choisissez un rôle'),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const setAdminRoleSchema = z.object({ roleId: z.uuid('Choisissez un rôle') });

export type SetAdminRoleInput = z.infer<typeof setAdminRoleSchema>;

/** A custom role. Its permissions must come from the catalogue — anything else is refused, not stored. */
export const adminRoleSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis').max(40, 'Nom trop long'),
  description: z.string().trim().max(300, 'Description trop longue').optional(),
  permissions: z
    .array(z.enum(PERMISSIONS as [Permission, ...Permission[]], { message: 'Permission inconnue' }))
    .min(1, 'Cochez au moins une permission'),
});

export type AdminRoleInput = z.infer<typeof adminRoleSchema>;
