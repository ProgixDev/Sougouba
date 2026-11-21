'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Search, ShoppingBag, Store, UserPlus, Users as UsersIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Avatar, BarSeries, Breakdown, KpiCard, KpiGrid, PageHeader, SectionCard } from '@/components/insights/Insights';
import { getUserInsights, shortDay, type UserInsights } from '@/lib/api/insights';
import { listUsers } from '@/lib/api/users';
import { formatDate } from '@/lib/format';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { useToast } from '@/components/Toast';
import type { AdminUserListItem, UserRole } from '@/lib/types';

const ROLE_LABELS: Record<string, string> = { customer: 'Client', business: 'Commerçant', courier: 'Livreur', admin: 'Administrateur' };
const ROLE_TABS: { key: UserRole | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'customer', label: 'Clients' },
  { key: 'business', label: 'Commerçants' },
  { key: 'courier', label: 'Livreurs' },
];

export default function UsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');
  const [insights, setInsights] = useState<UserInsights | null>(null);

  useEffect(() => {
    getUserInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  // Debounced — this reaches the network per keystroke, and the /admin
  // budget is 120 requests a minute.
  const debouncedSearch = useDebounced(search);

  // Role and search filter server-side. Searching by email only works at all
  // because the API joins `auth.users` — `profiles` does not carry it.
  const list = usePagedList<AdminUserListItem>(
    ({ offset, limit, sort }) =>
      listUsers(
        { role: role === 'all' ? undefined : role, search: debouncedSearch },
        { offset, limit, sort: sort?.key, dir: sort?.dir }
      ),
    `${role}|${debouncedSearch}`
  );
  useEffect(() => {
    if (list.error) toast('error', list.error);
  }, [list.error, toast]);

  const columns: Column<AdminUserListItem>[] = [
    {
      key: 'name',
      header: 'Nom',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.fullName || '?'} />
          <Text variant="body" className="font-semibold">
            {u.fullName}
          </Text>
        </div>
      ),
    },
    { key: 'email', header: 'Courriel', render: (u) => <Text variant="body" tone="muted">{u.email ?? '—'}</Text> },
    {
      key: 'role',
      header: 'Rôle',
      render: (u) => <Badge tone={u.role === 'business' ? 'secondary' : u.role === 'courier' ? 'primary' : 'neutral'}>{u.role ? ROLE_LABELS[u.role] : '—'}</Badge>,
    },
    {
      key: 'member_since',
      header: 'Inscrit',
      sortable: true,
      render: (u) => (
        <Text variant="body" tone="muted">
          {formatDate(u.memberSince)}
        </Text>
      ),
    },
    {
      key: 'last_seen',
      header: 'Dernière connexion',
      sortable: true,
      render: (u) => (
        <Text variant="body" tone="muted">
          {u.lastSignInAt ? formatDate(u.lastSignInAt) : '—'}
        </Text>
      ),
    },
    {
      key: 'linked',
      header: 'Lié à',
      render: (u) => (
        <Text variant="caption" tone="muted">
          {u.vendorId ?? u.courierId ?? '—'}
        </Text>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={UsersIcon} title="Utilisateurs" description="Tous les comptes de la plateforme : clients, commerçants et livreurs." />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={ShoppingBag}
          label="Clients"
          value={String(insights?.byRole.customer ?? 0)}
          hint={`${insights?.withOrders ?? 0} ont déjà commandé`}
        />
        <KpiCard
          loading={!insights}
          icon={UserPlus}
          tone="forest"
          label="Nouveaux comptes · 30 j"
          value={String(insights?.new30 ?? 0)}
          hint="Tous rôles confondus"
        />
        <KpiCard
          loading={!insights}
          icon={Store}
          tone="mustard"
          label="Commerçants · livreurs"
          value={`${insights?.byRole.business ?? 0} · ${insights?.byRole.courier ?? 0}`}
          hint={`${insights?.byRole.none ?? 0} comptes sans rôle choisi`}
        />
        <KpiCard
          loading={!insights}
          icon={Ban}
          tone="terracotta"
          label="Comptes bloqués"
          value={String(insights?.blocked ?? 0)}
          hint="Connexion et paiement refusés"
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="Inscriptions" subtitle="Nouveaux comptes par semaine, 8 semaines" className="lg:col-span-2">
            <BarSeries data={insights.signupsByWeek.map((w) => ({ label: shortDay(w.week), value: w.count }))} />
          </SectionCard>
          <SectionCard title="Par rôle">
            <Breakdown
              items={[
                { label: 'Clients', value: insights.byRole.customer ?? 0 },
                { label: 'Commerçants', value: insights.byRole.business ?? 0 },
                { label: 'Livreurs', value: insights.byRole.courier ?? 0 },
                { label: 'Sans rôle', value: insights.byRole.none ?? 0 },
                { label: 'Administrateurs', value: insights.byRole.admin ?? 0 },
              ]}
            />
          </SectionCard>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full border border-border bg-card p-1">
          {ROLE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRole(t.key)}
              className={`cursor-pointer rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
                role === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou un courriel…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(u) => u.id}
          onRowClick={(u) => router.push(`/users/${u.id}`)}
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
          emptyIcon={UsersIcon}
          emptyTitle="Aucun utilisateur"
          emptyDescription="Aucun utilisateur ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
