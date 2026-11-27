'use client';
import { useEffect, useState } from 'react';
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
import { t as translate } from '@/lib/i18n';
import type { AdminCourierIssue, CourierIssueStatus } from '@/lib/types';
import { usePagedList } from '@/lib/usePagedList';

const TABS: { key: CourierIssueStatus | 'all'; label: string }[] = [
  { key: 'open', label: translate('courierIssues.list.tabs.open') },
  { key: 'resolved', label: translate('courierIssues.list.tabs.resolved') },
  { key: 'all', label: translate('courierIssues.list.tabs.all') },
];

export default function CourierIssuesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<CourierIssueStatus | 'all'>('open');

  const [insights, setInsights] = useState<CourierIssueInsights | null>(null);

  useEffect(() => {
    getCourierIssueInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  // Oldest first by default — a queue is worked from the front. One page at a time from the database.
  const list = usePagedList<AdminCourierIssue>(
    ({ offset, limit, sort }) => listCourierIssues(tab === 'all' ? undefined : tab, { offset, limit, dir: sort?.dir }),
    tab
  );


  const columns: Column<AdminCourierIssue>[] = [
    { key: 'orderId', header: translate('courierIssues.list.columns.order'), render: (i) => <Text variant="body" className="font-semibold">#{i.orderId}</Text> },
    { key: 'courierName', header: translate('courierIssues.list.columns.courier'), render: (i) => <Text variant="body">{i.courierName ?? '—'}</Text> },
    { key: 'vendorName', header: translate('courierIssues.list.columns.shop'), render: (i) => <Text variant="body">{i.vendorName}</Text> },
    { key: 'reason', header: translate('courierIssues.list.columns.reason'), render: (i) => <Text variant="body">{COURIER_ISSUE_REASON_LABELS[i.reason]}</Text> },
    {
      key: 'at',
      header: translate('courierIssues.list.columns.reported'),
      sortable: true,
      render: (i) => (
        <Text variant="body" tone="muted">
          {timeAgo(i.at)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: translate('courierIssues.list.columns.status'),
      render: (i) => {
        const meta = courierIssueStatusMeta(i.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader icon={TriangleAlert} title={translate('courierIssues.list.title')} description={translate('courierIssues.list.description')} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1 xl:grid-cols-3">
          <KpiCard
            loading={!insights}
            icon={TriangleAlert}
            tone="terracotta"
            label={translate('courierIssues.list.kpis.open')}
            value={String(insights?.byStatus.open ?? 0)}
            hint={translate('courierIssues.list.kpis.openHint')}
          />
          <KpiCard
            loading={!insights}
            icon={CheckCircle2}
            label={translate('courierIssues.list.kpis.resolved')}
            value={String(insights?.byStatus.resolved ?? 0)}
            hint={translate('courierIssues.list.kpis.reported30', { count: insights?.reported30 ?? 0 })}
          />
          <KpiCard
            loading={!insights}
            icon={Clock}
            tone="mustard"
            label={translate('courierIssues.list.kpis.avgTime')}
            value={formatHours(insights?.avgResolutionHours)}
            hint={translate('courierIssues.list.kpis.avgTimeHint')}
          />
        </div>
        {insights && (
          <SectionCard title={translate('courierIssues.list.reasons.title')} subtitle={translate('courierIssues.list.reasons.subtitle')}>
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
            {t.key !== 'all' && insights ? ` (${insights.byStatus[t.key] ?? 0})` : ''}
          </button>
        ))}
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(i) => i.orderId}
          onRowClick={(i) => router.push(`/courier-issues/${i.orderId}`)}
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
          emptyIcon={TriangleAlert}
          emptyTitle={translate('courierIssues.list.empty.title')}
          emptyDescription={translate('courierIssues.list.empty.description')}
        />
      </Card>
    </div>
  );
}
