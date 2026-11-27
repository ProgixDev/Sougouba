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
import { formatDateTime, formatPercent } from '@/lib/format';
// `translate`, not `t`: the tab loop below already calls its item `t`.
import { t as translate } from '@/lib/i18n';

const TABS: { key: 'escalated' | 'closed' | 'all'; label: string }[] = [
  { key: 'escalated', label: translate('support.list.tabs.escalated') },
  { key: 'closed', label: translate('support.list.tabs.closed') },
  { key: 'all', label: translate('support.list.tabs.all') },
];

const ROLE_PREFIX: Record<string, string> = {
  user: translate('support.list.roles.user'),
  assistant: translate('support.list.roles.assistant'),
  agent: translate('support.list.roles.agent'),
  system: '',
};

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
      header: translate('support.list.columns.customer'),
      render: (c) => (
        <Text variant="body" className="font-semibold">
          {c.customer.fullName ?? translate('support.customerFallback')}
        </Text>
      ),
    },
    {
      key: 'last',
      header: translate('support.list.columns.lastMessage'),
      render: (c) =>
        c.lastMessage ? (
          <Text variant="body" tone="muted" className="line-clamp-2 max-w-md">
            {ROLE_PREFIX[c.lastMessage.role]
              ? translate('support.list.preview', { role: ROLE_PREFIX[c.lastMessage.role], preview: c.lastMessage.preview })
              : c.lastMessage.preview}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            {translate('support.list.noMessage')}
          </Text>
        ),
    },
    {
      key: 'lastMessageAt',
      header: translate('support.list.columns.activity'),
      render: (c) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(c.lastMessageAt)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: translate('support.list.columns.status'),
      render: (c) =>
        c.status === 'closed' ? (
          <Badge tone="neutral">{translate('support.status.resolved')}</Badge>
        ) : c.awaitingTeam ? (
          <Badge tone="destructive">{translate('support.status.awaitingTeam')}</Badge>
        ) : (
          <Badge tone="primary">{translate('support.status.answered')}</Badge>
        ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Headset}
        title={translate('support.title')}
        description={translate('support.list.description')}
      />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Headset}
          tone="terracotta"
          label={translate('support.list.kpi.waiting')}
          value={String(insights?.waiting ?? 0)}
          hint={translate('support.list.kpi.waitingHint')}
        />
        <KpiCard
          loading={!insights}
          icon={CheckCircle2}
          label={translate('support.list.kpi.resolved')}
          value={String(insights?.resolved30 ?? 0)}
          hint={translate('support.list.kpi.resolvedHint', { count: insights?.escalated30 ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={Clock}
          tone="mustard"
          label={translate('support.list.kpi.resolutionTime')}
          value={formatHours(insights?.avgResolutionHours)}
          hint={translate('support.list.kpi.resolutionTimeHint')}
        />
        <KpiCard
          loading={!insights}
          icon={Bot}
          tone="neutral"
          label={translate('support.list.kpi.assistant')}
          value={
            insights && insights.conversations30 > 0
              ? formatPercent(1 - insights.escalated30 / insights.conversations30)
              : '—'
          }
          hint={translate('support.list.kpi.assistantHint', {
            conversations: insights?.conversations30 ?? 0,
            messages: insights?.messages30 ?? 0,
          })}
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
          emptyTitle={tab === 'escalated' ? translate('support.list.empty.escalatedTitle') : translate('support.list.empty.title')}
          emptyDescription={
            tab === 'escalated'
              ? translate('support.list.empty.escalatedBody')
              : translate('support.list.empty.body')
          }
        />
      </Card>

    </div>
  );
}
