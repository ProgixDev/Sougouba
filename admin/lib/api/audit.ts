import { apiGet, type Page } from './client';

/** What an audit line is about — `admin_audit_log.subject_type`. */
export type AuditSubject = 'vendor' | 'courier' | 'order' | 'dispute' | 'courier_issue' | 'settings' | 'user';

/** One line of `GET /admin/audit-log`, newest first. Written by the database, never edited. */
export interface AuditEntry {
  id: string;
  actorId: string;
  /** Snapshotted when the action happened — an administrator can be renamed later. */
  actorName: string;
  /** `vendor.approve`, `user.block`, … — see `AdminAction` in the API. */
  action: string;
  subjectType: AuditSubject;
  subjectId: string | null;
  subjectLabel: string | null;
  reason: string | null;
  /** `{ field: { from, to } }`, or null when nothing beyond the action itself was recorded. */
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

export interface AuditFilters {
  subjectType?: AuditSubject;
  subjectId?: string;
}

/** One page of the log. The API caps `limit`; "load more" asks for the next `offset`. */
export async function listAudit(filters: AuditFilters = {}, offset = 0, limit = 50): Promise<Page<AuditEntry>> {
  return apiGet<Page<AuditEntry>>('/admin/audit-log', { ...filters, offset, limit });
}
