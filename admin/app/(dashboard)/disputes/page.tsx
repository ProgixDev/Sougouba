'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, MessageCircleWarning, Undo2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Breakdown, KpiCard, KpiGrid, PageHeader, SectionCard } from '@/components/insights/Insights';
import { listDisputes } from '@/lib/api/disputes';
import { formatHours, getDisputeInsights, type DisputeInsights } from '@/lib/api/insights';
import { formatCad } from '@/lib/format';
import { disputeStatusMeta, DISPUTE_REASON_LABELS } from '@/lib/statusMeta';
import { timeAgo } from '@/lib/format';
import type { AdminDispute, AdminDisputeStatus } from '@/lib/types';
import { usePagedList } from '@/lib/usePagedList';

const TABS: { key: AdminDisputeStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Ouverts' },
  { key: 'answered', label: 'Répondus' },
  { key: 'resolved', label: 'Résolus' },
  { key: 'rejected', label: 'Rejetés' },
  { key: 'all', label: 'Tous' },
];

export default function DisputesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AdminDisputeStatus | 'all'>('open');

  const [insights, setInsights] = useState<DisputeInsights | null>(null);

  useEffect(() => {
    getDisputeInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  // Oldest first by default — a queue is worked from the front. One page at a time from the database.
  const list = usePagedList<AdminDispute>(
    ({ offset, limit, sort }) => listDisputes(tab === 'all' ? undefined : tab, { offset, limit, dir: sort?.dir }),
    tab
  );


  const columns: Column<AdminDispute>[] = [
    { key: 'orderId', header: 'Commande', render: (d) => <Text variant="body" className="font-semibold">#{d.orderId.slice(0, 8)}</Text> },
    { key: 'customerName', header: 'Client', render: (d) => <Text variant="body">{d.customerName ?? '—'}</Text> },
    { key: 'vendorName', header: 'Commerce', render: (d) => <Text variant="body">{d.vendorName}</Text> },
    { key: 'reason', header: 'Motif', render: (d) => <Text variant="body">{DISPUTE_REASON_LABELS[d.reason]}</Text> },
    {
      key: 'openedAt',
      header: 'Ouvert',
      sortable: true,
      render: (d) => (
        <Text variant="body" tone="muted">
          {timeAgo(d.openedAt)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (d) => {
        const meta = disputeStatusMeta(d.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={MessageCircleWarning} title="Litiges" description="Réclamations des clients à trier, trancher et rembourser." />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={MessageCircleWarning}
          tone="terracotta"
          label="À traiter"
          value={String((insights?.byStatus.open ?? 0) + (insights?.byStatus.answered ?? 0))}
          hint={`${insights?.byStatus.answered ?? 0} avec une réponse du commerçant`}
        />
        <KpiCard
          loading={!insights}
          icon={CheckCircle2}
          label="Tranchés"
          value={String((insights?.byStatus.resolved ?? 0) + (insights?.byStatus.rejected ?? 0))}
          hint={`${insights?.byStatus.resolved ?? 0} donnés au client · ${insights?.byStatus.rejected ?? 0} rejetés`}
        />
        <KpiCard
          loading={!insights}
          icon={Clock}
          tone="mustard"
          label="Délai moyen de décision"
          value={formatHours(insights?.avgResolutionHours)}
          hint={`${insights?.opened30 ?? 0} ouverts sur 30 jours`}
        />
        <KpiCard
          loading={!insights}
          icon={Undo2}
          tone="neutral"
          label="Remboursé · 30 j"
          value={formatCad(insights?.refunded30 ?? 0)}
          hint="Suite à un litige"
        />
      </KpiGrid>

      {insights && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Motifs" subtitle="Tous les litiges, par raison invoquée">
            <Breakdown
              items={Object.entries(insights.byReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, n]) => ({ label: DISPUTE_REASON_LABELS[reason] ?? reason, value: n }))}
            />
          </SectionCard>
          <SectionCard title="Issue" subtitle="Où en sont les litiges">
            <Breakdown
              items={[
                { label: 'Ouverts', value: insights.byStatus.open ?? 0 },
                { label: 'Réponse du commerçant', value: insights.byStatus.answered ?? 0 },
                { label: 'Résolus', value: insights.byStatus.resolved ?? 0 },
                { label: 'Rejetés', value: insights.byStatus.rejected ?? 0 },
              ]}
            />
          </SectionCard>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 rounded-full border border-border bg-card p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`cursor-pointer rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
              tab === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.key !== 'all' && insights ? ` (${insights.byStatus[t.key] ?? 0})` : ''}
          </button>
        ))}
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(d) => d.orderId}
          onRowClick={(d) => router.push(`/disputes/${d.orderId}`)}
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
          emptyIcon={MessageCircleWarning}
          emptyTitle="Aucun litige"
          emptyDescription="Aucun litige ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
