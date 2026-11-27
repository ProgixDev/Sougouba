'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Ban, Clock, Package, Search, ShoppingCart, Store, Truck, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { ExportButton } from '@/components/data/ExportButton';
import { csvDate, type CsvColumn } from '@/lib/csv';
import { Avatar, BarSeries, Breakdown, CHART, KpiCard, KpiGrid, PageHeader, SectionCard } from '@/components/insights/Insights';
import { getOrderInsights, shortDay, type OrderInsights } from '@/lib/api/insights';
import { listLatePickups, listOrders, listOrdersAwaitingShop, listOrdersWaitingForCourier } from '@/lib/api/orders';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { useToast } from '@/components/Toast';
import { orderStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDateTime, formatNumber } from '@/lib/format';
import { t, lazy, useLocale } from '@/lib/i18n';
import type { AdminOrderListItem, OrderStatus } from '@/lib/types';

const STATUS_OPTIONS: { value: OrderStatus | 'all'; label: string }[] = lazy(() => ([
  { value: 'all', label: t('orders.list.filters.allStatuses') },
  { value: 'pending', label: orderStatusMeta('pending').label },
  { value: 'confirmed', label: orderStatusMeta('confirmed').label },
  { value: 'preparing', label: orderStatusMeta('preparing').label },
  { value: 'ready', label: orderStatusMeta('ready').label },
  { value: 'out_for_delivery', label: orderStatusMeta('out_for_delivery').label },
  { value: 'delivered', label: orderStatusMeta('delivered').label },
  { value: 'cancelled', label: orderStatusMeta('cancelled').label },
]));

export default function OrdersPage() {
  useLocale();
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [insights, setInsights] = useState<OrderInsights | null>(null);
  const [waiting, setWaiting] = useState<Awaited<ReturnType<typeof listOrdersWaitingForCourier>> | null>(null);
  const [unanswered, setUnanswered] = useState<Awaited<ReturnType<typeof listOrdersAwaitingShop>> | null>(null);
  const [latePickups, setLatePickups] = useState<Awaited<ReturnType<typeof listLatePickups>> | null>(null);

  useEffect(() => {
    getOrderInsights()
      .then(setInsights)
      .catch(() => undefined);
    // Orders that are packed and that nobody is carrying. An older API has no
    // such route; the card then simply does not appear.
    listOrdersWaitingForCourier()
      .then(setWaiting)
      .catch(() => undefined);
    // And the ones a shop never answered, that the timer did not cancel.
    listOrdersAwaitingShop()
      .then(setUnanswered)
      .catch(() => undefined);
    // And the runs a courier accepted and never came for.
    listLatePickups()
      .then(setLatePickups)
      .catch(() => undefined);
  }, []);

  // Debounced, because this reaches the network on every keystroke and the
  // API allows 120 requests a minute per account.
  const debouncedSearch = useDebounced(search);

  // Newest first by default; filtered, searched, sorted and cut into pages by the API.
  const list = usePagedList<AdminOrderListItem>(
    ({ offset, limit, sort }) =>
      listOrders(
        { status: status === 'all' ? undefined : status, search: debouncedSearch },
        { offset, limit, sort: sort?.key, dir: sort?.dir }
      ),
    `${status}|${debouncedSearch}`
  );
  useEffect(() => {
    if (list.error) toast('error', list.error);
  }, [list.error, toast]);

  const columns: Column<AdminOrderListItem>[] = [
    { key: 'id', header: t('orders.list.columns.order'), render: (o) => <Text variant="body" className="font-semibold">#{o.id.slice(0, 8)}</Text> },
    { key: 'customer', header: t('orders.list.columns.customer'), sortable: true, render: (o) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={o.customerName ?? '?'} size={30} />
          <Text variant="body">{o.customerName ?? '—'}</Text>
        </div>
      ) },
    { key: 'vendor', header: t('orders.list.columns.shop'), render: (o) => <Text variant="body">{o.vendorName}</Text> },
    {
      key: 'created_at',
      header: t('orders.list.columns.date'),
      sortable: true,
      render: (o) => (
        <Text variant="body" tone="muted">
          {formatDateTime(o.createdAt)}
        </Text>
      ),
    },
    {
      key: 'total',
      header: t('orders.list.columns.total'),
      sortable: true,
      className: 'text-right',
      render: (o) => (
        <Text variant="body" className="tabular text-right font-semibold">
          {formatCad(o.totalCad)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('orders.list.columns.status'),
      render: (o) => {
        const meta = orderStatusMeta(o.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  const csvColumns: CsvColumn<AdminOrderListItem>[] = [
    { header: t('orders.list.columns.order'), value: (o) => o.id },
    { header: t('orders.list.columns.date'), value: (o) => csvDate(o.createdAt) },
    { header: t('orders.list.columns.status'), value: (o) => orderStatusMeta(o.status).label },
    { header: t('orders.list.columns.customer'), value: (o) => o.customerName },
    { header: t('orders.list.columns.shop'), value: (o) => o.vendorName },
    { header: t('orders.list.csv.type'), value: (o) => (o.vendorType === 'restaurant' ? t('common.vendorType.restaurant') : t('common.vendorType.grocery')) },
    { header: t('orders.list.csv.courier'), value: (o) => o.courierName },
    { header: t('orders.list.csv.subtotal'), value: (o) => o.subtotalCad },
    { header: t('orders.list.csv.total'), value: (o) => o.totalCad },
    { header: t('orders.list.csv.refundedOn'), value: (o) => csvDate(o.refundedAt) },
    { header: t('orders.list.csv.refundAmount'), value: (o) => o.refundAmountCad },
    { header: t('orders.list.csv.dispute'), value: (o) => o.hasDispute },
    { header: t('orders.list.csv.courierIssue'), value: (o) => o.hasCourierIssue },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Package}
        title={t('orders.list.title')}
        description={t('orders.list.description')}
        actions={
          <ExportButton
            name="commandes"
            columns={csvColumns}
            sort={list.sort ? { sort: list.sort.key, dir: list.sort.dir } : undefined}
            fetchPage={(page) => listOrders({ status: status === 'all' ? undefined : status, search: debouncedSearch }, page)}
          />
        }
      />

      {unanswered && unanswered.orders.length > 0 && (
        <Card className="border border-destructive/40 p-5" elevated={false}>
          <div className="mb-1 flex items-center gap-2">
            <Store size={17} className="text-destructive" />
            <Text variant="subtitle">{t('orders.list.unanswered.title', { count: unanswered.orders.length })}</Text>
          </div>
          <Text variant="caption" tone="muted" className="mb-3">
            {unanswered.cancelAfterMin > 0
              ? t('orders.list.unanswered.autoCancel', { minutes: unanswered.cancelAfterMin })
              : t('orders.list.autoCancelOff')}
          </Text>
          <ul className="flex flex-col">
            {unanswered.orders.map((o) => (
              <li key={o.orderId} className="border-b border-border last:border-0">
                <Link href={`/orders/${o.orderId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-muted">
                  <div className="min-w-0">
                    <Text variant="body" className="font-medium">
                      #{o.orderId.slice(0, 8)} · {o.vendorName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {o.customerName ?? t('orders.roles.customer')} · {formatCad(o.totalCad)}
                    </Text>
                  </div>
                  <Text variant="body" className="tabular font-semibold text-destructive">
                    {waitingLabel(o.waitingMin)}
                  </Text>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {latePickups && latePickups.pickups.length > 0 && (
        <Card className="border border-destructive/40 p-5" elevated={false}>
          <div className="mb-1 flex items-center gap-2">
            <Clock size={17} className="text-destructive" />
            <Text variant="subtitle">{t('orders.list.latePickups.title', { count: latePickups.pickups.length })}</Text>
          </div>
          <Text variant="caption" tone="muted" className="mb-3">
            {latePickups.releaseAfterMin > 0
              ? t('orders.list.latePickups.autoRelease', { minutes: latePickups.releaseAfterMin })
              : t('orders.list.latePickups.autoReleaseOff')}
          </Text>
          <ul className="flex flex-col">
            {latePickups.pickups.map((p) => (
              <li key={p.orderId} className="border-b border-border last:border-0">
                <Link href={`/orders/${p.orderId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-muted">
                  <div className="min-w-0">
                    <Text variant="body" className="font-medium">
                      #{p.orderId.slice(0, 8)} · {p.vendorName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('orders.list.latePickups.courier', { name: p.courierName })} · {formatCad(p.totalCad)}
                      {p.hasOpenIssue ? ` · ${t('orders.list.latePickups.issueReported')}` : ''}
                    </Text>
                  </div>
                  <Text variant="body" className="tabular font-semibold text-destructive">
                    {t('orders.list.latePickups.late', { duration: waitingLabel(p.lateMin) })}
                  </Text>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {waiting && waiting.orders.length > 0 && (
        <Card className="border border-destructive/40 p-5" elevated={false}>
          <div className="mb-1 flex items-center gap-2">
            <Truck size={17} className="text-destructive" />
            <Text variant="subtitle">{t('orders.list.waiting.title', { count: waiting.orders.length })}</Text>
          </div>
          <Text variant="caption" tone="muted" className="mb-3">
            {t('orders.list.waiting.intro', { minutes: waiting.alertAfterMin })}{' '}
            {waiting.cancelAfterMin > 0
              ? t('orders.list.waiting.autoCancel', { minutes: waiting.cancelAfterMin })
              : t('orders.list.autoCancelOff')}
          </Text>
          <ul className="flex flex-col">
            {waiting.orders.map((o) => (
              <li key={o.orderId} className="border-b border-border last:border-0">
                <Link href={`/orders/${o.orderId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:bg-muted">
                  <div className="min-w-0">
                    <Text variant="body" className="font-medium">
                      #{o.orderId.slice(0, 8)} · {o.vendorName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {o.customerName ?? t('orders.roles.customer')} · {formatCad(o.totalCad)} ·{' '}
                      {o.offers === 0 ? t('orders.list.waiting.noCourierInRange') : t('orders.list.waiting.couriersAsked', { count: o.offers })}
                    </Text>
                  </div>
                  <Text variant="body" className="tabular font-semibold text-destructive">
                    {waitingLabel(o.waitingMin)}
                  </Text>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={ShoppingCart}
          label={t('orders.list.kpis.orders30')}
          value={String(insights?.orders30 ?? 0)}
          hint={t('orders.list.kpis.ordersHint', { today: insights?.today ?? 0, active: insights?.active ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={Wallet}
          tone="forest"
          label={t('orders.list.kpis.gmv30')}
          value={formatCad(insights?.gmv30 ?? 0)}
          hint={t('orders.list.kpis.avgBasket', { amount: insights?.avgBasket ? formatCad(insights.avgBasket) : '—' })}
        />
        <KpiCard
          loading={!insights}
          icon={AlertCircle}
          tone="mustard"
          label={t('orders.list.kpis.unassigned')}
          value={String(insights?.unassigned ?? 0)}
          hint={t('orders.list.kpis.unassignedHint')}
        />
        <KpiCard
          loading={!insights}
          icon={Ban}
          tone="terracotta"
          label={t('orders.list.kpis.cancelRate30')}
          // The API sends a percentage with one decimal (« 4.2 »); `Intl` wants the fraction.
          value={insights?.cancelRate !== null && insights?.cancelRate !== undefined ? formatNumber(insights.cancelRate / 100, { style: 'percent', maximumFractionDigits: 1 }) : '—'}
          hint={t('orders.list.kpis.refunded', { amount: formatCad(insights?.refunded30 ?? 0) })}
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title={t('orders.list.charts.gmvByDay')} subtitle={t('orders.list.charts.gmvByDayHint')} className="lg:col-span-2">
            <BarSeries
              data={insights.byDay.map((d) => ({ label: shortDay(d.date), value: Number(d.gmv) }))}
              format={(v) => formatCad(v)}
              color={CHART.forestDeep}
              height={200}
            />
          </SectionCard>
          <SectionCard title={t('orders.list.charts.byStatus')} subtitle={t('orders.list.charts.byStatusHint')}>
            <Breakdown
              items={[
                { label: t('orders.list.charts.delivered'), value: insights.byStatus.delivered ?? 0 },
                { label: t('orders.list.charts.outForDelivery'), value: insights.byStatus.out_for_delivery ?? 0 },
                {
                  label: t('orders.list.charts.preparing'),
                  value: (insights.byStatus.pending ?? 0) + (insights.byStatus.confirmed ?? 0) + (insights.byStatus.preparing ?? 0) + (insights.byStatus.ready ?? 0),
                },
                { label: t('orders.list.charts.cancelled'), value: insights.byStatus.cancelled ?? 0 },
              ]}
            />
          </SectionCard>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | 'all')}
          className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 font-sans text-[0.8125rem] font-medium text-foreground outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground sm:w-auto">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('orders.list.filters.searchPlaceholder')}
            className="w-full min-w-0 bg-transparent font-sans sm:w-56 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(o) => o.id}
          onRowClick={(o) => router.push(`/orders/${o.id}`)}
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
          emptyIcon={Package}
          emptyTitle={t('orders.list.empty.title')}
          emptyDescription={t('orders.list.empty.description')}
        />
      </Card>
    </div>
  );
}

/** « 25 min », « 3 h 10 », « 4 j » — how long an order has been waiting, at the size that matters. */
function waitingLabel(minutes: number): string {
  if (minutes < 60) return t('common.time.minutes', { count: minutes });
  if (minutes < 24 * 60) return t('orders.list.waitHours', { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') });
  return t('common.time.days', { count: Math.floor(minutes / (24 * 60)) });
}
