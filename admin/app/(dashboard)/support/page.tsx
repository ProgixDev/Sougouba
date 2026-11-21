'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, CheckCircle2, Clock, Headset } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { useToast } from '@/components/Toast';
import { KpiCard, KpiGrid, PageHeader } from '@/components/insights/Insights';
import { formatHours, getSupportInsights, type SupportInsights } from '@/lib/api/insights';
import { listSupport, type SupportInboxItem } from '@/lib/api/support';
import { usePagedList } from '@/lib/usePagedList';
import { formatDateTime } from '@/lib/format';

const TABS: { key: 'escalated' | 'closed' | 'all'; label: string }[] = [
  { key: 'escalated', label: 'À traiter' },
  { key: 'closed', label: 'Résolues' },
  { key: 'all', label: 'Toutes' },
];

const ROLE_PREFIX: Record<string, string> = { user: 'Client', assistant: 'Assistant', agent: 'Équipe', system: '' };

/**
 * Conversations customers handed from the support assistant to the team.
 *
 * "À traiter" lists the escalated ones with the oldest activity first, so a
 * customer who has waited longest is at the top. Assistant-only conversations
 * never appear here: nobody asked for a person.
 */
export default function SupportInboxPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('escalated');
  const [insights, setInsights] = useState<SupportInsights | null>(null);

  useEffect(() => {
    getSupportInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  // "À traiter" keeps the API's order: longest-waiting customer first.
  const list = usePagedList<SupportInboxItem>(({ offset, limit }) => listSupport(tab, offset, limit), tab);
  useEffect(() => {
    if (list.error) toast('error', list.error);
  }, [list.error, toast]);

  const columns: Column<SupportInboxItem>[] = [
    {
      key: 'customer',
      header: 'Client',
      render: (c) => (
        <Text variant="body" className="font-semibold">
          {c.customer.fullName ?? 'Client'}
        </Text>
      ),
    },
    {
      key: 'last',
      header: 'Dernier message',
      render: (c) =>
        c.lastMessage ? (
          <Text variant="body" tone="muted" className="line-clamp-2 max-w-md">
            {ROLE_PREFIX[c.lastMessage.role] ? `${ROLE_PREFIX[c.lastMessage.role]} : ` : ''}
            {c.lastMessage.preview}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            Aucun message pour l’instant
          </Text>
        ),
    },
    {
      key: 'lastMessageAt',
      header: 'Activité',
      render: (c) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(c.lastMessageAt)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (c) =>
        c.status === 'closed' ? (
          <Badge tone="neutral">Résolue</Badge>
        ) : c.awaitingTeam ? (
          <Badge tone="destructive">Réponse attendue</Badge>
        ) : (
          <Badge tone="primary">Répondue</Badge>
        ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Headset}
        title="Support"
        description="Conversations transmises de l’assistant à l’équipe. Votre réponse arrive dans l’application du client."
      />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Headset}
          tone="terracotta"
          label="En attente de l’équipe"
          value={String(insights?.waiting ?? 0)}
          hint="Conversations à traiter"
        />
        <KpiCard
          loading={!insights}
          icon={CheckCircle2}
          label="Résolues · 30 j"
          value={String(insights?.resolved30 ?? 0)}
          hint={`${insights?.escalated30 ?? 0} transmises à l’équipe sur la période`}
        />
        <KpiCard
          loading={!insights}
          icon={Clock}
          tone="mustard"
          label="Délai moyen de résolution"
          value={formatHours(insights?.avgResolutionHours)}
          hint="De la demande d’un humain à la résolution"
        />
        <KpiCard
          loading={!insights}
          icon={Bot}
          tone="neutral"
          label="Réglées par l’assistant · 30 j"
          value={
            insights && insights.conversations30 > 0
              ? `${Math.round(100 * (1 - insights.escalated30 / insights.conversations30))} %`
              : '—'
          }
          hint={`${insights?.conversations30 ?? 0} conversations, ${insights?.messages30 ?? 0} messages de clients`}
        />
      </KpiGrid>

      <div className="flex gap-1.5 self-start rounded-full border border-border bg-card p-1">
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
          rows={list.rows ?? []}
          keyField={(c) => c.id}
          onRowClick={(c) => router.push(`/support/${c.id}`)}
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
          emptyIcon={Headset}
          emptyTitle={tab === 'escalated' ? 'Aucune conversation en attente' : 'Aucune conversation'}
          emptyDescription={
            tab === 'escalated'
              ? 'Quand un client demande à parler à l’équipe, sa conversation apparaît ici.'
              : 'Aucune conversation ne correspond à ce filtre.'
          }
        />
      </Card>

    </div>
  );
}
