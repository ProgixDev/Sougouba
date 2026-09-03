'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listOrders } from '@/lib/api/orders';
import { useToast } from '@/components/Toast';
import { orderStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import type { AdminOrderListItem, OrderStatus } from '@/lib/types';

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

export default function OrdersPage() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<AdminOrderListItem[] | null>(null);
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  // Debounced, because this now reaches the network on every keystroke and the
  // API allows 120 requests a minute per account.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    // Back to the skeleton while the new filter loads, rather than showing the
    // previous filter's rows as though they were the answer.
    setRows(null);
    listOrders({
      status: status === 'all' ? undefined : status,
      search: debouncedSearch,
      limit: 100,
    })
      .then((page) => active && setRows(page.items))
      .catch((error: unknown) => {
        if (!active) return;
        // Without this the skeleton spins forever on any failure — the mock
        // could not reject, so no call site had a rejection path.
        setRows([]);
        toast('error', error instanceof Error ? error.message : 'Chargement impossible.');
      });
    return () => {
      active = false;
    };
  }, [status, debouncedSearch, toast]);

  const columns: Column<AdminOrderListItem>[] = [
    { key: 'id', header: 'Commande', render: (o) => <Text variant="body" className="font-semibold">#{o.id.slice(0, 8)}</Text> },
    { key: 'customer', header: 'Client', sortable: true, sortValue: (o) => o.customerName ?? '', render: (o) => <Text variant="body">{o.customerName ?? '—'}</Text> },
    { key: 'vendor', header: 'Commerce', render: (o) => <Text variant="body">{o.vendorName}</Text> },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      sortValue: (o) => o.createdAt,
      render: (o) => (
        <Text variant="body" tone="muted">
          {formatDateTime(o.createdAt)}
        </Text>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      sortValue: (o) => o.totalCad,
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
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Commandes
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Vue d&apos;ensemble des commandes sur toute la plateforme.
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
            placeholder="Rechercher un numéro ou un client…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows ?? []}
          keyField={(o) => o.id}
          onRowClick={(o) => router.push(`/orders/${o.id}`)}
          loading={rows === null}
          emptyIcon={Package}
          emptyTitle="Aucune commande"
          emptyDescription="Aucune commande ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
