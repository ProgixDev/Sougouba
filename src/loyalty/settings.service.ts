import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { AuditService, diffSettings } from '../admin/audit.service.js';
import type { UpdateSettingsInput } from '../admin/dto/admin.dto.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { platformSettings } from '../db/schema/index.js';
import { DEFAULT_LOYALTY_RATES, type LoyaltyRates } from './loyalty-rules.js';

type SettingsRow = typeof platformSettings.$inferSelect;

/**
 * The admin-editable rates, read from the `platform_settings` singleton.
 *
 * **Deliberately not cached.** A cache here would be a few milliseconds saved
 * on a single-row primary-key lookup that Postgres serves from its own buffer
 * cache anyway, bought at the price of an admin changing the commission rate or
 * ending a double-points day and watching nothing happen for the length of the
 * TTL. If a profile ever shows this read mattering, the fix is to cache it with
 * explicit invalidation on the admin write (Phase 8), not a bare TTL.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService
  ) {}

  /**
   * The `numeric` columns come back from Postgres as strings, and every reader
   * of this row wants numbers. One place, so `all()` and `update()` cannot
   * disagree about which fields get converted.
   */
  private rowToSettings(row: SettingsRow) {
    return {
      ...row,
      pointsPerCad: Number(row.pointsPerCad),
      pointsPerCadRedeemed: Number(row.pointsPerCadRedeemed),
      maxRedemptionShare: Number(row.maxRedemptionShare),
      referralMinFirstOrderCad: Number(row.referralMinFirstOrderCad),
      commissionRate: Number(row.commissionRate),
      monthlySubscriptionCad: Number(row.monthlySubscriptionCad),
    };
  }

  async loyaltyRates(): Promise<LoyaltyRates> {
    const [row] = await this.db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
    // Falling back to the mobile app's own constants rather than throwing: the
    // row is seeded by the first migration and a missing one is close to
    // impossible, but a marketplace that stops taking orders because a settings
    // row went missing is a worse failure than one that quietly uses the values
    // every client is already running.
    if (!row) return DEFAULT_LOYALTY_RATES;

    return {
      pointsPerCad: Number(row.pointsPerCad),
      pointsPerCadRedeemed: Number(row.pointsPerCadRedeemed),
      maxRedemptionShare: Number(row.maxRedemptionShare),
      pointsExpiryMonths: row.pointsExpiryMonths,
      referralRewardPoints: row.referralRewardPoints,
      referralMinFirstOrderCad: Number(row.referralMinFirstOrderCad),
      doublePointsActive: row.doublePointsActive,
      doublePointsStartsAt: row.doublePointsStartsAt,
      doublePointsEndsAt: row.doublePointsEndsAt,
    };
  }

  /** The whole settings row, for the back office. Includes the monetization figures `loyaltyRates` leaves out. */
  async all() {
    const [row] = await this.db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
    if (!row) throw new NotFoundException('Platform settings row is missing');
    return this.rowToSettings(row);
  }

  /**
   * Change the rules (Phase 8). The singleton row is updated in place — there is
   * exactly one, enforced by a check constraint on `id = 1`.
   *
   * `numeric` columns take strings: handing Drizzle a JS number for a `numeric`
   * is the one conversion this codebase gets wrong in both directions if it is
   * not deliberate about it (see `catalog/mappers.ts`).
   *
   * History is kept in `admin_audit_log`, not here — that ⚠️ is closed. The
   * table records the actor and a `{ field: { from, to } }` diff of what
   * actually moved, in the same transaction as the write, which is why this
   * method now needs to know who is calling it. Orders priced before a change
   * keep their own snapshotted figures, which remains correct: the audit answers
   * "who raised the commission", not "what did this order pay".
   */
  async update(adminId: string, patch: UpdateSettingsInput) {
    // Read before write, inside the transaction, so the diff describes the row
    // this update actually overwrites rather than one a concurrent admin has
    // since replaced.
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
      if (!before) throw new NotFoundException('Platform settings row is missing');

      const [updated] = await tx
        .update(platformSettings)
        .set({
          ...(patch.pointsPerCad !== undefined ? { pointsPerCad: String(patch.pointsPerCad) } : {}),
          ...(patch.pointsPerCadRedeemed !== undefined
            ? { pointsPerCadRedeemed: String(patch.pointsPerCadRedeemed) }
            : {}),
          ...(patch.maxRedemptionShare !== undefined ? { maxRedemptionShare: String(patch.maxRedemptionShare) } : {}),
          ...(patch.pointsExpiryMonths !== undefined ? { pointsExpiryMonths: patch.pointsExpiryMonths } : {}),
          ...(patch.referralRewardPoints !== undefined ? { referralRewardPoints: patch.referralRewardPoints } : {}),
          ...(patch.referralMinFirstOrderCad !== undefined
            ? { referralMinFirstOrderCad: String(patch.referralMinFirstOrderCad) }
            : {}),
          ...(patch.doublePointsActive !== undefined ? { doublePointsActive: patch.doublePointsActive } : {}),
          ...(patch.doublePointsStartsAt !== undefined ? { doublePointsStartsAt: patch.doublePointsStartsAt } : {}),
          ...(patch.doublePointsEndsAt !== undefined ? { doublePointsEndsAt: patch.doublePointsEndsAt } : {}),
          ...(patch.commissionRate !== undefined ? { commissionRate: String(patch.commissionRate) } : {}),
          ...(patch.monthlySubscriptionCad !== undefined
            ? { monthlySubscriptionCad: String(patch.monthlySubscriptionCad) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(platformSettings.id, 1))
        .returning();
      if (!updated) throw new NotFoundException('Platform settings row is missing');

      await this.audit.record(
        {
          actorId: adminId,
          action: 'settings.update',
          subjectType: 'settings',
          // No uuid to point at: there is exactly one settings row, by check
          // constraint. `subject_label` carries what a reader needs instead.
          subjectId: null,
          subjectLabel: 'Réglages de la plateforme',
          changes: diffSettings(before as Record<string, unknown>, patch as Record<string, unknown>),
        },
        tx
      );

      return this.rowToSettings(updated);
    });
  }
}
