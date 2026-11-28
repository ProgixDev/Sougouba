'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge, type Tone } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { useToast } from '@/components/Toast';
import { listAudit, type AuditEntry, type AuditSubject } from '@/lib/api/audit';
import { usePagedList } from '@/lib/usePagedList';
import { formatDateTime } from '@/lib/format';
// `t` is already the name of a tab in the list below.
import { t as translate, lazy, useLocale } from '@/lib/i18n';
import { PageHeader } from '@/components/insights/Insights';

const SUBJECT_TABS: { key: AuditSubject | 'all'; label: string }[] = lazy(() => ([
  { key: 'all', label: translate('audit.tabs.all') },
  { key: 'vendor', label: translate('audit.tabs.vendor') },
  { key: 'courier', label: translate('audit.tabs.courier') },
  { key: 'user', label: translate('audit.tabs.user') },
  { key: 'order', label: translate('audit.tabs.order') },
  { key: 'dispute', label: translate('audit.tabs.dispute') },
  { key: 'courier_issue', label: translate('audit.tabs.courierIssue') },
  { key: 'support', label: translate('audit.tabs.support') },
  { key: 'review', label: translate('audit.tabs.review') },
  { key: 'coupon', label: translate('audit.tabs.coupon') },
  { key: 'product', label: translate('audit.tabs.product') },
  { key: 'admin_role', label: translate('audit.tabs.adminRole') },
  { key: 'specialty', label: translate('audit.tabs.specialty') },
  { key: 'payout', label: translate('audit.tabs.payout') },
  { key: 'settings', label: translate('audit.tabs.settings') },
]));

/**
 * Every `AdminAction` the API audits, worded for a reader. An unknown one shows as written.
 * The words are in the `audit` dictionary, keyed by the action with its dot as an underscore.
 */
const ACTION_LABELS: Record<string, { label: string; tone: Tone }> = lazy(() => ({
  'vendor.approve': { label: translate('audit.actions.vendor_approve'), tone: 'success' },
  'vendor.reject': { label: translate('audit.actions.vendor_reject'), tone: 'destructive' },
  'vendor.suspend': { label: translate('audit.actions.vendor_suspend'), tone: 'destructive' },
  // Not an administrator's: the platform moves a shop on its subscription alone, and logs it here.
  'vendor.subscription_hold': { label: translate('audit.actions.vendor_subscription_hold'), tone: 'warning' },
  'vendor.subscription_release': { label: translate('audit.actions.vendor_subscription_release'), tone: 'success' },
  'courier.approve': { label: translate('audit.actions.courier_approve'), tone: 'success' },
  'courier.reject': { label: translate('audit.actions.courier_reject'), tone: 'destructive' },
  'courier.suspend': { label: translate('audit.actions.courier_suspend'), tone: 'destructive' },
  'user.block': { label: translate('audit.actions.user_block'), tone: 'destructive' },
  'user.unblock': { label: translate('audit.actions.user_unblock'), tone: 'success' },
  'dispute.resolve': { label: translate('audit.actions.dispute_resolve'), tone: 'primary' },
  'courier_issue.resolve': { label: translate('audit.actions.courier_issue_resolve'), tone: 'primary' },
  'order.refund': { label: translate('audit.actions.order_refund'), tone: 'warning' },
  'order.cancel': { label: translate('audit.actions.order_cancel'), tone: 'destructive' },
  'order.receipt_resend': { label: translate('audit.actions.order_receipt_resend'), tone: 'secondary' },
  'settings.update': { label: translate('audit.actions.settings_update'), tone: 'secondary' },
  'specialty.create': { label: translate('audit.actions.specialty_create'), tone: 'success' },
  'specialty.update': { label: translate('audit.actions.specialty_update'), tone: 'secondary' },
  'support.reply': { label: translate('audit.actions.support_reply'), tone: 'primary' },
  'support.resolve': { label: translate('audit.actions.support_resolve'), tone: 'success' },
  'review.moderate': { label: translate('audit.actions.review_moderate'), tone: 'warning' },
  'coupon.deactivate': { label: translate('audit.actions.coupon_deactivate'), tone: 'destructive' },
  'product.hide': { label: translate('audit.actions.product_hide'), tone: 'destructive' },
  'product.unhide': { label: translate('audit.actions.product_unhide'), tone: 'success' },
  'admin.create': { label: translate('audit.actions.admin_create'), tone: 'primary' },
  'admin.revoke': { label: translate('audit.actions.admin_revoke'), tone: 'destructive' },
  'admin.role_change': { label: translate('audit.actions.admin_role_change'), tone: 'warning' },
  'role.create': { label: translate('audit.actions.role_create'), tone: 'primary' },
  'role.update': { label: translate('audit.actions.role_update'), tone: 'warning' },
  'role.delete': { label: translate('audit.actions.role_delete'), tone: 'destructive' },
  'payout.run': { label: translate('audit.actions.payout_run'), tone: 'warning' },
  'payout.pay_merchant': { label: translate('audit.actions.payout_pay_merchant'), tone: 'warning' },
}));

/** Where each kind of subject lives in this dashboard. Disputes and courier issues are keyed by their order. */
function subjectHref(entry: AuditEntry): string | null {
  if (entry.subjectType === 'settings') return '/settings';
  // One page lists them all; there is no page per specialty.
  if (entry.subjectType === 'specialty') return '/specialties';
  // A review is keyed by its order; coupons and products are moderated from one page.
  if (entry.subjectType === 'review') return entry.subjectId ? `/orders/${entry.subjectId}` : null;
  if (entry.subjectType === 'coupon') return '/moderation?tab=coupons';
  if (entry.subjectType === 'product') return '/moderation?tab=products';
  if (entry.subjectType === 'admin_role') return '/admins?tab=roles';
  if (entry.subjectType === 'payout') return '/payouts?tab=history';
  // Admin-access lines open the administrator, not the plain user page.
  if (entry.subjectType === 'user' && entry.action.startsWith('admin.') && entry.subjectId) return `/admins/${entry.subjectId}`;
  if (!entry.subjectId) return null;
  const base: Record<Exclude<AuditSubject, 'settings' | 'specialty' | 'review' | 'coupon' | 'product' | 'admin_role' | 'payout'>, string> = {
    vendor: '/merchants',
    courier: '/couriers',
    user: '/users',
    order: '/orders',
    dispute: '/disputes',
    courier_issue: '/courier-issues',
    support: '/support',
  };
  return `${base[entry.subjectType]}/${entry.subjectId}`;
}

/** `status: open → resolved`, one line per field. Values are shown as stored. */
function describeChanges(changes: AuditEntry['changes']): string[] {
  if (!changes) return [];
  return Object.entries(changes).map(([field, { from, to }]) => translate('audit.change', { field, from: show(from), to: show(to) }));
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? translate('audit.values.yes') : translate('audit.values.no');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * The back office's own history: who approved, suspended, blocked, refunded
 * or changed a setting, when, on what, and why.
 *
 * Read-only by construction — the table rejects updates and deletes at the
 * database (`private.reject_audit_log_mutation`), so there is nothing here to
 * edit. Paged with "load more" rather than numbered pages: the log is read
 * from the top, and its newest lines are the ones that matter.
 */
export default function AuditLogPage() {
  useLocale();
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState<AuditSubject | 'all'>('all');
  // Newest first, one page at a time from the database.
  const list = usePagedList<AuditEntry>(
    ({ offset, limit }) => listAudit({ subjectType: subject === 'all' ? undefined : subject }, offset, limit),
    subject
  );
  const total = list.total;
  useEffect(() => {
    if (list.error) toast('error', list.error);
  }, [list.error, toast]);

  const columns: Column<AuditEntry>[] = [
    {
      key: 'createdAt',
      header: translate('audit.columns.date'),
      render: (e) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(e.createdAt)}
        </Text>
      ),
    },
    {
      key: 'actor',
      header: translate('audit.columns.admin'),
      render: (e) => (
        <Text variant="body" className="font-semibold">
          {e.actorName}
        </Text>
      ),
    },
    {
      key: 'action',
      header: translate('audit.columns.action'),
      render: (e) => {
        const meta = ACTION_LABELS[e.action] ?? { label: e.action, tone: 'neutral' as Tone };
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
    },
    {
      key: 'subject',
      header: translate('audit.columns.subject'),
      render: (e) => (
        <Text variant="body">{e.subjectType === 'settings' ? translate('audit.platformSettings') : (e.subjectLabel ?? '—')}</Text>
      ),
    },
    {
      key: 'details',
      header: translate('audit.columns.details'),
      render: (e) => {
        const lines = describeChanges(e.changes);
        if (!e.reason && lines.length === 0) {
          return (
            <Text variant="caption" tone="muted">
              —
            </Text>
          );
        }
        return (
          <div className="flex max-w-md flex-col gap-0.5">
            {e.reason && <Text variant="body">{translate('audit.quotedReason', { reason: e.reason })}</Text>}
            {lines.map((line) => (
              <Text key={line} variant="caption" tone="muted">
                {line}
              </Text>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={ScrollText}
        title={translate('audit.title')}
        description={translate('audit.description')}
        actions={
          <span className="rounded-full bg-muted px-3 py-1.5 font-sans text-[0.8125rem] font-semibold tabular">
            {translate('audit.entries', { count: total })}
          </span>
        }
      />

      {/* One row that scrolls sideways: fourteen filters wrapped inside a pill
          made a two-line capsule. */}
      <div className="max-w-full self-start overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none]">
        <div className="flex w-max gap-1">
        {SUBJECT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubject(t.key)}
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
              subject === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(e) => e.id}
          onRowClick={(e) => {
            const href = subjectHref(e);
            if (href) router.push(href);
          }}
          loading={list.rows === null}
          server={{
            page: list.page,
            pageSize: list.pageSize,
            total: list.total,
            onPage: list.setPage,
            onPageSize: list.setPageSize,
            sort: list.sort,
            onSort: list.setSort,
          }}
          emptyIcon={ScrollText}
          emptyTitle={translate('audit.emptyTitle')}
          emptyDescription={translate('audit.emptyDescription')}
        />
      </Card>

    </div>
  );
}
