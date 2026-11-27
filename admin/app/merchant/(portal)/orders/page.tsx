'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/insights/Insights';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listMerchantOrders } from '@/lib/api/merchantOrders';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { orderStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import { t, lazy, useLocale } from '@/lib/i18n';
import type { Order, OrderStatus } from '@/lib/types';

const STATUS_OPTIONS: { value: OrderStatus | 'all'; label: string }[] = lazy(() => ([
  { value: 'all', label: t('portal.orders.list.allStatuses') },
  { value: 'pending', label: orderStatusMeta('pending').label },
  { value: 'confirmed', label: orderStatusMeta('confirmed').label },
  { value: 'preparing', label: orderStatusMeta('preparing').label },
  { value: 'ready', label: orderStatusMeta('ready').label },
  { value: 'out_for_delivery', label: orderStatusMeta('out_for_delivery').label },
  { value: 'delivered', label: orderStatusMeta('delivered').label },
  { value: 'cancelled', label: orderStatusMeta('cancelled').label },
]));

export default function MerchantOrdersPage() {
  useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  // Newest first, one page at a time; status and search are applied by the API.
  const list = usePagedList<Order>(
    ({ offset, limit }) =>
      listMerchantOrders({ status: status === 'all' ? undefined : status, search: debouncedSearch }, { offset, limit }),
    `${status}|${debouncedSearch}`
  );

  const columns: Column<Order>[] = [
    { key: 'id', header: t('portal.orders.list.columns.order'), render: (o) => <Text variant="body" className="font-semibold">#{o.id.slice(0, 8)}</Text> },
    { key: 'customer', header: t('portal.orders.list.columns.customer'), render: (o) => <Text variant="body">{o.customerName ?? '—'}</Text> },
    {
      key: 'createdAt',
      header: t('portal.orders.list.columns.date'),
      render: (o) => (
        <Text variant="body" tone="muted">
          {formatDateTime(o.createdAt)}
        </Text>
      ),
    },
    {
      key: 'total',
      header: t('portal.orders.list.columns.total'),
      className: 'text-right',
      render: (o) => (
        <Text variant="body" className="tabular text-right font-semibold">
          {formatCad(o.totalCad)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('portal.orders.list.columns.status'),
      render: (o) => {
        const meta = orderStatusMeta(o.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Package} title={t('nav.merchant.orders')} description={t('portal.orders.list.description')} />

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
            placeholder={t('portal.orders.list.searchPlaceholder')}
            className="w-full min-w-0 bg-transparent font-sans sm:w-56 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(o) => o.id}
          onRowClick={(o) => router.push(`/merchant/orders/${o.id}`)}
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
          emptyTitle={t('portal.orders.list.emptyTitle')}
          emptyDescription={t('portal.orders.list.emptyDescription')}
        />
      </Card>
    </div>
  );
}
