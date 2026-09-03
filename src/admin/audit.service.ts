import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import type { Page } from '../catalog/dto/query.dto.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { adminAuditLog, profiles } from '../db/schema/index.js';
import type { AuditQuery } from './dto/admin.dto.js';

/** Same shape the rest of the admin module uses to accept "the db, or a transaction on it". */
type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Every action the back office can take, as one closed set.
 *
 * Adding a route to `AdminController` that mutates anything means adding a
 * member here — `audit.spec.ts` asserts that this union and the controller's
 * mutating routes stay the same size, so a new route with no audit call fails
 * the build rather than shipping silently unlogged.
 */
export type AdminAction =
  | 'vendor.approve'
  | 'vendor.reject'
  | 'vendor.suspend'
  | 'courier.approve'
  | 'courier.reject'
  | 'courier.suspend'
  | 'dispute.resolve'
  | 'courier_issue.resolve'
  | 'settings.update'
  | 'order.refund';

export const ADMIN_ACTIONS: AdminAction[] = [
  'vendor.approve',
  'vendor.reject',
  'vendor.suspend',
  'courier.approve',
  'courier.reject',
  'courier.suspend',
  'dispute.resolve',
  'courier_issue.resolve',
  'settings.update',
  'order.refund',
];

export type AuditSubject = 'vendor' | 'courier' | 'order' | 'dispute' | 'courier_issue' | 'settings';

export type AuditEntry = {
  actorId: string;
  action: AdminAction;
  subjectType: AuditSubject;
  subjectId?: string | null;
  subjectLabel?: string | null;
  reason?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
};

/**
 * Compare a patch against the row it is about to overwrite, and keep only what
 * genuinely moves.
 *
 * `undefined` means "not in this PATCH" and is skipped; a field submitted with
 * the value it already had is skipped too, because "changed the commission rate
 * from 0.12 to 0.12" is noise in the one place noise is most expensive.
 *
 * The comparison has to be numeric where both sides are numbers, and a string
 * compare will not do it: Postgres returns `numeric(4,3)` as `'0.120'` and the
 * JSON body carries `0.12`, so on `String()` alone *every* save of an untouched
 * form logs a commission change that never happened. Caught by its own test —
 * the first version of this function did exactly that.
 *
 * A missing `before` is normalised to `null` rather than left `undefined`,
 * because this ends up in a `jsonb` column and `undefined` does not survive the
 * trip: `{ from: undefined }` would serialise to `{}` and lose the field.
 */
export function diffSettings(
  before: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(patch)) {
    if (to === undefined) continue;
    const from = before[key];
    if (sameValue(from, to)) continue;
    changes[key] = { from: from ?? null, to };
  }
  return changes;
}

function sameValue(from: unknown, to: unknown): boolean {
  const asNumbers = [from, to].map((v) => (v === null || v === undefined || v === '' ? NaN : Number(v)));
  if (asNumbers.every(Number.isFinite)) return asNumbers[0] === asNumbers[1];
  // Dates arrive as `Date` from Zod's coercion and as a string from Postgres.
  if (from instanceof Date || to instanceof Date) {
    return asIso(from) === asIso(to);
  }
  return String(from ?? '') === String(to ?? '');
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = value === null || value === undefined ? NaN : Date.parse(String(value));
  return Number.isNaN(parsed) ? String(value ?? '') : new Date(parsed).toISOString();
}

/**
 * Writes to `admin_audit_log`, and reads it back.
 *
 * **`record` takes the caller's transaction and is meant to run inside it.**
 * An audit entry for a change that rolled back is a lie, and a change that
 * committed without its entry is the gap this table exists to close; the only
 * way to have neither is one transaction. That is also why nothing here catches
 * its own errors — a failed audit write must take the action down with it.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(entry: AuditEntry, tx: DbOrTx = this.db): Promise<void> {
    await tx.insert(adminAuditLog).values({
      actorId: entry.actorId,
      actorName: await this.actorName(entry.actorId, tx),
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId ?? null,
      subjectLabel: entry.subjectLabel ?? null,
      reason: entry.reason ?? null,
      // An empty diff is stored as null rather than `{}`: "they saved the form
      // and nothing moved" and "we recorded no detail" should not read alike.
      changes: entry.changes && Object.keys(entry.changes).length > 0 ? entry.changes : null,
    });
  }

  /**
   * Snapshotted rather than joined at read time — see the table's own note. The
   * fallback is the uuid, which is still an answer to "who": an administrator
   * with no profile row cannot have passed `AdminGuard`, so in practice this
   * only fires if the row is deleted between the guard and the write.
   */
  private async actorName(actorId: string, tx: DbOrTx): Promise<string> {
    const [row] = await tx
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, actorId))
      .limit(1);
    return row?.fullName ?? actorId;
  }

  async list(query: AuditQuery): Promise<Page<unknown>> {
    const conditions: SQL[] = [];
    if (query.action) conditions.push(eq(adminAuditLog.action, query.action));
    if (query.subjectType) conditions.push(eq(adminAuditLog.subjectType, query.subjectType));
    if (query.subjectId) conditions.push(eq(adminAuditLog.subjectId, query.subjectId));
    if (query.actorId) conditions.push(eq(adminAuditLog.actorId, query.actorId));
    if (query.since) conditions.push(gte(adminAuditLog.createdAt, query.since));
    if (query.until) conditions.push(lte(adminAuditLog.createdAt, query.until));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [counted]] = await Promise.all([
      this.db
        .select()
        .from(adminAuditLog)
        .where(where)
        // Newest first, then by id: `created_at` alone is not unique enough to
        // page on, and two entries in the same millisecond would otherwise be
        // free to swap between page 1 and page 2.
        .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(adminAuditLog).where(where),
    ]);

    return { items, total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  }
}
