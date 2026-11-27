'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Mail, ShieldCheck, Star, Clock } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/data/Skeleton';
import { listAdmins, listRoles, roleDescription, roleName, type AdminAccount, type AdminRole } from '@/lib/api/admins';
import { listAudit, type AuditEntry } from '@/lib/api/audit';
import { formatDate, formatDateTime } from '@/lib/format';
import { t, useLocale } from '@/lib/i18n';
import { useAdmin } from '@/lib/permissions';

/** Same wording as the audit page (the `audit` dictionary), for the handful of actions shown here. */
function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    'vendor.approve': t('audit.actions.vendor_approve'),
    'vendor.reject': t('audit.actions.vendor_reject'),
    'vendor.suspend': t('audit.actions.vendor_suspend'),
    'courier.approve': t('audit.actions.courier_approve'),
    'courier.reject': t('audit.actions.courier_reject'),
    'courier.suspend': t('audit.actions.courier_suspend'),
    'user.block': t('audit.actions.user_block'),
    'user.unblock': t('audit.actions.user_unblock'),
    'dispute.resolve': t('audit.actions.dispute_resolve'),
    'courier_issue.resolve': t('audit.actions.courier_issue_resolve'),
    'order.refund': t('audit.actions.order_refund'),
    'order.receipt_resend': t('audit.actions.order_receipt_resend'),
    'settings.update': t('audit.actions.settings_update'),
    'specialty.create': t('audit.actions.specialty_create'),
    'specialty.update': t('audit.actions.specialty_update'),
    'support.reply': t('audit.actions.support_reply'),
    'support.resolve': t('audit.actions.support_resolve'),
    'review.moderate': t('audit.actions.review_moderate'),
    'coupon.deactivate': t('audit.actions.coupon_deactivate'),
    'product.hide': t('audit.actions.product_hide'),
    'product.unhide': t('audit.actions.product_unhide'),
    'admin.create': t('audit.actions.admin_create'),
    'admin.revoke': t('audit.actions.admin_revoke'),
    'admin.role_change': t('audit.actions.admin_role_change'),
    'role.create': t('audit.actions.role_create'),
    'role.update': t('audit.actions.role_update'),
    'role.delete': t('audit.actions.role_delete'),
  };
  return labels[action] ?? action;
}

/**
 * One administrator: who they are, their role and what it allows, and what
 * they have done — their own lines in the audit log — plus what was done to
 * their access (added, role changed).
 */
export default function AdminDetailPage() {
  useLocale();
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
  const [admin, setAdmin] = useState<AdminAccount | null | undefined>(undefined);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [done, setDone] = useState<AuditEntry[] | null>(null);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    Promise.all([listAdmins(), listRoles()])
      .then(([admins, roles]) => {
        const found = admins.find((a) => a.id === id) ?? null;
        setAdmin(found);
        setRole(roles.find((r) => r.id === found?.role?.id) ?? null);
      })
      .catch(() => setAdmin(null));
    // The audit log needs its own permission; without it, this part stays empty.
    if (can('audit.view')) {
      listAudit({ actorId: id }, 0, 20)
        .then((p) => setDone(p.items))
        .catch(() => setDone([]));
      listAudit({ subjectType: 'user', subjectId: id }, 0, 20)
        .then((p) => setHistory(p.items.filter((e) => e.action.startsWith('admin.'))))
        .catch(() => setHistory([]));
    }
  }, [id, can]);

  if (admin === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  if (admin === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">{t('admins.detail.notFoundTitle')}</Text>
        <Text variant="body" tone="muted" className="mt-1">
          {t('admins.detail.notFoundBody')}
        </Text>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: t('admins.title'), href: '/admins' }, { label: admin.fullName }]} />

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 font-display text-[1.1rem] font-bold text-forest-700 dark:bg-forest-900 dark:text-forest-200">
          {admin.fullName.slice(0, 1) || 'A'}
        </div>
        <div>
          <Text as="h1" variant="title">
            {admin.fullName}
          </Text>
          <Badge tone={admin.role?.slug === 'owner' ? 'secondary' : 'neutral'}>{admin.role ? roleName(admin.role) : '—'}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5">
          <Text variant="subtitle">{t('admins.detail.account')}</Text>
          <Field icon={Mail} label={t('admins.detail.email')} value={admin.email ?? '—'} />
          <Field
            icon={Clock}
            label={t('admins.shared.lastSignIn')}
            value={admin.lastSignInAt ? formatDateTime(admin.lastSignInAt) : t('admins.shared.neverSignedIn')}
          />
          <Field icon={Star} label={t('admins.shared.memberSince')} value={admin.memberSince ? formatDate(admin.memberSince) : '—'} />
        </Card>

        <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-primary" />
            <Text variant="subtitle">{t('admins.detail.roleTitle', { role: admin.role ? roleName(admin.role) : '—' })}</Text>
          </div>
          {role ? (
            <>
              <Text variant="caption" tone="muted">
                {roleDescription(role)}
              </Text>
              <div className="flex flex-wrap gap-1.5">
                {role.permissions.map((p) => (
                  <span key={p} className="rounded-full bg-muted px-2.5 py-1 font-mono text-[0.6875rem]">
                    {p}
                  </span>
                ))}
              </div>
              <Link href="/admins?tab=roles" className="font-sans text-[0.8125rem] font-semibold text-primary hover:underline">
                {t('admins.detail.allRoles')}
              </Link>
            </>
          ) : (
            <Text variant="body" tone="muted">
              —
            </Text>
          )}
        </Card>
      </div>

      {can('audit.view') ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Timeline title={t('admins.detail.recentActions')} entries={done} empty={t('admins.detail.noActions')} />
          <Timeline title={t('admins.detail.accessHistory')} entries={history} empty={t('admins.detail.noHistory')} />
        </div>
      ) : (
        <Text variant="caption" tone="muted">
          {t('admins.detail.activityHidden')}
        </Text>
      )}
    </div>
  );
}

function Timeline({ title, entries, empty }: { title: string; entries: AuditEntry[] | null; empty: string }) {
  useLocale();
  return (
    <Card className="p-5">
      <Text variant="subtitle" className="mb-3">
        {title}
      </Text>
      {entries === null ? (
        <Skeleton className="h-24" />
      ) : entries.length === 0 ? (
        <Text variant="body" tone="muted">
          {empty}
        </Text>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <Text variant="body" className="font-medium">
                  {actionLabel(e.action)}
                </Text>
                <Text variant="caption" tone="muted" className="line-clamp-1">
                  {[
                    e.subjectLabel,
                    e.reason ? t('admins.detail.quotedReason', { reason: e.reason }) : null,
                    title === t('admins.detail.accessHistory') ? t('admins.detail.byActor', { name: e.actorName }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </div>
              <Text variant="caption" tone="muted" className="whitespace-nowrap">
                {formatDateTime(e.createdAt)}
              </Text>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  useLocale();
  return (
    <div className="flex flex-wrap gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="body" className="font-medium">
          {value}
        </Text>
      </div>
    </div>
  );
}
