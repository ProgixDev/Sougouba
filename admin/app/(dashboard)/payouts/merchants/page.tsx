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
import { useAdmin } from '@/lib/permissions';
import { usePagedList } from '@/lib/usePagedList';

const PAYOUT_STATUS: Record<MerchantPayout['status'], { label: string; tone: 'success' | 'warning' | 'destructive' }> = {
  paid: { label: 'Payé', tone: 'success' },
  pending: { label: 'En cours', tone: 'warning' },
  failed: { label: 'Échec', tone: 'destructive' },
};

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
        toast('error', 'Les versements aux commerces ne sont pas ouverts sur ce serveur : rien n’a été envoyé.');
      } else {
        const parts = [`${result.paid} payé${result.paid > 1 ? 's' : ''} (${formatCad(result.totalCad)})`];
        if (result.skipped) parts.push(`${result.skipped} sans compte Stripe prêt`);
        if (result.failed) parts.push(`${result.failed} en échec`);
        toast(result.failed ? 'error' : 'success', `Versements terminés : ${parts.join(', ')}.`);
      }
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Les versements n’ont pas pu être lancés.');
    }
    setRunning(false);
    setConfirming(false);
    loadOwed();
    history.reload();
  }

  const owedColumns: Column<OwedMerchant>[] = [
    {
      key: 'name',
      header: 'Commerce',
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
      header: 'Prochain versement',
      render: (s) => (
        <Text variant="body" tone={s.pendingCad < 0 ? 'destructive' : undefined} className="font-semibold tabular-nums">
          {formatCad(s.pendingCad)}
        </Text>
      ),
    },
    { key: 'orders', header: 'Commandes', render: (s) => <Text variant="body" className="tabular-nums">{s.orderCount}</Text> },
    {
      key: 'adjustments',
      header: 'Remboursements retenus',
      render: (s) => (
        <Text variant="body" tone="muted" className="tabular-nums">
          {s.adjustmentsCad === 0 ? '—' : formatCad(s.adjustmentsCad)}
        </Text>
      ),
    },
    {
      key: 'oldest',
      header: 'Plus ancienne',
      render: (s) => (
        <Text variant="body" tone="muted">
          {s.oldestAt ? formatDate(s.oldestAt) : '—'}
        </Text>
      ),
    },
    {
      key: 'account',
      header: 'Compte Stripe',
      render: (s) => (s.hasStripeAccount ? <StatusBadge label="Relié" tone="success" /> : <StatusBadge label="À configurer" tone="warning" />),
    },
  ];

  const historyColumns: Column<MerchantPayout>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (p) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(p.paidAt ?? p.createdAt)}
        </Text>
      ),
    },
    {
      key: 'vendor',
      header: 'Commerce',
      render: (p) => (
        <Text variant="body" className="font-semibold">
          {p.vendor?.name ?? '—'}
        </Text>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (p) => (
        <Text variant="body" className="font-semibold tabular-nums">
          {formatCad(p.amountCad)}
        </Text>
      ),
    },
    { key: 'orders', header: 'Commandes', render: (p) => <Text variant="body" className="tabular-nums">{p.orderCount}</Text> },
    {
      key: 'status',
      header: 'Statut',
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
      header: 'Lancé par',
      render: (p) => (
        <Text variant="body" tone="muted">
          {p.trigger === 'admin' ? 'Administrateur' : 'Planification'}
        </Text>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Store}
        title="Versements aux commerces"
        description="Ce que la plateforme doit aux commerces pour les commandes livrées, et les versements effectués."
        actions={
          <>
            <Link href="/payouts" className="font-sans text-[0.8125rem] font-semibold text-muted-foreground hover:text-foreground">
              Virements des livreurs
            </Link>
            {can('payouts.run') && (
              <Button onClick={() => setConfirming(true)} disabled={!owed?.enabled || payable.length === 0 || running}>
                <Send size={15} />
                Payer les commerces
              </Button>
            )}
          </>
        }
      />

      {failed && (
        <Text variant="body" tone="destructive">
          Impossible de charger les soldes des commerces. Rechargez la page.
        </Text>
      )}

      {owed && !owed.enabled && (
        <Card className="flex items-start gap-3 p-5">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-mustard-600" />
          <div>
            <Text variant="body" className="font-semibold">
              Les versements aux commerces ne sont pas ouverts
            </Text>
            <Text variant="body" tone="muted" className="mt-0.5 max-w-3xl">
              Aucun commerce n’est payé tant que la date de départ n’est pas fixée sur le serveur (variable MERCHANT_PAYOUTS_FROM). Les
              commandes livrées avant cette date ne seront jamais payées par la plateforme : fixez-la au jour où les vrais paiements
              commencent.
            </Text>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          loading={!owed}
          icon={Banknote}
          label="À verser"
          value={formatCad(sum(payable))}
          hint={`${payable.length} commerce${payable.length > 1 ? 's' : ''} avec un compte Stripe`}
        />
        <KpiCard
          loading={!owed}
          icon={UserX}
          tone="terracotta"
          label="Sans compte Stripe"
          value={formatCad(sum(waiting))}
          hint={`${waiting.length} commerce${waiting.length > 1 ? 's' : ''} en attente de leur compte bancaire`}
        />
        <KpiCard
          loading={!owed}
          icon={CircleAlert}
          tone="mustard"
          label="Dû par des commerces"
          value={formatCad(Math.abs(sum(inDebt)))}
          hint="Remboursements à retenir sur les prochains versements"
        />
      </div>

      <SectionCard
        title="À verser"
        subtitle={
          owed?.from
            ? `Commandes livrées depuis le ${formatDate(`${owed.from}T12:00:00`)}, non encore versées. Versement automatique chaque vendredi.`
            : 'Commandes livrées et non encore versées.'
        }
      >
        <DataTable
          columns={owedColumns}
          rows={shops}
          keyField={(s) => s.vendorId}
          onRowClick={(s) => router.push(`/merchants/${s.vendorId}`)}
          loading={!owed && !failed}
          emptyIcon={Banknote}
          emptyTitle="Rien à verser"
          emptyDescription={
            owed && !owed.enabled
              ? 'Les soldes s’afficheront ici une fois les versements ouverts.'
              : 'Aucun commerce n’a de commande livrée en attente de versement.'
          }
        />
      </SectionCard>

      <div>
        <Text variant="subtitle" className="mb-3">
          Historique
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
            emptyTitle="Aucun versement"
            emptyDescription="Aucun commerce n’a encore été payé."
          />
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Payer les commerces ?"
        description={`${formatCad(sum(payable))} seront virés maintenant à ${payable.length} commerce${payable.length > 1 ? 's' : ''} via Stripe. ${
          waiting.length
            ? `${waiting.length} sans compte Stripe (${formatCad(sum(waiting))}) seront ignorés et payés au premier lancement après leur inscription. `
            : ''
        }Un commerce dont Stripe n’a pas fini de vérifier le compte est ignoré lui aussi. Un versement envoyé ne peut pas être annulé ici.`}
        confirmLabel="Payer les commerces"
        onConfirm={run}
        onCancel={() => setConfirming(false)}
        busy={running}
      />
    </div>
  );
}
