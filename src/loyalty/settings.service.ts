import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { UpdateSettingsInput } from '../admin/dto/admin.dto.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { platformSettings } from '../db/schema/index.js';
import { DEFAULT_LOYALTY_RATES, type LoyaltyRates } from './loyalty-rules.js';

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
  constructor(@Inject(DB) private readonly db: Db) {}

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

  /**
   * Change the rules (Phase 8). The singleton row is updated in place — there is
   * exactly one, enforced by a check constraint on `id = 1`.
   *
   * `numeric` columns take strings: handing Drizzle a JS number for a `numeric`
   * is the one conversion this codebase gets wrong in both directions if it is
   * not deliberate about it (see `catalog/mappers.ts`).
   *
   * ⚠️ No history is kept. A rate change takes effect immediately and silently,
   * and orders priced before it keep their own snapshotted figures — which is
   * correct — but there is no record of *who* changed a rate or *when*. That is
   * a real gap for the commission rate in particular, and the right fix is an
   * `admin_audit_log` table in Phase 10 rather than a `previous_value` column here.
   */
  async update(patch: UpdateSettingsInput) {
    const [updated] = await this.db
      .update(platformSettings)
      .set({
        ...(patch.pointsPerCad !== undefined ? { pointsPerCad: String(patch.pointsPerCad) } : {}),
        ...(patch.pointsPerCadRedeemed !== undefined ? { pointsPerCadRedeemed: String(patch.pointsPerCadRedeemed) } : {}),
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
    return this.all();
  }
}
