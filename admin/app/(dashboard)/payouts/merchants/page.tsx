'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banknote, CircleAlert, Send, Store, UserX } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Avatar, KpiCard, PageHeader, SectionCard } from '@/components/insights/Insights';
import {
  FAILURE_REASON_LABELS,
  getMerchantsOwed,
  listMerchantPayouts,
  runMerchantPayouts,
  type MerchantPayout,
  type MerchantsOwed,
  type OwedMerchant,
} from '@/lib/api/payouts';
import { formatCad, formatDate, formatDateTime } from '@/lib/format';
import { t, lazy, useLocale } from '@/lib/i18n';
import { useAdmin } from '@/lib/permissions';
import { usePagedList } from '@/lib/usePagedList';

const PAYOUT_STATUS: Record<MerchantPayout['status'], { label: string; tone: 'success' | 'warning' | 'destructive' }> = lazy(() => ({
  paid: { label: t('payouts.merchants.status.paid'), tone: 'success' },
  pending: { label: t('payouts.merchants.status.pending'), tone: 'warning' },
  failed: { label: t('payouts.merchants.status.failed'), tone: 'destructive' },
}));

/**
 * What the platform owes its shops, and every payment made to them.
 *
 * Each Friday, after the couriers, every shop Stripe can pay receives one
 * transfer for the orders delivered since its last: its goods and their taxes,
 * less the commission and its own promo codes (`api/src/orders/split.ts`). A
 * shop with no Stripe account keeps accruing and is paid by the first run
 * after it links one. An administrator with `payouts.run` can start a run now.
 */
export default function MerchantPayoutsPage() {
  useLocale();
  const router = useRouter();
  const toast = useToast();
  const { can } = useAdmin();
  const [owed, setOwed] = useState<MerchantsOwed | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  const loadOwed = useCallback(() => {
    getMerchantsOwed()
      .then((loaded) => {
        setOwed(loaded);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(loadOwed, [loadOwed]);

  const history = usePagedList<MerchantPayout>(({ offset, limit }) => listMerchantPayouts({ offset, limit }), 'history');

  const shops = owed?.shops ?? [];
  // What a run would actually send: shops owed something, with an account to send it to.
  const payable = shops.filter((s) => s.pendingCad > 0 && s.hasStripeAccount);
  const waiting = shops.filter((s) => s.pendingCad > 0 && !s.hasStripeAccount);
  const inDebt = shops.filter((s) => s.pendingCad < 0);
  const sum = (rows: OwedMerchant[]) => rows.reduce((total, s) => total + s.pendingCad, 0);

  async function run() {
    setRunning(true);
    try {
      const result = await runMerchantPayouts();
      if (!result.enabled) {
        toast('error', t('payouts.merchants.run.notOpen'));
      } else {
        // One whole sentence per outcome: the shops skipped and the failures are named only when there are some.
        toast(
          result.failed ? 'error' : 'success',
          t(
            result.skipped
              ? result.failed
                ? 'payouts.merchants.run.doneSkippedFailed'
                : 'payouts.merchants.run.doneSkipped'
              : result.failed
                ? 'payouts.merchants.run.doneFailed'
                : 'payouts.merchants.run.done',
            { count: result.paid, amount: formatCad(result.totalCad), skipped: result.skipped, failed: result.failed }
          )
        );
      }
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('payouts.merchants.run.failed'));
    }
    setRunning(false);
    setConfirming(false);
    loadOwed();
    history.reload();
  }

  const owedColumns: Column<OwedMerchant>[] = [
    {
      key: 'name',
      header: t('payouts.merchants.columns.shop'),
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={s.vendorName} size={32} />
          <Text variant="body" className="font-semibold">
            {s.vendorName}
          </Text>
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('payouts.merchants.columns.nextPayout'),
      render: (s) => (
        <Text variant="body" tone={s.pendingCad < 0 ? 'destructive' : undefined} className="font-semibold tabular-nums">
          {formatCad(s.pendingCad)}
        </Text>
      ),
    },
    {
      key: 'orders',
      header: t('payouts.merchants.columns.orders'),
      render: (s) => <Text variant="body" className="tabular-nums">{s.orderCount}</Text>,
    },
    {
      key: 'adjustments',
      header: t('payouts.merchants.columns.refundsWithheld'),
      render: (s) => (
        <Text variant="body" tone="muted" className="tabular-nums">
          {s.adjustmentsCad === 0 ? '—' : formatCad(s.adjustmentsCad)}
        </Text>
      ),
    },
    {
      key: 'oldest',
      header: t('payouts.merchants.columns.oldest'),
      render: (s) => (
        <Text variant="body" tone="muted">
          {s.oldestAt ? formatDate(s.oldestAt) : '—'}
        </Text>
      ),
    },
    {
      key: 'account',
      header: t('payouts.merchants.columns.stripeAccount'),
      render: (s) =>
        s.hasStripeAccount ? (
          <StatusBadge label={t('payouts.merchants.account.linked')} tone="success" />
        ) : (
          <StatusBadge label={t('payouts.merchants.account.toSetUp')} tone="warning" />
        ),
    },
  ];

  const historyColumns: Column<MerchantPayout>[] = [
    {
      key: 'createdAt',
      header: t('payouts.merchants.columns.date'),
      render: (p) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(p.paidAt ?? p.createdAt)}
        </Text>
      ),
    },
    {
      key: 'vendor',
      header: t('payouts.merchants.columns.shop'),
      render: (p) => (
        <Text variant="body" className="font-semibold">
          {p.vendor?.name ?? '—'}
        </Text>
      ),
    },
    {
      key: 'amount',
      header: t('payouts.merchants.columns.amount'),
      render: (p) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(p.amountCad)}
        </Text>
      ),
    },
    {
      key: 'orders',
      header: t('payouts.merchants.columns.orders'),
      render: (p) => <Text variant="body" className="tabular-nums">{p.orderCount}</Text>,
    },
    {
      key: 'status',
      header: t('payouts.merchants.columns.status'),
      render: (p) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge
            label={p.status === 'failed' && p.reason ? FAILURE_REASON_LABELS[p.reason] : PAYOUT_STATUS[p.status].label}
            tone={PAYOUT_STATUS[p.status].tone}
          />
          {p.error && (
            <Text variant="caption" tone="muted" className="max-w-xs [overflow-wrap:anywhere]">
              {p.error}
            </Text>
          )}
        </div>
      ),
    },
    {
      key: 'trigger',
      header: t('payouts.merchants.columns.startedBy'),
      render: (p) => (
        <Text variant="body" tone="muted">
          {p.trigger === 'admin' ? t('payouts.merchants.trigger.admin') : t('payouts.merchants.trigger.schedule')}
        </Text>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Store}
        title={t('payouts.merchants.title')}
        description={t('payouts.merchants.description')}
        actions={
          <>
            <Link href="/payouts" className="font-sans text-[0.8125rem] font-semibold text-muted-foreground hover:text-foreground">
              {t('payouts.merchants.couriersLink')}
            </Link>
            {can('payouts.run') && (
              <Button onClick={() => setConfirming(true)} disabled={!owed?.enabled || payable.length === 0 || running}>
                <Send size={15} />
                {t('payouts.merchants.runButton')}
              </Button>
            )}
          </>
        }
      />

      {failed && (
        <Text variant="body" tone="destructive">
          {t('payouts.merchants.loadFailed')}
        </Text>
      )}

      {owed && !owed.enabled && (
        <Card className="flex items-start gap-3 p-5">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-mustard-600" />
          <div>
            <Text variant="body" className="font-semibold">
              {t('payouts.merchants.notOpen.title')}
            </Text>
            <Text variant="body" tone="muted" className="mt-0.5 max-w-3xl">
              {t('payouts.merchants.notOpen.body')}
            </Text>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          loading={!owed}
          icon={Banknote}
          label={t('payouts.merchants.kpi.toPay')}
          value={formatCad(sum(payable))}
          hint={t('payouts.merchants.kpi.toPayHint', { count: payable.length })}
        />
        <KpiCard
          loading={!owed}
          icon={UserX}
          tone="terracotta"
          label={t('payouts.merchants.kpi.noAccount')}
          value={formatCad(sum(waiting))}
          hint={t('payouts.merchants.kpi.noAccountHint', { count: waiting.length })}
        />
        <KpiCard
          loading={!owed}
          icon={CircleAlert}
          tone="mustard"
          label={t('payouts.merchants.kpi.inDebt')}
          value={formatCad(Math.abs(sum(inDebt)))}
          hint={t('payouts.merchants.kpi.inDebtHint')}
        />
      </div>

      <SectionCard
        title={t('payouts.merchants.owed.title')}
        subtitle={
          owed?.from
            ? t('payouts.merchants.owed.subtitleSince', { date: formatDate(`${owed.from}T12:00:00`) })
            : t('payouts.merchants.owed.subtitle')
        }
      >
        <DataTable
          columns={owedColumns}
          rows={shops}
          keyField={(s) => s.vendorId}
          onRowClick={(s) => router.push(`/merchants/${s.vendorId}`)}
          loading={!owed && !failed}
          emptyIcon={Banknote}
          emptyTitle={t('payouts.merchants.owed.emptyTitle')}
          emptyDescription={
            owed && !owed.enabled
              ? t('payouts.merchants.owed.emptyNotOpen')
              : t('payouts.merchants.owed.emptyBody')
          }
        />
      </SectionCard>

      <div>
        <Text variant="subtitle" className="mb-3">
          {t('payouts.merchants.history.title')}
        </Text>
        <Card elevated>
          <DataTable
            columns={historyColumns}
            rows={history.rows ?? []}
            keyField={(p) => p.id}
            loading={history.rows === null}
            server={{
              page: history.page,
              pageSize: history.pageSize,
              total: history.total,
              onPage: history.setPage,
              onPageSize: history.setPageSize,
              sort: history.sort,
              onSort: history.setSort,
            }}
            emptyIcon={Send}
            emptyTitle={t('payouts.merchants.history.emptyTitle')}
            emptyDescription={t('payouts.merchants.history.emptyBody')}
          />
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t('payouts.merchants.confirm.title')}
        description={`${t('payouts.merchants.confirm.amount', { count: payable.length, amount: formatCad(sum(payable)) })} ${
          waiting.length
            ? `${t('payouts.merchants.confirm.skipped', { count: waiting.length, amount: formatCad(sum(waiting)) })} `
            : ''
        }${t('payouts.merchants.confirm.notes')}`}
        confirmLabel={t('payouts.merchants.runButton')}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
        busy={running}
      />
    </div>
  );
}
