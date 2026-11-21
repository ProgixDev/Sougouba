import { Inject, Injectable } from '@nestjs/common';

import type { Page } from '../catalog/dto/query.dto.js';
import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import type { AuditQuery } from './dto/admin.dto.js';

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
  | 'order.refund'
  | 'user.block'
  | 'user.unblock'
  | 'specialty.create'
  | 'specialty.update'
  | 'support.reply'
  | 'support.resolve'
  | 'review.moderate'
  | 'coupon.deactivate'
  | 'product.hide'
  | 'product.unhide'
  | 'admin.create'
  | 'admin.revoke'
  | 'admin.role_change'
  | 'role.create'
  | 'role.update'
  | 'role.delete';

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
  'user.block',
  'user.unblock',
  'specialty.create',
  'specialty.update',
  'support.reply',
  'support.resolve',
  'review.moderate',
  'coupon.deactivate',
  'product.hide',
  'product.unhide',
  'admin.create',
  'admin.revoke',
  'admin.role_change',
  'role.create',
  'role.update',
  'role.delete',
];

export type AuditSubject = 'vendor' | 'courier' | 'order' | 'dispute' | 'courier_issue' | 'settings' | 'user' | 'specialty' | 'support' | 'review' | 'coupon' | 'product' | 'admin_role';

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

  // ⚠️ `record()` is gone, deliberately, and must not come back as a plain
  // insert.
  //
  // It used to take the caller's transaction and run inside it, because an
  // audit entry for a change that rolled back is a lie and a change that
  // committed without its entry is the gap this table exists to close. There
  // is no transaction to pass across PostgREST, so every audited action moved
  // into a `plpgsql` function that writes the change and calls
  // `private.admin_audit_write` in the same transaction.
  //
  // A `record()` here would be a second, *separate* HTTP request — exactly the
  // split the original design refused. If a new admin action needs auditing,
  // it needs a function, not a call to this class. `audit.spec.ts` still
  // asserts one audited action per mutating route, so a route without one
  // fails the build.

  async list(query: AuditQuery): Promise<Page<unknown>> {
    let q = this.db.from('admin_audit_log').select('*', { count: 'exact' });
    if (query.action) q = q.eq('action', query.action);
    if (query.subjectType) q = q.eq('subject_type', query.subjectType);
    if (query.subjectId) q = q.eq('subject_id', query.subjectId);
    if (query.actorId) q = q.eq('actor_id', query.actorId);
    if (query.since) q = q.gte('created_at', query.since.toISOString());
    if (query.until) q = q.lte('created_at', query.until.toISOString());

    const { data, count, error } = await q
      // Newest first, then by id: `created_at` alone is not unique enough to
      // page on, and two entries in the same millisecond would otherwise be
      // free to swap between page 1 and page 2.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw new Error(`audit log read failed: ${error.code}`);

    // `changes` is caller-authored JSON whose keys are column names by
    // definition — `camelize` leaves it alone, see `db/case.ts`.
    return {
      items: camelize<unknown[]>(data ?? []),
      total: count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
