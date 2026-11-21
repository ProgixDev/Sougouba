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
import { listAdmins, listRoles, type AdminAccount, type AdminRole } from '@/lib/api/admins';
import { listAudit, type AuditEntry } from '@/lib/api/audit';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAdmin } from '@/lib/permissions';

/** Same wording as the audit page, for the handful of actions shown here. */
function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    'vendor.approve': 'Commerce approuvé',
    'vendor.reject': 'Commerce refusé',
    'vendor.suspend': 'Commerce suspendu',
    'courier.approve': 'Livreur approuvé',
    'courier.reject': 'Livreur refusé',
    'courier.suspend': 'Livreur suspendu',
    'user.block': 'Compte bloqué',
    'user.unblock': 'Compte débloqué',
    'dispute.resolve': 'Litige résolu',
    'courier_issue.resolve': 'Incident résolu',
    'order.refund': 'Commande remboursée',
    'settings.update': 'Paramètres modifiés',
    'specialty.create': 'Spécialité ajoutée',
    'specialty.update': 'Spécialité modifiée',
    'support.reply': 'Réponse au support',
    'support.resolve': 'Support résolu',
    'review.moderate': 'Avis modéré',
    'coupon.deactivate': 'Code promo désactivé',
    'product.hide': 'Produit masqué',
    'product.unhide': 'Produit réaffiché',
    'admin.create': 'Administrateur ajouté',
    'admin.revoke': 'Administrateur retiré',
    'admin.role_change': 'Rôle changé',
    'role.create': 'Rôle créé',
    'role.update': 'Rôle modifié',
    'role.delete': 'Rôle supprimé',
  };
  return labels[action] ?? action;
}

/**
 * One administrator: who they are, their role and what it allows, and what
 * they have done — their own lines in the audit log — plus what was done to
 * their access (added, role changed).
 */
export default function AdminDetailPage() {
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
        <Text variant="title">Administrateur introuvable</Text>
        <Text variant="body" tone="muted" className="mt-1">
          Cette personne n’a peut-être plus accès au tableau de bord.
        </Text>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Administrateurs', href: '/admins' }, { label: admin.fullName }]} />

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 font-display text-[1.1rem] font-bold text-forest-700 dark:bg-forest-900 dark:text-forest-200">
          {admin.fullName.slice(0, 1) || 'A'}
        </div>
        <div>
          <Text as="h1" variant="title">
            {admin.fullName}
          </Text>
          <Badge tone={admin.role?.slug === 'owner' ? 'secondary' : 'neutral'}>{admin.role?.name ?? '—'}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5">
          <Text variant="subtitle">Compte</Text>
          <Field icon={Mail} label="Courriel" value={admin.email ?? '—'} />
          <Field icon={Clock} label="Dernière connexion" value={admin.lastSignInAt ? formatDateTime(admin.lastSignInAt) : 'Jamais connecté'} />
          <Field icon={Star} label="Membre depuis" value={admin.memberSince ? formatDate(admin.memberSince) : '—'} />
        </Card>

        <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-primary" />
            <Text variant="subtitle">Rôle : {admin.role?.name ?? '—'}</Text>
          </div>
          {role ? (
            <>
              <Text variant="caption" tone="muted">
                {role.description}
              </Text>
              <div className="flex flex-wrap gap-1.5">
                {role.permissions.map((p) => (
                  <span key={p} className="rounded-full bg-muted px-2.5 py-1 font-mono text-[0.6875rem]">
                    {p}
                  </span>
                ))}
              </div>
              <Link href="/admins?tab=roles" className="font-sans text-[0.8125rem] font-semibold text-primary hover:underline">
                Voir tous les rôles →
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
          <Timeline title="Actions récentes" entries={done} empty="Aucune action enregistrée." />
          <Timeline title="Historique de l’accès" entries={history} empty="Aucun changement enregistré." />
        </div>
      ) : (
        <Text variant="caption" tone="muted">
          L’activité de cette personne est visible avec la permission « Consulter le journal ».
        </Text>
      )}
    </div>
  );
}

function Timeline({ title, entries, empty }: { title: string; entries: AuditEntry[] | null; empty: string }) {
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
                  {[e.subjectLabel, e.reason ? `« ${e.reason} »` : null, title === 'Historique de l’accès' ? `par ${e.actorName}` : null]
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
  return (
    <div className="flex gap-2.5">
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
