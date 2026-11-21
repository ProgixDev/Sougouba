'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { Breakdown, KpiCard, PageHeader, SectionCard } from '@/components/insights/Insights';
import { listCourierIssues } from '@/lib/api/courierIssues';
import { formatHours, getCourierIssueInsights, type CourierIssueInsights } from '@/lib/api/insights';
import { courierIssueStatusMeta, COURIER_ISSUE_REASON_LABELS } from '@/lib/statusMeta';
import { timeAgo } from '@/lib/format';
import type { AdminCourierIssue, CourierIssueStatus } from '@/lib/types';

const TABS: { key: CourierIssueStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Ouverts' },
  { key: 'resolved', label: 'Résolus' },
  { key: 'all', label: 'Tous' },
];

export default function CourierIssuesPage() {
  const router = useRouter();
  const [all, setAll] = useState<AdminCourierIssue[] | null>(null);
  const [tab, setTab] = useState<CourierIssueStatus | 'all'>('open');

  const [insights, setInsights] = useState<CourierIssueInsights | null>(null);

  useEffect(() => {
    getCourierIssueInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    listCourierIssues().then(setAll);
  }, []);

  const rows = useMemo(() => (tab === 'all' ? all ?? [] : (all ?? []).filter((i) => i.status === tab)), [all, tab]);

  const columns: Column<AdminCourierIssue>[] = [
    { key: 'orderId', header: 'Commande', render: (i) => <Text variant="body" className="font-semibold">#{i.orderId}</Text> },
    { key: 'courierName', header: 'Livreur', render: (i) => <Text variant="body">{i.courierName ?? '—'}</Text> },
    { key: 'vendorName', header: 'Commerce', render: (i) => <Text variant="body">{i.vendorName}</Text> },
    { key: 'reason', header: 'Motif', render: (i) => <Text variant="body">{COURIER_ISSUE_REASON_LABELS[i.reason]}</Text> },
    {
      key: 'at',
      header: 'Signalé',
      sortable: true,
      sortValue: (i) => i.at,
      render: (i) => (
        <Text variant="body" tone="muted">
          {timeAgo(i.at)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (i) => {
        const meta = courierIssueStatusMeta(i.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={TriangleAlert} title="Incidents livreurs" description="Problèmes signalés par les livreurs pendant une course." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1 xl:grid-cols-3">
          <KpiCard
            loading={!insights}
            icon={TriangleAlert}
            tone="terracotta"
            label="Ouverts"
            value={String(insights?.byStatus.open ?? 0)}
            hint="Un livreur attend une décision"
          />
          <KpiCard
            loading={!insights}
            icon={CheckCircle2}
            label="Résolus"
            value={String(insights?.byStatus.resolved ?? 0)}
            hint={`${insights?.reported30 ?? 0} signalés sur 30 jours`}
          />
          <KpiCard
            loading={!insights}
            icon={Clock}
            tone="mustard"
            label="Délai moyen"
            value={formatHours(insights?.avgResolutionHours)}
            hint="Du signalement à la résolution"
          />
        </div>
        {insights && (
          <SectionCard title="Motifs" subtitle="Tous les incidents, par cause">
            <Breakdown
              items={Object.entries(insights.byReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, n]) => ({ label: COURIER_ISSUE_REASON_LABELS[reason] ?? reason, value: n }))}
            />
          </SectionCard>
        )}
      </div>

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
          </button>
        ))}
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows}
          keyField={(i) => i.orderId}
          onRowClick={(i) => router.push(`/courier-issues/${i.orderId}`)}
          loading={all === null}
          emptyIcon={TriangleAlert}
          emptyTitle="Aucun incident"
          emptyDescription="Aucun incident ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
