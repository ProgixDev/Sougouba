'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Ban, Package, Search, ShoppingCart, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Avatar, BarSeries, Breakdown, CHART, KpiCard, KpiGrid, PageHeader, SectionCard } from '@/components/insights/Insights';
import { getOrderInsights, shortDay, type OrderInsights } from '@/lib/api/insights';
import { listOrders } from '@/lib/api/orders';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
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
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [insights, setInsights] = useState<OrderInsights | null>(null);

  useEffect(() => {
    getOrderInsights()
      .then(setInsights)
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
    { key: 'id', header: 'Commande', render: (o) => <Text variant="body" className="font-semibold">#{o.id.slice(0, 8)}</Text> },
    { key: 'customer', header: 'Client', sortable: true, render: (o) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={o.customerName ?? '?'} size={30} />
          <Text variant="body">{o.customerName ?? '—'}</Text>
        </div>
      ) },
    { key: 'vendor', header: 'Commerce', render: (o) => <Text variant="body">{o.vendorName}</Text> },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
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
      <PageHeader icon={Package} title="Commandes" description="Toutes les commandes de la plateforme, et leur tendance." />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={ShoppingCart}
          label="Commandes · 30 j"
          value={String(insights?.orders30 ?? 0)}
          hint={`${insights?.today ?? 0} aujourd’hui · ${insights?.active ?? 0} en cours`}
        />
        <KpiCard
          loading={!insights}
          icon={Wallet}
          tone="forest"
          label="Volume d’affaires · 30 j"
          value={formatCad(insights?.gmv30 ?? 0)}
          hint={`Panier moyen ${insights?.avgBasket ? formatCad(insights.avgBasket) : '—'}`}
        />
        <KpiCard
          loading={!insights}
          icon={AlertCircle}
          tone="mustard"
          label="Sans livreur"
          value={String(insights?.unassigned ?? 0)}
          hint="Commandes prêtes ou en préparation, en attente d’un livreur"
        />
        <KpiCard
          loading={!insights}
          icon={Ban}
          tone="terracotta"
          label="Taux d’annulation · 30 j"
          value={insights?.cancelRate !== null && insights?.cancelRate !== undefined ? `${insights.cancelRate.toLocaleString('fr-CA')} %` : '—'}
          hint={`${formatCad(insights?.refunded30 ?? 0)} remboursés`}
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="Volume d’affaires par jour" subtitle="Total des commandes, hors annulées, 30 jours" className="lg:col-span-2">
            <BarSeries
              data={insights.byDay.map((d) => ({ label: shortDay(d.date), value: Number(d.gmv) }))}
              format={(v) => formatCad(v)}
              color={CHART.forestDeep}
              height={200}
            />
          </SectionCard>
          <SectionCard title="Par statut" subtitle="Commandes des 30 derniers jours">
            <Breakdown
              items={[
                { label: 'Livrées', value: insights.byStatus.delivered ?? 0 },
                { label: 'En livraison', value: insights.byStatus.out_for_delivery ?? 0 },
                {
                  label: 'En préparation',
                  value: (insights.byStatus.pending ?? 0) + (insights.byStatus.confirmed ?? 0) + (insights.byStatus.preparing ?? 0) + (insights.byStatus.ready ?? 0),
                },
                { label: 'Annulées', value: insights.byStatus.cancelled ?? 0 },
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
          emptyTitle="Aucune commande"
          emptyDescription="Aucune commande ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
