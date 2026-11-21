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
import { PageHeader } from '@/components/insights/Insights';

const SUBJECT_TABS: { key: AuditSubject | 'all'; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'vendor', label: 'Commerçants' },
  { key: 'courier', label: 'Livreurs' },
  { key: 'user', label: 'Utilisateurs' },
  { key: 'order', label: 'Commandes' },
  { key: 'dispute', label: 'Litiges' },
  { key: 'courier_issue', label: 'Incidents' },
  { key: 'support', label: 'Support' },
  { key: 'review', label: 'Avis' },
  { key: 'coupon', label: 'Codes promo' },
  { key: 'product', label: 'Produits' },
  { key: 'admin_role', label: 'Rôles' },
  { key: 'specialty', label: 'Spécialités' },
  { key: 'settings', label: 'Paramètres' },
];

/** Every `AdminAction` the API audits, worded for a reader. An unknown one shows as written. */
const ACTION_LABELS: Record<string, { label: string; tone: Tone }> = {
  'vendor.approve': { label: 'Commerce approuvé', tone: 'success' },
  'vendor.reject': { label: 'Commerce refusé', tone: 'destructive' },
  'vendor.suspend': { label: 'Commerce suspendu', tone: 'destructive' },
  'courier.approve': { label: 'Livreur approuvé', tone: 'success' },
  'courier.reject': { label: 'Livreur refusé', tone: 'destructive' },
  'courier.suspend': { label: 'Livreur suspendu', tone: 'destructive' },
  'user.block': { label: 'Compte bloqué', tone: 'destructive' },
  'user.unblock': { label: 'Compte débloqué', tone: 'success' },
  'dispute.resolve': { label: 'Litige résolu', tone: 'primary' },
  'courier_issue.resolve': { label: 'Incident résolu', tone: 'primary' },
  'order.refund': { label: 'Commande remboursée', tone: 'warning' },
  'settings.update': { label: 'Paramètres modifiés', tone: 'secondary' },
  'specialty.create': { label: 'Spécialité ajoutée', tone: 'success' },
  'specialty.update': { label: 'Spécialité modifiée', tone: 'secondary' },
  'support.reply': { label: 'Réponse au support', tone: 'primary' },
  'support.resolve': { label: 'Support résolu', tone: 'success' },
  'review.moderate': { label: 'Avis modéré', tone: 'warning' },
  'coupon.deactivate': { label: 'Code promo désactivé', tone: 'destructive' },
  'product.hide': { label: 'Produit masqué', tone: 'destructive' },
  'product.unhide': { label: 'Produit réaffiché', tone: 'success' },
  'admin.create': { label: 'Administrateur ajouté', tone: 'primary' },
  'admin.revoke': { label: 'Administrateur retiré', tone: 'destructive' },
  'admin.role_change': { label: 'Rôle changé', tone: 'warning' },
  'role.create': { label: 'Rôle créé', tone: 'primary' },
  'role.update': { label: 'Rôle modifié', tone: 'warning' },
  'role.delete': { label: 'Rôle supprimé', tone: 'destructive' },
};

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
  // Admin-access lines open the administrator, not the plain user page.
  if (entry.subjectType === 'user' && entry.action.startsWith('admin.') && entry.subjectId) return `/admins/${entry.subjectId}`;
  if (!entry.subjectId) return null;
  const base: Record<Exclude<AuditSubject, 'settings' | 'specialty' | 'review' | 'coupon' | 'product' | 'admin_role'>, string> = {
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
  return Object.entries(changes).map(([field, { from, to }]) => `${field} : ${show(from)} → ${show(to)}`);
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
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
      header: 'Date',
      render: (e) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(e.createdAt)}
        </Text>
      ),
    },
    {
      key: 'actor',
      header: 'Administrateur',
      render: (e) => (
        <Text variant="body" className="font-semibold">
          {e.actorName}
        </Text>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (e) => {
        const meta = ACTION_LABELS[e.action] ?? { label: e.action, tone: 'neutral' as Tone };
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      },
    },
    {
      key: 'subject',
      header: 'Concerne',
      render: (e) => (
        <Text variant="body">{e.subjectType === 'settings' ? 'Paramètres de la plateforme' : (e.subjectLabel ?? '—')}</Text>
      ),
    },
    {
      key: 'details',
      header: 'Motif et changements',
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
            {e.reason && <Text variant="body">« {e.reason} »</Text>}
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
        title="Journal d’audit"
        description="Chaque décision prise depuis ce tableau de bord : qui, quand, sur quoi, et pourquoi. Il ne peut pas être modifié."
        actions={
          <span className="rounded-full bg-muted px-3 py-1.5 font-sans text-[0.8125rem] font-semibold tabular">
            {total} entrée{total > 1 ? 's' : ''}
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
          emptyTitle="Aucune entrée"
          emptyDescription="Aucune décision n’a encore été enregistrée pour ce filtre."
        />
      </Card>

    </div>
  );
}
