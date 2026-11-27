'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Banknote, CalendarClock, CircleAlert, Search, Send, UserX } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { DataTable, type Column } from '@/components/data/DataTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Avatar, KpiCard, PageHeader, SectionCard } from '@/components/insights/Insights';
import {
  FAILURE_REASON_LABELS,
  getPayoutInsights,
  listOwed,
  listPayoutAttempts,
  listPayoutRuns,
  runPayouts,
  type OwedCourier,
  type PayoutAttempt,
  type PayoutAttemptStatus,
  type PayoutInsights,
  type PayoutOwedFilter,
  type PayoutRun,
} from '@/lib/api/payouts';
import { formatCad, formatDate, formatDateTime, timeAgo } from '@/lib/format';
// `translate`, not `t`: the tab loops below already call their item `t`.
import { t as translate, tx, lazy, useLocale } from '@/lib/i18n';
import { useAdmin } from '@/lib/permissions';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { ExportButton } from '@/components/data/ExportButton';
import { csvDate, type CsvColumn } from '@/lib/csv';

const ATTEMPT_STATUS_LABELS: Record<PayoutAttemptStatus, string> = lazy(() => ({
  paid: translate('payouts.attemptStatus.paid'),
  skipped: translate('payouts.attemptStatus.skipped'),
  failed: translate('payouts.attemptStatus.failed'),
}));

/** Who is owed — the "À payer" tab, as filtered. */
const OWED_CSV: CsvColumn<OwedCourier>[] = lazy(() => ([
  { header: translate('payouts.csv.courier'), value: (c) => c.courierName },
  { header: translate('payouts.csv.courierId'), value: (c) => c.courierId },
  { header: translate('payouts.csv.amountOwed'), value: (c) => c.pendingCad },
  { header: translate('payouts.csv.runs'), value: (c) => c.runCount },
  { header: translate('payouts.csv.oldestRun'), value: (c) => csvDate(c.oldestAt) },
  { header: translate('payouts.csv.stripeAccount'), value: (c) => c.accountId ?? translate('common.states.none') },
  { header: translate('payouts.csv.lastAttempt'), value: (c) => (c.lastAttempt ? ATTEMPT_STATUS_LABELS[c.lastAttempt.status] : '') },
  { header: translate('payouts.csv.reason'), value: (c) => (c.lastAttempt?.reason ? FAILURE_REASON_LABELS[c.lastAttempt.reason] : '') },
  { header: translate('payouts.csv.attemptDate'), value: (c) => csvDate(c.lastAttempt?.at) },
]));

/** One courier line of one run — the "Échecs" and "Payés" tabs. */
const ATTEMPT_CSV: CsvColumn<PayoutAttempt>[] = lazy(() => ([
  { header: translate('payouts.csv.date'), value: (a) => csvDate(a.createdAt) },
  { header: translate('payouts.csv.courier'), value: (a) => a.courierName },
  { header: translate('payouts.csv.courierId'), value: (a) => a.courierId },
  { header: translate('payouts.csv.amount'), value: (a) => a.amountCad },
  { header: translate('payouts.csv.runs'), value: (a) => a.runCount },
  { header: translate('payouts.csv.result'), value: (a) => ATTEMPT_STATUS_LABELS[a.status] },
  { header: translate('payouts.csv.reason'), value: (a) => (a.reason ? FAILURE_REASON_LABELS[a.reason] : '') },
  { header: translate('payouts.csv.error'), value: (a) => a.error },
  { header: translate('payouts.csv.stripeTransfer'), value: (a) => a.stripeTransferId },
  {
    header: translate('payouts.csv.startedBy'),
    value: (a) => (a.trigger === 'admin' ? translate('payouts.trigger.admin') : translate('payouts.trigger.schedule')),
  },
  { header: translate('payouts.csv.batch'), value: (a) => a.runId },
]));

/** Every run — the "Historique" tab. */
const RUN_CSV: CsvColumn<PayoutRun>[] = lazy(() => ([
  { header: translate('payouts.csv.start'), value: (r) => csvDate(r.startedAt) },
  { header: translate('payouts.csv.end'), value: (r) => csvDate(r.finishedAt) },
  {
    header: translate('payouts.csv.startedBy'),
    value: (r) => (r.trigger === 'admin' ? r.actorName ?? translate('payouts.trigger.admin') : translate('payouts.trigger.schedule')),
  },
  {
    header: translate('payouts.csv.state'),
    value: (r) =>
      r.status === 'done'
        ? translate('payouts.csv.runDone')
        : r.status === 'failed'
          ? translate('payouts.csv.runFailed')
          : translate('payouts.csv.runRunning'),
  },
  { header: translate('payouts.csv.paid'), value: (r) => r.paidCount },
  { header: translate('payouts.csv.skipped'), value: (r) => r.skippedCount },
  { header: translate('payouts.csv.failed'), value: (r) => r.failedCount },
  { header: translate('payouts.csv.amountPaid'), value: (r) => r.paidCad },
  { header: translate('payouts.csv.error'), value: (r) => r.error },
  { header: translate('payouts.csv.batch'), value: (r) => r.id },
]));

const TABS = lazy(() => ([
  { key: 'owed', label: translate('payouts.tabs.owed') },
  { key: 'failures', label: translate('payouts.tabs.failures') },
  { key: 'paid', label: translate('payouts.tabs.paid') },
  { key: 'history', label: translate('payouts.tabs.history') },
] as const));
type TabKey = (typeof TABS)[number]['key'];

const OWED_FILTERS: { value: PayoutOwedFilter; label: string }[] = lazy(() => ([
  { value: 'all', label: translate('payouts.filters.all') },
  { value: 'no_account', label: translate('payouts.filters.noAccount') },
  { value: 'failed', label: translate('payouts.filters.failed') },
]));

const RUN_STATUS: Record<PayoutRun['status'], { label: string; tone: 'success' | 'warning' | 'destructive' }> = lazy(() => ({
  done: { label: translate('payouts.runStatus.done'), tone: 'success' },
  running: { label: translate('payouts.runStatus.running'), tone: 'warning' },
  failed: { label: translate('payouts.runStatus.failed'), tone: 'destructive' },
}));

function attemptBadge(a: { status: PayoutAttempt['status']; reason: PayoutAttempt['reason'] }) {
  if (a.status === 'paid') return <StatusBadge label={translate('payouts.attemptStatus.paid')} tone="success" />;
  const label = a.reason
    ? FAILURE_REASON_LABELS[a.reason]
    : a.status === 'skipped'
      ? translate('payouts.attemptStatus.skipped')
      : translate('payouts.attemptStatus.failed');
  return <StatusBadge label={label} tone={a.status === 'skipped' ? 'warning' : 'destructive'} />;
}

/**
 * What the platform owes its couriers, and what happened when it tried to pay.
 *
 * The weekly batch (Friday 03:00, Montreal) pays every courier with a Stripe
 * account; this page shows who is still owed and why, every courier line of
 * every run, and lets an administrator with `payouts.run` start a run now.
 */
export default function PayoutsPage() {
  useLocale();
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-content rounded-card" />}>
      <Payouts />
    </Suspense>
  );
}

function Payouts() {
  useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: TabKey = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as TabKey) : 'owed';
  const toast = useToast();
  const { can } = useAdmin();

  const [insights, setInsights] = useState<PayoutInsights | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<PayoutOwedFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const loadInsights = useCallback(() => {
    getPayoutInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);
  useEffect(loadInsights, [loadInsights]);

  const owed = usePagedList<OwedCourier>(
    ({ offset, limit, sort }) => listOwed(filter, debouncedSearch, { offset, limit, sort: sort?.key, dir: sort?.dir }),
    `${filter}|${debouncedSearch}`,
    { sort: { key: 'amount', dir: 'desc' } }
  );
  const failures = usePagedList<PayoutAttempt>(({ offset, limit }) => listPayoutAttempts('failed', { offset, limit }), 'failed');
  const paid = usePagedList<PayoutAttempt>(({ offset, limit }) => listPayoutAttempts('paid', { offset, limit }), 'paid');
  const runs = usePagedList<PayoutRun>(({ offset, limit }) => listPayoutRuns({ offset, limit }), 'runs');

  const payableCad = insights ? insights.owedCad - insights.noAccountCad : 0;
  const payableCouriers = insights ? insights.owedCouriers - insights.noAccountCouriers : 0;

  async function run() {
    setRunning(true);
    try {
      const result = await runPayouts();
      // One whole sentence per outcome: the couriers skipped and the failures are named only when there are some.
      toast(
        result.failed ? 'error' : 'success',
        translate(
          result.skipped
            ? result.failed
              ? 'payouts.run.doneSkippedFailed'
              : 'payouts.run.doneSkipped'
            : result.failed
              ? 'payouts.run.doneFailed'
              : 'payouts.run.done',
          { count: result.paid, amount: formatCad(result.totalCad), skipped: result.skipped, failed: result.failed }
        )
      );
    } catch (error) {
      toast('error', error instanceof Error ? error.message : translate('payouts.run.failed'));
    }
    setRunning(false);
    setConfirming(false);
    loadInsights();
    owed.reload();
    failures.reload();
    paid.reload();
    runs.reload();
  }

  const owedColumns: Column<OwedCourier>[] = [
    {
      key: 'name',
      header: translate('payouts.columns.courier'),
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.courierName} size={32} />
          <Text variant="body" className="font-semibold">
            {c.courierName}
          </Text>
        </div>
      ),
    },
    {
      key: 'amount',
      header: translate('payouts.columns.amountOwed'),
      sortable: true,
      render: (c) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(c.pendingCad)}
        </Text>
      ),
    },
    {
      key: 'runs',
      header: translate('payouts.columns.runs'),
      sortable: true,
      render: (c) => <Text variant="body" className="tabular-nums">{c.runCount}</Text>,
    },
    {
      key: 'oldest',
      header: translate('payouts.columns.oldest'),
      sortable: true,
      render: (c) => (
        <Text variant="body" tone="muted">
          {formatDate(c.oldestAt)}
        </Text>
      ),
    },
    {
      key: 'account',
      header: translate('payouts.columns.stripeAccount'),
      render: (c) =>
        c.accountId ? (
          <StatusBadge
            label={c.connectStatus === 'active' ? translate('payouts.account.active') : translate('payouts.account.configured')}
            tone="success"
          />
        ) : (
          <StatusBadge label={translate('payouts.account.toSetUp')} tone="warning" />
        ),
    },
    {
      key: 'last',
      header: translate('payouts.columns.lastAttempt'),
      render: (c) =>
        c.lastAttempt ? (
          <div className="flex flex-col items-start gap-1">
            {attemptBadge(c.lastAttempt)}
            <Text variant="caption" tone="muted">
              {timeAgo(c.lastAttempt.at)}
            </Text>
          </div>
        ) : (
          <Text variant="body" tone="muted">
            {translate('common.states.never')}
          </Text>
        ),
    },
  ];

  const attemptColumns = (withError: boolean): Column<PayoutAttempt>[] => [
    {
      key: 'createdAt',
      header: translate('payouts.columns.date'),
      render: (a) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(a.createdAt)}
        </Text>
      ),
    },
    {
      key: 'courier',
      header: translate('payouts.columns.courier'),
      render: (a) => (
        <Text variant="body" className="font-semibold">
          {a.courierName ?? '—'}
        </Text>
      ),
    },
    {
      key: 'amount',
      header: translate('payouts.columns.amount'),
      render: (a) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(a.amountCad)}
        </Text>
      ),
    },
    {
      key: 'runs',
      header: translate('payouts.columns.runs'),
      render: (a) => <Text variant="body" className="tabular-nums">{a.runCount}</Text>,
    },
    { key: 'status', header: translate('payouts.columns.status'), render: (a) => attemptBadge(a) },
    withError
      ? {
          key: 'error',
          header: translate('payouts.columns.detail'),
          className: 'max-w-[320px]',
          render: (a) => (
            <Text variant="caption" tone="muted" className="line-clamp-2">
              {a.error ?? (a.reason === 'no_account' ? translate('payouts.noAccountDetail') : '—')}
            </Text>
          ),
        }
      : {
          key: 'transfer',
          header: translate('payouts.columns.stripeTransfer'),
          render: (a) => (
            <Text variant="caption" tone="muted" className="font-mono">
              {a.stripeTransferId ?? '—'}
            </Text>
          ),
        },
    {
      key: 'trigger',
      header: translate('payouts.columns.startedBy'),
      render: (a) => (
        <Text variant="body" tone="muted">
          {a.trigger === 'admin' ? translate('payouts.trigger.admin') : translate('payouts.trigger.automatic')}
        </Text>
      ),
    },
  ];

  const runColumns: Column<PayoutRun>[] = [
    {
      key: 'startedAt',
      header: translate('payouts.columns.date'),
      render: (r) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(r.startedAt)}
        </Text>
      ),
    },
    {
      key: 'trigger',
      header: translate('payouts.columns.startedBy'),
      render: (r) => (
        <Text variant="body" className="font-semibold">
          {r.trigger === 'admin' ? (r.actorName ?? translate('payouts.trigger.admin')) : translate('payouts.trigger.automaticFriday')}
        </Text>
      ),
    },
    {
      key: 'paid',
      header: translate('payouts.columns.paidOut'),
      render: (r) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(r.paidCad)}
        </Text>
      ),
    },
    {
      key: 'counts',
      header: translate('payouts.columns.couriers'),
      render: (r) => (
        <Text variant="body" tone="muted">
          {translate('payouts.runCounts', { paid: r.paidCount, skipped: r.skippedCount, failed: r.failedCount })}
        </Text>
      ),
    },
    {
      key: 'status',
      header: translate('payouts.columns.status'),
      render: (r) => <StatusBadge label={RUN_STATUS[r.status].label} tone={RUN_STATUS[r.status].tone} />,
    },
  ];

  function table<T>(
    list: ReturnType<typeof usePagedList<T>>,
    columns: Column<T>[],
    keyField: (row: T) => string,
    empty: { title: string; description: string },
    onRowClick?: (row: T) => void
  ) {
    return (
      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={keyField}
          onRowClick={onRowClick}
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
          emptyIcon={Banknote}
          emptyTitle={empty.title}
          emptyDescription={empty.description}
        />
      </Card>
    );
  }

  const lastRun = insights?.lastRun ?? null;

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Banknote}
        title={translate('payouts.title')}
        description={translate('payouts.description')}
        actions={
          <>
            <Link href="/payouts/merchants" className="font-sans text-[0.8125rem] font-semibold text-muted-foreground hover:text-foreground">
              {translate('payouts.merchantsLink')}
            </Link>
            {tab === 'owed' ? (
              <ExportButton
                name="virements-a-payer"
                columns={OWED_CSV}
                sort={owed.sort ? { sort: owed.sort.key, dir: owed.sort.dir } : undefined}
                fetchPage={(page) => listOwed(filter, debouncedSearch, page)}
              />
            ) : tab === 'history' ? (
              <ExportButton name="virements-historique" columns={RUN_CSV} fetchPage={(page) => listPayoutRuns(page)} />
            ) : (
              <ExportButton
                name={tab === 'failures' ? 'virements-echecs' : 'virements-payes'}
                columns={ATTEMPT_CSV}
                fetchPage={(page) => listPayoutAttempts(tab === 'failures' ? 'failed' : 'paid', page)}
              />
            )}
            {can('payouts.run') && (
              <Button onClick={() => setConfirming(true)} disabled={!insights || payableCouriers === 0 || running}>
                <Send size={15} />
                {translate('payouts.runButton')}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          loading={!insights}
          icon={Banknote}
          label={translate('payouts.kpi.owed')}
          value={formatCad(insights?.owedCad ?? 0)}
          hint={translate('payouts.kpi.owedHint', { couriers: insights?.owedCouriers ?? 0, runs: insights?.owedRuns ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={UserX}
          tone="terracotta"
          label={translate('payouts.kpi.noAccount')}
          value={formatCad(insights?.noAccountCad ?? 0)}
          hint={translate('payouts.kpi.noAccountHint', { count: insights?.noAccountCouriers ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={Send}
          label={translate('payouts.kpi.paid30')}
          value={formatCad(insights?.paid30Cad ?? 0)}
          hint={translate('payouts.kpi.paid30Hint', { count: insights?.paid30Couriers ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={CircleAlert}
          tone="mustard"
          label={translate('payouts.kpi.failed30')}
          value={String(insights?.failed30 ?? 0)}
          hint={translate('payouts.kpi.failed30Hint')}
        />
      </div>

      {insights && (
        <SectionCard title={translate('payouts.schedule.title')} subtitle={translate('payouts.schedule.subtitle')}>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-3">
              <CalendarClock size={18} className="text-muted-foreground" />
              <Text variant="body">
                {lastRun
                  ? tx(
                      'payouts.schedule.lastRun',
                      { date: <span className="font-semibold">{formatDateTime(lastRun.startedAt)}</span> },
                      { count: lastRun.paidCount, amount: formatCad(lastRun.paidCad) }
                    )
                  : translate('payouts.schedule.noRun')}
              </Text>
            </div>
            {insights.oldestUnpaidAt && (
              <Text variant="body" tone="muted">
                {translate('payouts.schedule.oldestUnpaid', { date: formatDate(insights.oldestUnpaidAt) })}
              </Text>
            )}
          </div>
        </SectionCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => router.replace(`${pathname}?tab=${t.key}`)}
              className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
                tab === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.key === 'owed' && insights ? ` (${insights.owedCouriers})` : ''}
              {t.key === 'failures' && insights && insights.failed30 > 0 ? ` (${insights.failed30})` : ''}
            </button>
          ))}
        </div>

        {tab === 'owed' && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as PayoutOwedFilter)}
              className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 font-sans text-[0.8125rem] font-medium text-foreground outline-none"
            >
              {OWED_FILTERS.map((o) => (
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
                placeholder={translate('payouts.searchPlaceholder')}
                className="w-full min-w-0 bg-transparent font-sans sm:w-48 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        )}
      </div>

      {tab === 'owed' &&
        table(
          owed,
          owedColumns,
          (c) => c.courierId,
          { title: translate('payouts.empty.owedTitle'), description: translate('payouts.empty.owedBody') },
          (c) => router.push(`/couriers/${c.courierId}`)
        )}
      {tab === 'failures' &&
        table(failures, attemptColumns(true), (a) => a.id, {
          title: translate('payouts.empty.failuresTitle'),
          description: translate('payouts.empty.failuresBody'),
        })}
      {tab === 'paid' &&
        table(paid, attemptColumns(false), (a) => a.id, {
          title: translate('payouts.empty.paidTitle'),
          description: translate('payouts.empty.paidBody'),
        })}
      {tab === 'history' &&
        table(runs, runColumns, (r) => r.id, {
          title: translate('payouts.empty.historyTitle'),
          description: translate('payouts.empty.historyBody'),
        })}

      <ConfirmDialog
        open={confirming}
        title={translate('payouts.confirm.title')}
        description={`${translate('payouts.confirm.amount', { count: payableCouriers, amount: formatCad(payableCad) })} ${
          insights?.noAccountCouriers
            ? `${translate('payouts.confirm.skipped', { count: insights.noAccountCouriers, amount: formatCad(insights.noAccountCad) })} `
            : ''
        }${translate('payouts.confirm.irreversible')}`}
        confirmLabel={translate('payouts.runButton')}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
        busy={running}
      />
    </div>
  );
}
