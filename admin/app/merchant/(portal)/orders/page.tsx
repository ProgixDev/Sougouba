'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listMerchantOrders } from '@/lib/api/merchantOrders';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { orderStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';

const STATUS_OPTIONS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'pending', label: 'En attente' },
  { value: 'confirmed', label: 'Confirmée' },
  { value: 'preparing', label: 'En préparation' },
  { value: 'ready', label: 'Prête' },
  { value: 'out_for_delivery', label: 'En livraison' },
  { value: 'delivered', label: 'Livrée' },
  { value: 'cancelled', label: 'Annulée' },
];

export default function MerchantOrdersPage() {
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
    { key: 'id', header: 'Commande', render: (o) => <Text variant="body" className="font-semibold">#{o.id.slice(0, 8)}</Text> },
    { key: 'customer', header: 'Client', render: (o) => <Text variant="body">{o.customerName ?? '—'}</Text> },
    {
      key: 'createdAt',
      header: 'Date',
      render: (o) => (
        <Text variant="body" tone="muted">
          {formatDateTime(o.createdAt)}
        </Text>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (o) => (
        <Text variant="body" className="tabular text-right font-semibold">
          {formatCad(o.totalCad)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (o) => {
        const meta = orderStatusMeta(o.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Commandes
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Toutes les commandes reçues par votre boutique.
        </Text>
      </div>

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
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
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
          emptyTitle="Aucune commande"
          emptyDescription="Aucune commande ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
