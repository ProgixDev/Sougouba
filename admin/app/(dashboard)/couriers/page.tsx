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
import { formatCad, formatDate, formatNumber } from '@/lib/format';
// `translate`, not `t`: this page already names its loop variables `t`.
import { t as translate, lazy, useLocale } from '@/lib/i18n';
import type { AdminCourierListItem, AdminCourierStatus } from '@/lib/types';

const TABS: { key: AdminCourierStatus; label: string }[] = lazy(() => ([
  { key: 'pending', label: translate('couriers.list.statuses.pending') },
  { key: 'approved', label: translate('couriers.list.statuses.approved') },
  { key: 'suspended', label: translate('couriers.list.statuses.suspended') },
  // Terminal in the API, and invisible in the mock, which folded it into
  // "suspended" — every refused application was hidden from the back office.
  { key: 'rejected', label: translate('couriers.list.statuses.rejected') },
]));

export default function CouriersPage() {
  useLocale();
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
      header: translate('couriers.list.columns.courier'),
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.fullName} src={c.avatarUrl} />
          <Text variant="body" className="font-semibold">
            {c.fullName}
          </Text>
        </div>
      ),
    },
    { key: 'vehicle', header: translate('couriers.list.columns.vehicle'), render: (c) => <Text variant="body">{VEHICLE_LABELS[c.vehicle]}</Text> },
    { key: 'city', header: translate('couriers.list.columns.city'), sortable: true, render: (c) => <Text variant="body">{c.city}</Text> },
    {
      key: 'date',
      header: translate('couriers.list.columns.joined'),
      sortable: true,
      render: (c) => (
        <Text variant="body" tone="muted">
          {formatDate(c.joinedAt)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: translate('couriers.list.columns.status'),
      render: (c) => {
        const meta = courierStatusMeta(c.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={Bike} title={translate('couriers.list.title')} description={translate('couriers.list.description')} />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Radio}
          label={translate('couriers.list.kpi.online')}
          value={String(insights?.online ?? 0)}
          hint={translate('couriers.list.kpi.onlineHint', { count: insights?.byStatus.approved ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={Bike}
          tone="forest"
          label={translate('couriers.list.kpi.deliveries')}
          value={String(insights?.deliveries30 ?? 0)}
          hint={translate('couriers.list.kpi.deliveriesHint', { amount: formatCad(insights?.earnings30 ?? 0) })}
        />
        <KpiCard
          loading={!insights}
          icon={Timer}
          tone="mustard"
          label={translate('couriers.list.kpi.deliveryTime')}
          value={insights?.avgDeliveryMinutes ? translate('common.time.minutes', { count: Math.round(insights.avgDeliveryMinutes) }) : '—'}
          hint={translate('couriers.list.kpi.deliveryTimeHint')}
        />
        <KpiCard
          loading={!insights}
          icon={Star}
          tone="terracotta"
          label={translate('couriers.list.kpi.rating')}
          value={insights?.avgRating ? `${formatNumber(insights.avgRating)} / 5` : '—'}
          hint={translate('couriers.list.kpi.ratingHint', { count: insights?.byStatus.pending ?? 0 })}
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title={translate('couriers.list.byDay.title')} subtitle={translate('couriers.list.byDay.subtitle')}>
            <BarSeries data={insights.deliveriesByDay.map((d) => ({ label: shortDay(d.date), value: d.count }))} />
          </SectionCard>
          <SectionCard title={translate('couriers.list.fleet.title')} subtitle={translate('couriers.list.fleet.subtitle')}>
            <Breakdown
              items={[
                { label: translate('status.vehicle.bike'), value: insights.byVehicle.bike ?? 0 },
                { label: translate('status.vehicle.scooter'), value: insights.byVehicle.scooter ?? 0 },
                { label: translate('status.vehicle.car'), value: insights.byVehicle.car ?? 0 },
              ]}
            />
          </SectionCard>
          <SectionCard title={translate('couriers.list.top.title')} subtitle={translate('couriers.list.top.subtitle')}>
            <Ranking
              items={insights.top.map((t) => ({
                id: t.id,
                label: t.name,
                value: t.deliveries,
                display: translate('couriers.list.top.value', { count: t.deliveries }),
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
        <div className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground sm:w-auto">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={translate('couriers.list.searchPlaceholder')}
            className="w-full min-w-0 bg-transparent font-sans sm:w-56 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
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
          emptyTitle={translate('couriers.list.emptyTitle')}
          emptyDescription={translate('couriers.list.emptyDescription')}
        />
      </Card>
    </div>
  );
}
