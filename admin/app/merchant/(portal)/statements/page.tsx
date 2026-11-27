'use client';
import { useEffect, useState } from 'react';
import { Banknote, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { PageHeader } from '@/components/insights/Insights';
import { PayoutsCard } from '@/components/merchant/PayoutsCard';
import { getMyStatementUrl, listMyStatements, statementMonth, type Statement, type StatementTotals } from '@/lib/api/statements';
import { formatCad } from '@/lib/format';
import { t, useLocale } from '@/lib/i18n';

type Loaded = Awaited<ReturnType<typeof listMyStatements>>;

/**
 * The shop's money, on the web: when it is next paid and into which account,
 * the month so far, then every statement issued, each downloadable as a PDF.
 * The same figures the mobile app shows.
 */
export default function MerchantStatementsPage() {
  useLocale();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    listMyStatements().then(setData).catch(() => setFailed(true));
  }, []);

  async function open(statement: Statement) {
    // Opened before the request, while this is still the click: a tab opened
    // after an `await` is a pop-up, and browsers block those.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setOpeningId(statement.id);
    try {
      const url = await getMyStatementUrl(statement.id);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      tab?.close();
      setFailed(true);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Banknote}
        title={t('portal.statements.title')}
        description={t('portal.statements.description')}
      />

      <PayoutsCard />

      {failed ? (
        <Text variant="body" tone="destructive">
          {t('portal.statements.loadFailed')}
        </Text>
      ) : null}

      {!data ? (
        !failed && <Skeleton className="h-48 rounded-card" />
      ) : (
        <>
          <Card className="p-5">
            <Text variant="label" tone="muted">
              {t('portal.statements.currentMonth')}
            </Text>
            <Text variant="subtitle" className="mb-4 mt-0.5 capitalize">
              {statementMonth(data.current.period)}
            </Text>
            <Figures totals={data.current.totals} />
            <Text variant="caption" tone="muted" className="mt-3">
              {t('portal.statements.provisional')}
            </Text>
          </Card>

          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              {t('portal.statements.issued')}
            </Text>
            {data.statements.length === 0 ? (
              <Text variant="body" tone="muted">
                {t('portal.statements.empty')}
              </Text>
            ) : (
              <ul className="flex flex-col">
                {data.statements.map((statement) => (
                  <li key={statement.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <FileText size={17} className="shrink-0 text-muted-foreground" />
                      <div>
                        <Text variant="body" className="font-medium capitalize">
                          {statementMonth(statement.period)}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {statement.number} · {t('portal.statements.orderCount', { count: statement.totals.orderCount })}
                        </Text>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <Text variant="body" className="tabular font-semibold">
                          {formatCad(Math.abs(statement.totals.balanceCad))}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {statement.totals.balanceCad < 0 ? t('portal.statements.owedToSougouba') : t('portal.statements.owedToYou')}
                        </Text>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => open(statement)} disabled={openingId === statement.id}>
                        {t('portal.statements.pdf')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Text variant="caption" tone="muted">
            {t('portal.statements.notInvoice')}
          </Text>
        </>
      )}
    </div>
  );
}

/** The month's money column: what the orders were worth to the shop, what came off, what was sent, what is left. */
function Figures({ totals }: { totals: StatementTotals }) {
  useLocale();
  const owed = totals.balanceCad < 0;
  return (
    <dl className="flex max-w-md flex-col gap-1.5 font-sans text-[0.875rem]">
      <Line
        label={t('portal.statements.lines.delivered', { count: totals.orderCount })}
        value={formatCad(totals.goodsCad + totals.gstCad + totals.qstCad)}
      />
      {totals.couponsCad > 0 && <Line label={t('portal.statements.lines.coupons')} value={formatCad(-totals.couponsCad)} />}
      <Line label={t('portal.statements.lines.commission')} value={formatCad(-totals.commissionCad)} />
      <Line label={t('portal.statements.lines.earned')} value={formatCad(totals.earnedCad)} />
      {totals.refundCount > 0 && <Line label={t('portal.statements.lines.refunds')} value={formatCad(-totals.refundsCad)} />}
      {totals.openingCad !== 0 && <Line label={t('portal.statements.lines.opening')} value={formatCad(totals.openingCad)} />}
      {totals.payoutCount > 0 && <Line label={t('portal.statements.lines.paid')} value={formatCad(-totals.paidCad)} />}
      <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-border pt-2.5">
        <dt className="font-semibold">{owed ? t('portal.statements.lines.balanceOwed') : t('portal.statements.lines.balance')}</dt>
        <dd className={`tabular text-[1.125rem] font-bold ${owed ? 'text-destructive' : 'text-primary'}`}>{formatCad(Math.abs(totals.balanceCad))}</dd>
      </div>
    </dl>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  useLocale();
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
