'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, Radio, Search, Star, Timer } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Avatar, BarSeries, Breakdown, KpiCard, KpiGrid, PageHeader, Ranking, SectionCard } from '@/components/insights/Insights';
import { listCouriers } from '@/lib/api/couriers';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { getCourierInsights, shortDay, type CourierInsights } from '@/lib/api/insights';
import { courierStatusMeta, VEHICLE_LABELS } from '@/lib/statusMeta';
import { formatCad, formatDate } from '@/lib/format';
import type { AdminCourierListItem, AdminCourierStatus } from '@/lib/types';

const TABS: { key: AdminCourierStatus; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Approuvés' },
  { key: 'suspended', label: 'Suspendus' },
  // Terminal in the API, and invisible in the mock, which folded it into
  // "suspended" — every refused application was hidden from the back office.
  { key: 'rejected', label: 'Refusés' },
];

export default function CouriersPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AdminCourierStatus>('pending');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const [insights, setInsights] = useState<CourierInsights | null>(null);

  useEffect(() => {
    getCourierInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  // One page at a time from the database — filtered, searched and sorted there.
  const list = usePagedList<AdminCourierListItem>(
    ({ offset, limit, sort }) =>
      listCouriers({ status: tab, search: debouncedSearch }, { offset, limit, sort: sort?.key, dir: sort?.dir }),
    `${tab}|${debouncedSearch}`
  );
  // Tab counts are whole-table counts, not the current page's.
  const counts: Record<string, number> = insights?.byStatus ?? {};

  const columns: Column<AdminCourierListItem>[] = [
    {
      key: 'name',
      header: 'Livreur',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.fullName} />
          <Text variant="body" className="font-semibold">
            {c.fullName}
          </Text>
        </div>
      ),
    },
    { key: 'vehicle', header: 'Véhicule', render: (c) => <Text variant="body">{VEHICLE_LABELS[c.vehicle]}</Text> },
    { key: 'city', header: 'Ville', sortable: true, render: (c) => <Text variant="body">{c.city}</Text> },
    {
      key: 'date',
      header: 'Inscrit',
      sortable: true,
      render: (c) => (
        <Text variant="body" tone="muted">
          {formatDate(c.joinedAt)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (c) => {
        const meta = courierStatusMeta(c.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={Bike} title="Livreurs" description="File d’approbation, annuaire et activité de la flotte." />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Radio}
          label="En ligne maintenant"
          value={String(insights?.online ?? 0)}
          hint={`sur ${insights?.byStatus.approved ?? 0} livreurs approuvés`}
        />
        <KpiCard
          loading={!insights}
          icon={Bike}
          tone="forest"
          label="Livraisons · 30 j"
          value={String(insights?.deliveries30 ?? 0)}
          hint={`${formatCad(insights?.earnings30 ?? 0)} gagnés, pourboires compris`}
        />
        <KpiCard
          loading={!insights}
          icon={Timer}
          tone="mustard"
          label="Durée moyenne de livraison"
          value={insights?.avgDeliveryMinutes ? `${Math.round(insights.avgDeliveryMinutes)} min` : '—'}
          hint="De la récupération à la remise, 30 jours"
        />
        <KpiCard
          loading={!insights}
          icon={Star}
          tone="terracotta"
          label="Note moyenne"
          value={insights?.avgRating ? `${insights.avgRating.toLocaleString('fr-CA')} / 5` : '—'}
          hint={`${insights?.byStatus.pending ?? 0} dossiers en attente`}
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="Livraisons par jour" subtitle="14 derniers jours">
            <BarSeries data={insights.deliveriesByDay.map((d) => ({ label: shortDay(d.date), value: d.count }))} />
          </SectionCard>
          <SectionCard title="Flotte" subtitle="Livreurs approuvés par véhicule">
            <Breakdown
              items={[
                { label: 'Vélo', value: insights.byVehicle.bike ?? 0 },
                { label: 'Scooter', value: insights.byVehicle.scooter ?? 0 },
                { label: 'Voiture', value: insights.byVehicle.car ?? 0 },
              ]}
            />
          </SectionCard>
          <SectionCard title="Plus actifs · 30 j" subtitle="Livraisons effectuées">
            <Ranking
              items={insights.top.map((t) => ({
                id: t.id,
                label: t.name,
                value: t.deliveries,
                display: `${t.deliveries} livraison${t.deliveries > 1 ? 's' : ''}`,
                href: `/couriers/${t.id}`,
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
              {t.label} ({counts[t.key] ?? 0})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un livreur ou une ville…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(c) => c.id}
          onRowClick={(c) => router.push(`/couriers/${c.id}`)}
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
          emptyIcon={Bike}
          emptyTitle="Aucun livreur"
          emptyDescription="Aucun livreur ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
