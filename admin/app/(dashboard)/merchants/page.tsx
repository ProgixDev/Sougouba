'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Search, Star, Store, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Avatar, BarSeries, Breakdown, KpiCard, KpiGrid, PageHeader, Ranking, SectionCard } from '@/components/insights/Insights';
import { formatHours, getVendorInsights, shortDay, type VendorInsights } from '@/lib/api/insights';
import { listVendors } from '@/lib/api/vendors';
import { formatCad } from '@/lib/format';
import { vendorStatusMeta } from '@/lib/statusMeta';
import { formatDate } from '@/lib/format';
import type { AdminVendorListItem, AdminVendorStatus } from '@/lib/types';

const TABS: { key: AdminVendorStatus; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Approuvés' },
  { key: 'suspended', label: 'Suspendus' },
  // `rejected` is its own terminal state in the API — the mock folded it into
  // "suspended", which hid every refused application from the back office.
  { key: 'rejected', label: 'Refusés' },
];

export default function MerchantsPage() {
  const router = useRouter();
  const [all, setAll] = useState<AdminVendorListItem[] | null>(null);
  const [tab, setTab] = useState<AdminVendorStatus>('pending');
  const [search, setSearch] = useState('');

  const [insights, setInsights] = useState<VendorInsights | null>(null);

  useEffect(() => {
    listVendors().then(setAll);
    getVendorInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  const counts = useMemo(() => {
    const base: Record<string, number> = { pending: 0, approved: 0, suspended: 0, rejected: 0 };
    for (const v of all ?? []) base[v.status] += 1;
    return base;
  }, [all]);

  const rows = useMemo(() => {
    let list = (all ?? []).filter((v) => v.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q));
    }
    return list;
  }, [all, tab, search]);

  const columns: Column<AdminVendorListItem>[] = [
    {
      key: 'name',
      header: 'Commerce',
      sortable: true,
      sortValue: (v) => v.name,
      render: (v) => (
        <div className="flex items-center gap-3">
          <Avatar name={v.name} />
          <div>
            <Text variant="body" className="font-semibold">
              {v.name}
            </Text>
            <Text variant="caption" tone="muted">
              {v.ownerName}
            </Text>
          </div>
        </div>
      ),
    },
    {
      key: 'vendorType',
      header: 'Secteur',
      render: (v) => <Text variant="body">{v.vendorType === 'restaurant' ? 'Restaurant' : 'Épicerie'}</Text>,
    },
    { key: 'city', header: 'Ville', sortable: true, sortValue: (v) => v.city, render: (v) => <Text variant="body">{v.city}</Text> },
    {
      key: 'submitted',
      header: 'Soumis',
      sortable: true,
      sortValue: (v) => v.submittedAt ?? '',
      render: (v) => (
        <Text variant="body" tone="muted">
          {v.submittedAt ? formatDate(v.submittedAt) : '—'}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (v) => {
        const meta = vendorStatusMeta(v.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={Store} title="Commerçants" description="File d’approbation, annuaire des boutiques et leur activité." />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Store}
          label="Boutiques en ligne"
          value={String(insights?.byStatus.approved ?? 0)}
          hint={`${insights?.new30 ?? 0} inscriptions sur 30 jours`}
        />
        <KpiCard
          loading={!insights}
          icon={Clock}
          tone="mustard"
          label="Dossiers en attente"
          value={String(insights?.byStatus.pending ?? 0)}
          hint={`Approbation en ${formatHours(insights?.avgApprovalHours)} en moyenne`}
        />
        <KpiCard
          loading={!insights}
          icon={TrendingUp}
          tone="forest"
          label="Ventes des boutiques · 30 j"
          value={formatCad(insights?.sales30 ?? 0)}
          hint={`${insights?.orders30 ?? 0} commandes, hors annulées`}
        />
        <KpiCard
          loading={!insights}
          icon={Star}
          tone="terracotta"
          label="Note moyenne"
          value={insights?.avgRating ? `${insights.avgRating.toLocaleString('fr-CA')} / 5` : '—'}
          hint="Boutiques approuvées ayant des avis"
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="Inscriptions" subtitle="Nouvelles boutiques par semaine, 8 semaines">
            <BarSeries data={insights.signupsByWeek.map((w) => ({ label: shortDay(w.week), value: w.count }))} />
          </SectionCard>
          <SectionCard title="Répartition" subtitle="Boutiques en ligne par secteur, et tous les dossiers par statut">
            <Breakdown
              items={[
                { label: 'Épiceries', value: insights.byType.grocery ?? 0 },
                { label: 'Restaurants', value: insights.byType.restaurant ?? 0 },
              ]}
            />
            <Breakdown
              items={[
                { label: 'Approuvés', value: insights.byStatus.approved ?? 0 },
                { label: 'En attente', value: insights.byStatus.pending ?? 0 },
                { label: 'Suspendus', value: insights.byStatus.suspended ?? 0 },
                { label: 'Refusés', value: insights.byStatus.rejected ?? 0 },
              ]}
            />
          </SectionCard>
          <SectionCard title="Meilleures ventes · 30 j" subtitle="Sous-total des commandes, hors annulées">
            <Ranking
              items={insights.top.map((t) => ({
                id: t.id,
                label: t.name,
                value: Number(t.sales),
                display: `${formatCad(Number(t.sales))} · ${t.orders} cmd`,
                href: `/merchants/${t.id}`,
              }))}
            />
          </SectionCard>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full border border-border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`cursor-pointer rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
                tab === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un commerce ou une ville…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows}
          keyField={(v) => v.id}
          onRowClick={(v) => router.push(`/merchants/${v.id}`)}
          loading={all === null}
          emptyIcon={Store}
          emptyTitle="Aucun commerce"
          emptyDescription="Aucun commerce ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
