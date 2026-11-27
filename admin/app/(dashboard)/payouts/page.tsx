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
import { useAdmin } from '@/lib/permissions';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { ExportButton } from '@/components/data/ExportButton';
import { csvDate, type CsvColumn } from '@/lib/csv';

const ATTEMPT_STATUS_LABELS: Record<PayoutAttemptStatus, string> = { paid: 'Payé', skipped: 'Ignoré', failed: 'Échec' };

/** Who is owed — the "À payer" tab, as filtered. */
const OWED_CSV: CsvColumn<OwedCourier>[] = [
  { header: 'Livreur', value: (c) => c.courierName },
  { header: 'Identifiant livreur', value: (c) => c.courierId },
  { header: 'Montant dû ($)', value: (c) => c.pendingCad },
  { header: 'Courses', value: (c) => c.runCount },
  { header: 'Plus ancienne course', value: (c) => csvDate(c.oldestAt) },
  { header: 'Compte Stripe', value: (c) => c.accountId ?? 'Aucun' },
  { header: 'Dernière tentative', value: (c) => (c.lastAttempt ? ATTEMPT_STATUS_LABELS[c.lastAttempt.status] : '') },
  { header: 'Motif', value: (c) => (c.lastAttempt?.reason ? FAILURE_REASON_LABELS[c.lastAttempt.reason] : '') },
  { header: 'Date de la tentative', value: (c) => csvDate(c.lastAttempt?.at) },
];

/** One courier line of one run — the "Échecs" and "Payés" tabs. */
const ATTEMPT_CSV: CsvColumn<PayoutAttempt>[] = [
  { header: 'Date', value: (a) => csvDate(a.createdAt) },
  { header: 'Livreur', value: (a) => a.courierName },
  { header: 'Identifiant livreur', value: (a) => a.courierId },
  { header: 'Montant ($)', value: (a) => a.amountCad },
  { header: 'Courses', value: (a) => a.runCount },
  { header: 'Résultat', value: (a) => ATTEMPT_STATUS_LABELS[a.status] },
  { header: 'Motif', value: (a) => (a.reason ? FAILURE_REASON_LABELS[a.reason] : '') },
  { header: 'Erreur', value: (a) => a.error },
  { header: 'Virement Stripe', value: (a) => a.stripeTransferId },
  { header: 'Lancé par', value: (a) => (a.trigger === 'admin' ? 'Administrateur' : 'Planification') },
  { header: 'Lot', value: (a) => a.runId },
];

/** Every run — the "Historique" tab. */
const RUN_CSV: CsvColumn<PayoutRun>[] = [
  { header: 'Début', value: (r) => csvDate(r.startedAt) },
  { header: 'Fin', value: (r) => csvDate(r.finishedAt) },
  { header: 'Lancé par', value: (r) => (r.trigger === 'admin' ? r.actorName ?? 'Administrateur' : 'Planification') },
  { header: 'État', value: (r) => (r.status === 'done' ? 'Terminé' : r.status === 'failed' ? 'Échec' : 'En cours') },
  { header: 'Payés', value: (r) => r.paidCount },
  { header: 'Ignorés', value: (r) => r.skippedCount },
  { header: 'Échecs', value: (r) => r.failedCount },
  { header: 'Montant payé ($)', value: (r) => r.paidCad },
  { header: 'Erreur', value: (r) => r.error },
  { header: 'Lot', value: (r) => r.id },
];

const TABS = [
  { key: 'owed', label: 'À payer' },
  { key: 'failures', label: 'Échecs' },
  { key: 'paid', label: 'Virements' },
  { key: 'history', label: 'Lancements' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const OWED_FILTERS: { value: PayoutOwedFilter; label: string }[] = [
  { value: 'all', label: 'Tous les livreurs' },
  { value: 'no_account', label: 'Sans compte Stripe' },
  { value: 'failed', label: 'Dernier virement échoué' },
];

const RUN_STATUS: Record<PayoutRun['status'], { label: string; tone: 'success' | 'warning' | 'destructive' }> = {
  done: { label: 'Terminé', tone: 'success' },
  running: { label: 'En cours', tone: 'warning' },
  failed: { label: 'Interrompu', tone: 'destructive' },
};

function attemptBadge(a: { status: PayoutAttempt['status']; reason: PayoutAttempt['reason'] }) {
  if (a.status === 'paid') return <StatusBadge label="Payé" tone="success" />;
  const label = a.reason ? FAILURE_REASON_LABELS[a.reason] : a.status === 'skipped' ? 'Ignoré' : 'Échec';
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
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-content rounded-card" />}>
      <Payouts />
    </Suspense>
  );
}

function Payouts() {
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
      const parts = [`${result.paid} payé${result.paid > 1 ? 's' : ''} (${formatCad(result.totalCad)})`];
      if (result.skipped) parts.push(`${result.skipped} sans compte Stripe`);
      if (result.failed) parts.push(`${result.failed} en échec`);
      toast(result.failed ? 'error' : 'success', `Virements terminés : ${parts.join(', ')}.`);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Les virements n’ont pas pu être lancés.');
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
      header: 'Livreur',
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
      header: 'Montant dû',
      sortable: true,
      render: (c) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(c.pendingCad)}
        </Text>
      ),
    },
    { key: 'runs', header: 'Courses', sortable: true, render: (c) => <Text variant="body" className="tabular-nums">{c.runCount}</Text> },
    {
      key: 'oldest',
      header: 'Plus ancienne',
      sortable: true,
      render: (c) => (
        <Text variant="body" tone="muted">
          {formatDate(c.oldestAt)}
        </Text>
      ),
    },
    {
      key: 'account',
      header: 'Compte Stripe',
      render: (c) =>
        c.accountId ? (
          <StatusBadge label={c.connectStatus === 'active' ? 'Actif' : 'Configuré'} tone="success" />
        ) : (
          <StatusBadge label="À configurer" tone="warning" />
        ),
    },
    {
      key: 'last',
      header: 'Dernier essai',
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
            Jamais
          </Text>
        ),
    },
  ];

  const attemptColumns = (withError: boolean): Column<PayoutAttempt>[] => [
    {
      key: 'createdAt',
      header: 'Date',
      render: (a) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(a.createdAt)}
        </Text>
      ),
    },
    {
      key: 'courier',
      header: 'Livreur',
      render: (a) => (
        <Text variant="body" className="font-semibold">
          {a.courierName ?? '—'}
        </Text>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (a) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(a.amountCad)}
        </Text>
      ),
    },
    { key: 'runs', header: 'Courses', render: (a) => <Text variant="body" className="tabular-nums">{a.runCount}</Text> },
    { key: 'status', header: 'Statut', render: (a) => attemptBadge(a) },
    withError
      ? {
          key: 'error',
          header: 'Détail',
          className: 'max-w-[320px]',
          render: (a) => (
            <Text variant="caption" tone="muted" className="line-clamp-2">
              {a.error ?? (a.reason === 'no_account' ? 'Le livreur n’a pas terminé son inscription Stripe.' : '—')}
            </Text>
          ),
        }
      : {
          key: 'transfer',
          header: 'Virement Stripe',
          render: (a) => (
            <Text variant="caption" tone="muted" className="font-mono">
              {a.stripeTransferId ?? '—'}
            </Text>
          ),
        },
    {
      key: 'trigger',
      header: 'Lancé par',
      render: (a) => (
        <Text variant="body" tone="muted">
          {a.trigger === 'admin' ? 'Administrateur' : 'Automatique'}
        </Text>
      ),
    },
  ];

  const runColumns: Column<PayoutRun>[] = [
    {
      key: 'startedAt',
      header: 'Date',
      render: (r) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(r.startedAt)}
        </Text>
      ),
    },
    {
      key: 'trigger',
      header: 'Lancé par',
      render: (r) => (
        <Text variant="body" className="font-semibold">
          {r.trigger === 'admin' ? (r.actorName ?? 'Administrateur') : 'Automatique (vendredi)'}
        </Text>
      ),
    },
    {
      key: 'paid',
      header: 'Versé',
      render: (r) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(r.paidCad)}
        </Text>
      ),
    },
    {
      key: 'counts',
      header: 'Livreurs',
      render: (r) => (
        <Text variant="body" tone="muted">
          {r.paidCount} payés · {r.skippedCount} sans compte · {r.failedCount} échecs
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
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
        title="Virements"
        description="Ce que la plateforme doit aux livreurs, et l’historique des virements."
        actions={
          <>
            <Link href="/payouts/merchants" className="font-sans text-[0.8125rem] font-semibold text-muted-foreground hover:text-foreground">
              Versements aux commerces
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
                Lancer les virements
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          loading={!insights}
          icon={Banknote}
          label="À payer"
          value={formatCad(insights?.owedCad ?? 0)}
          hint={`${insights?.owedCouriers ?? 0} livreurs · ${insights?.owedRuns ?? 0} courses`}
        />
        <KpiCard
          loading={!insights}
          icon={UserX}
          tone="terracotta"
          label="Sans compte Stripe"
          value={formatCad(insights?.noAccountCad ?? 0)}
          hint={`${insights?.noAccountCouriers ?? 0} livreurs ne peuvent pas être payés`}
        />
        <KpiCard
          loading={!insights}
          icon={Send}
          label="Versé sur 30 jours"
          value={formatCad(insights?.paid30Cad ?? 0)}
          hint={`${insights?.paid30Couriers ?? 0} livreurs payés`}
        />
        <KpiCard
          loading={!insights}
          icon={CircleAlert}
          tone="mustard"
          label="Échecs sur 30 jours"
          value={String(insights?.failed30 ?? 0)}
          hint="Virements refusés ou non enregistrés"
        />
      </div>

      {insights && (
        <SectionCard title="Calendrier" subtitle="Les virements partent automatiquement chaque vendredi à 3 h (heure de Montréal)">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-3">
              <CalendarClock size={18} className="text-muted-foreground" />
              <Text variant="body">
                {lastRun ? (
                  <>
                    Dernier lancement : <span className="font-semibold">{formatDateTime(lastRun.startedAt)}</span> ·{' '}
                    {formatCad(lastRun.paidCad)} versés à {lastRun.paidCount} livreurs
                  </>
                ) : (
                  'Aucun virement n’a encore été lancé.'
                )}
              </Text>
            </div>
            {insights.oldestUnpaidAt && (
              <Text variant="body" tone="muted">
                Course impayée la plus ancienne : {formatDate(insights.oldestUnpaidAt)}
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
                placeholder="Rechercher un livreur…"
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
          { title: 'Rien à payer', description: 'Aucun livreur n’a de course livrée en attente de virement.' },
          (c) => router.push(`/couriers/${c.courierId}`)
        )}
      {tab === 'failures' &&
        table(failures, attemptColumns(true), (a) => a.id, {
          title: 'Aucun échec',
          description: 'Aucun virement n’a été refusé jusqu’ici.',
        })}
      {tab === 'paid' &&
        table(paid, attemptColumns(false), (a) => a.id, {
          title: 'Aucun virement',
          description: 'Aucun livreur n’a encore été payé.',
        })}
      {tab === 'history' &&
        table(runs, runColumns, (r) => r.id, {
          title: 'Aucun lancement',
          description: 'Les virements n’ont encore jamais été lancés.',
        })}

      <ConfirmDialog
        open={confirming}
        title="Lancer les virements ?"
        description={`${formatCad(payableCad)} seront virés maintenant à ${payableCouriers} livreur${payableCouriers > 1 ? 's' : ''} via Stripe. ${
          insights?.noAccountCouriers
            ? `${insights.noAccountCouriers} livreurs sans compte Stripe (${formatCad(insights.noAccountCad)}) seront ignorés et payés au prochain lancement après leur inscription. `
            : ''
        }Un virement envoyé ne peut pas être annulé ici.`}
        confirmLabel="Lancer les virements"
        onConfirm={run}
        onCancel={() => setConfirming(false)}
        busy={running}
      />
    </div>
  );
}
