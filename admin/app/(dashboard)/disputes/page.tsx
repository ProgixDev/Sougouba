'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircleWarning } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listDisputes } from '@/lib/api/disputes';
import { disputeStatusMeta, DISPUTE_REASON_LABELS } from '@/lib/statusMeta';
import { timeAgo } from '@/lib/format';
import type { AdminDispute, AdminDisputeStatus } from '@/lib/types';

const TABS: { key: AdminDisputeStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Ouverts' },
  { key: 'answered', label: 'Répondus' },
  { key: 'resolved', label: 'Résolus' },
  { key: 'rejected', label: 'Rejetés' },
  { key: 'all', label: 'Tous' },
];

export default function DisputesPage() {
  const router = useRouter();
  const [all, setAll] = useState<AdminDispute[] | null>(null);
  const [tab, setTab] = useState<AdminDisputeStatus | 'all'>('open');

  useEffect(() => {
    listDisputes().then(setAll);
  }, []);

  const rows = useMemo(() => (tab === 'all' ? all ?? [] : (all ?? []).filter((d) => d.status === tab)), [all, tab]);

  const columns: Column<AdminDispute>[] = [
    { key: 'orderId', header: 'Commande', render: (d) => <Text variant="body" className="font-semibold">#{d.orderId.slice(0, 8)}</Text> },
    { key: 'customerName', header: 'Client', render: (d) => <Text variant="body">{d.customerName ?? '—'}</Text> },
    { key: 'vendorName', header: 'Commerce', render: (d) => <Text variant="body">{d.vendorName}</Text> },
    { key: 'reason', header: 'Motif', render: (d) => <Text variant="body">{DISPUTE_REASON_LABELS[d.reason]}</Text> },
    {
      key: 'openedAt',
      header: 'Ouvert',
      sortable: true,
      sortValue: (d) => d.openedAt,
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
      <div>
        <Text as="h1" variant="display">
          Litiges
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Réclamations des clients à trier et à résoudre.
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
          keyField={(d) => d.orderId}
          onRowClick={(d) => router.push(`/disputes/${d.orderId}`)}
          loading={all === null}
          emptyIcon={MessageCircleWarning}
          emptyTitle="Aucun litige"
          emptyDescription="Aucun litige ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
