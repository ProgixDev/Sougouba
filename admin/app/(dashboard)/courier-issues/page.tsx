'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listCourierIssues } from '@/lib/api/courierIssues';
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
      <div>
        <Text as="h1" variant="display">
          Incidents livreurs
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Problèmes signalés par les livreurs pendant une course.
        </Text>
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
