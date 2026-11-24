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

  const csvColumns: CsvColumn<AdminOrderListItem>[] = [
    { header: 'Commande', value: (o) => o.id },
    { header: 'Date', value: (o) => csvDate(o.createdAt) },
    { header: 'Statut', value: (o) => orderStatusMeta(o.status).label },
    { header: 'Client', value: (o) => o.customerName },
    { header: 'Commerce', value: (o) => o.vendorName },
    { header: 'Type', value: (o) => (o.vendorType === 'restaurant' ? 'Restaurant' : 'Épicerie') },
    { header: 'Livreur', value: (o) => o.courierName },
    { header: 'Sous-total ($)', value: (o) => o.subtotalCad },
    { header: 'Total ($)', value: (o) => o.totalCad },
    { header: 'Remboursé le', value: (o) => csvDate(o.refundedAt) },
    { header: 'Montant remboursé ($)', value: (o) => o.refundAmountCad },
    { header: 'Litige', value: (o) => o.hasDispute },
    { header: 'Incident livreur', value: (o) => o.hasCourierIssue },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Package}
        title="Commandes"
        description="Toutes les commandes de la plateforme, et leur tendance."
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
            <Text variant="subtitle">
              {unanswered.orders.length === 1
                ? '1 commande sans réponse du commerce'
                : `${unanswered.orders.length} commandes sans réponse du commerce`}
            </Text>
          </div>
          <Text variant="caption" tone="muted" className="mb-3">
            {unanswered.cancelAfterMin > 0
              ? `Une commande sans réponse est annulée et remboursée automatiquement après ${unanswered.cancelAfterMin} min. Celles-ci attendent depuis plus d’un jour : elles restent à annuler à la main.`
              : 'L’annulation automatique est désactivée : c’est à vous de décider.'}
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
                      {o.customerName ?? 'Client'} · {formatCad(o.totalCad)}
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
            <Text variant="subtitle">
              {latePickups.pickups.length === 1
                ? '1 commande acceptée par un livreur qui ne vient pas'
                : `${latePickups.pickups.length} commandes acceptées par un livreur qui ne vient pas`}
            </Text>
          </div>
          <Text variant="caption" tone="muted" className="mb-3">
            {latePickups.releaseAfterMin > 0
              ? `Un livreur en retard de ${latePickups.releaseAfterMin} min perd la course, qui repart vers un autre. Celles-ci n’ont pas été reprises : retard de plus d’un jour, ou un incident a été signalé dessus.`
              : 'Le retrait automatique est désactivé : c’est à vous de décider.'}
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
                      Livreur : {p.courierName} · {formatCad(p.totalCad)}
                      {p.hasOpenIssue ? ' · incident signalé' : ''}
                    </Text>
                  </div>
                  <Text variant="body" className="tabular font-semibold text-destructive">
                    {waitingLabel(p.lateMin)} de retard
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
            <Text variant="subtitle">
              {waiting.orders.length === 1 ? '1 commande prête sans livreur' : `${waiting.orders.length} commandes prêtes sans livreur`}
            </Text>
          </div>
          <Text variant="caption" tone="muted" className="mb-3">
            Prêtes depuis plus de {waiting.alertAfterMin} min, aucun livreur ne les a prises.{' '}
            {waiting.cancelAfterMin > 0
              ? `Elles sont annulées et remboursées automatiquement après ${waiting.cancelAfterMin} min — sauf celles qui attendent depuis plus d’un jour, qui restent à traiter à la main.`
              : 'L’annulation automatique est désactivée : c’est à vous de décider.'}
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
                      {o.customerName ?? 'Client'} · {formatCad(o.totalCad)} ·{' '}
                      {o.offers === 0 ? 'aucun livreur à portée' : `${o.offers} livreur${o.offers > 1 ? 's' : ''} sollicité${o.offers > 1 ? 's' : ''}`}
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
        <div className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground sm:w-auto">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un numéro ou un client…"
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
          emptyTitle="Aucune commande"
          emptyDescription="Aucune commande ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}

/** « 25 min », « 3 h 10 », « 4 j » — how long an order has been waiting, at the size that matters. */
function waitingLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(minutes / (24 * 60))} j`;
}
