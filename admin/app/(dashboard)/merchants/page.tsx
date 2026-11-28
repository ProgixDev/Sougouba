'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Search, Star, Store, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Avatar, BarSeries, Breakdown, KpiCard, KpiGrid, PageHeader, Ranking, SectionCard } from '@/components/insights/Insights';
import { formatHours, getVendorInsights, shortDay, type VendorInsights } from '@/lib/api/insights';
import { listVendors } from '@/lib/api/vendors';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { formatCad, formatNumber } from '@/lib/format';
// `translate`, not `t`: this page already names its loop variables `t`.
import { t as translate, lazy, useLocale } from '@/lib/i18n';
import { vendorStatusMeta } from '@/lib/statusMeta';
import { formatDate } from '@/lib/format';
import type { AdminVendorListItem, AdminVendorStatus } from '@/lib/types';

const TABS: { key: AdminVendorStatus; label: string }[] = lazy(() => ([
  { key: 'pending', label: translate('merchants.list.statuses.pending') },
  { key: 'approved', label: translate('merchants.list.statuses.approved') },
  // Approved, but offline until the subscription is paid — beside the shops it will rejoin.
  { key: 'subscription_hold', label: translate('merchants.list.statuses.subscription_hold') },
  { key: 'suspended', label: translate('merchants.list.statuses.suspended') },
  // `rejected` is its own terminal state in the API — the mock folded it into
  // "suspended", which hid every refused application from the back office.
  { key: 'rejected', label: translate('merchants.list.statuses.rejected') },
]));

export default function MerchantsPage() {
  useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<AdminVendorStatus>('pending');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const [insights, setInsights] = useState<VendorInsights | null>(null);

  useEffect(() => {
    getVendorInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  // One page at a time from the database — filtered, searched and sorted there.
  const list = usePagedList<AdminVendorListItem>(
    ({ offset, limit, sort }) =>
      listVendors({ status: tab, search: debouncedSearch }, { offset, limit, sort: sort?.key, dir: sort?.dir }),
    `${tab}|${debouncedSearch}`
  );
  // Tab counts are whole-table counts, not the current page's.
  const counts: Record<string, number> = insights?.byStatus ?? {};

  const columns: Column<AdminVendorListItem>[] = [
    {
      key: 'name',
      header: translate('merchants.list.columns.shop'),
      sortable: true,
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
      header: translate('merchants.list.columns.sector'),
      render: (v) => <Text variant="body">{v.vendorType === 'restaurant' ? translate('common.vendorType.restaurant') : translate('common.vendorType.grocery')}</Text>,
    },
    { key: 'city', header: translate('merchants.list.columns.city'), sortable: true, render: (v) => <Text variant="body">{v.city}</Text> },
    {
      key: 'date',
      header: translate('merchants.list.columns.submitted'),
      sortable: true,
      render: (v) => (
        <Text variant="body" tone="muted">
          {v.submittedAt ? formatDate(v.submittedAt) : '—'}
        </Text>
      ),
    },
    {
      key: 'status',
      header: translate('merchants.list.columns.status'),
      render: (v) => {
        const meta = vendorStatusMeta(v.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={Store} title={translate('merchants.list.title')} description={translate('merchants.list.description')} />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Store}
          label={translate('merchants.list.kpi.online')}
          value={String(insights?.byStatus.approved ?? 0)}
          hint={translate('merchants.list.kpi.onlineHint', { count: insights?.new30 ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={Clock}
          tone="mustard"
          label={translate('merchants.list.kpi.pending')}
          value={String(insights?.byStatus.pending ?? 0)}
          hint={translate('merchants.list.kpi.pendingHint', { duration: formatHours(insights?.avgApprovalHours) })}
        />
        <KpiCard
          loading={!insights}
          icon={TrendingUp}
          tone="forest"
          label={translate('merchants.list.kpi.sales')}
          value={formatCad(insights?.sales30 ?? 0)}
          hint={translate('merchants.list.kpi.salesHint', { count: insights?.orders30 ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={Star}
          tone="terracotta"
          label={translate('merchants.list.kpi.rating')}
          value={insights?.avgRating ? `${formatNumber(insights.avgRating)} / 5` : '—'}
          hint={translate('merchants.list.kpi.ratingHint')}
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title={translate('merchants.list.signups.title')} subtitle={translate('merchants.list.signups.subtitle')}>
            <BarSeries data={insights.signupsByWeek.map((w) => ({ label: shortDay(w.week), value: w.count }))} />
          </SectionCard>
          <SectionCard title={translate('merchants.list.breakdown.title')} subtitle={translate('merchants.list.breakdown.subtitle')}>
            <Breakdown
              items={[
                { label: translate('merchants.list.breakdown.groceries'), value: insights.byType.grocery ?? 0 },
                { label: translate('merchants.list.breakdown.restaurants'), value: insights.byType.restaurant ?? 0 },
              ]}
            />
            <Breakdown
              items={[
                { label: translate('merchants.list.statuses.approved'), value: insights.byStatus.approved ?? 0 },
                { label: translate('merchants.list.statuses.subscription_hold'), value: insights.byStatus.subscription_hold ?? 0 },
                { label: translate('merchants.list.statuses.pending'), value: insights.byStatus.pending ?? 0 },
                { label: translate('merchants.list.statuses.suspended'), value: insights.byStatus.suspended ?? 0 },
                { label: translate('merchants.list.statuses.rejected'), value: insights.byStatus.rejected ?? 0 },
              ]}
            />
          </SectionCard>
          <SectionCard title={translate('merchants.list.top.title')} subtitle={translate('merchants.list.top.subtitle')}>
            <Ranking
              items={insights.top.map((t) => ({
                id: t.id,
                label: t.name,
                value: Number(t.sales),
                display: translate('merchants.list.top.value', { amount: formatCad(Number(t.sales)), count: t.orders }),
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
              {t.label} ({counts[t.key] ?? 0})
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground sm:w-auto">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={translate('merchants.list.searchPlaceholder')}
            className="w-full min-w-0 bg-transparent font-sans sm:w-56 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(v) => v.id}
          onRowClick={(v) => router.push(`/merchants/${v.id}`)}
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
          emptyIcon={Store}
          emptyTitle={translate('merchants.list.emptyTitle')}
          emptyDescription={translate('merchants.list.emptyDescription')}
        />
      </Card>
    </div>
  );
}
