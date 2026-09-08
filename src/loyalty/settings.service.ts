import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import { diffSettings } from '../admin/audit.service.js';
import type { UpdateSettingsInput } from '../admin/dto/admin.dto.js';
import type { Db, Tables } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { DEFAULT_LOYALTY_RATES, type LoyaltyRates } from './loyalty-rules.js';

/** The camelCase shape `camelize` produces from a `platform_settings` row. */
type SettingsRow = Record<string, any>;

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
  // No `AuditService`: `settings_update` writes its own audit entry inside the
  // transaction that makes the change.
  constructor(@Inject(DB) private readonly db: Db) {}

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
    const row = await this.readRow();
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
    const row = await this.readRow();
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
    // Read before write so the diff describes the row this update overwrites.
    // ⚠️ This read is now *outside* the transaction, where it used to be inside
    // it — PostgREST has no way to read within one. A concurrent administrator
    // saving between these two calls would produce a diff whose `from` names a
    // value that was already gone. The change itself still lands atomically
    // with its audit row; only the recorded "before" can be stale. Narrow, and
    // narrower than losing the entry altogether, but it is a real regression
    // and worth knowing when reading the log.
    const before = await this.readRow();
    if (!before) throw new NotFoundException('Platform settings row is missing');

    const updated = await unwrapRpc<Tables<'platform_settings'>>(
      this.db.rpc('settings_update', {
        p_admin_id: adminId,
        // Cast: the generated arg type for a `jsonb` parameter is `Json`,
        // whose object branch does not accept an arbitrary record.
        p_patch: patch as never,
        // Computed here, not in SQL: the comparison has to be numeric, because
        // Postgres returns numeric(4,3) as '0.120' while the JSON body carries
        // 0.12 — a string compare logs a commission change on every untouched
        // save. That rule has its own test.
        p_changes: diffSettings(before as Record<string, unknown>, patch as Record<string, unknown>) as never,
      }),
      (error) => {
        if (error.code === 'SGB05') throw new NotFoundException(error.message);
        throw unexpectedDbError(error);
      }
    );

    return this.rowToSettings(camelize<SettingsRow>(updated));
  }

  /** The singleton row — there is exactly one, enforced by a check constraint on `id = 1`. */
  private async readRow(): Promise<SettingsRow | null> {
    const row = await unwrap<Tables<'platform_settings'> | null>(
      this.db.from('platform_settings').select('*').eq('id', 1).maybeSingle()
    );
    return row ? camelize<SettingsRow>(row) : null;
  }
}

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
