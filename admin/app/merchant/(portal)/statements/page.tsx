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

type Loaded = Awaited<ReturnType<typeof listMyStatements>>;

/**
 * The shop's money, on the web: when it is next paid and into which account,
 * the month so far, then every statement issued, each downloadable as a PDF.
 * The same figures the mobile app shows.
 */
export default function MerchantStatementsPage() {
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
        title="Relevés et versements"
        description="Votre part des ventes, ce qui vous a été versé et ce qui vous est dû. Un relevé est émis le 1er de chaque mois."
      />

      <PayoutsCard />

      {failed ? (
        <Text variant="body" tone="destructive">
          Impossible de charger vos relevés. Vérifiez votre connexion et rechargez la page.
        </Text>
      ) : null}

      {!data ? (
        !failed && <Skeleton className="h-48 rounded-card" />
      ) : (
        <>
          <Card className="p-5">
            <Text variant="label" tone="muted">
              Mois en cours
            </Text>
            <Text variant="subtitle" className="mb-4 mt-0.5 capitalize">
              {statementMonth(data.current.period)}
            </Text>
            <Figures totals={data.current.totals} />
            <Text variant="caption" tone="muted" className="mt-3">
              Chiffres provisoires : seules les commandes payées en ligne et déjà livrées sont comptées. Les frais de livraison reviennent à Sougouba, qui rémunère le livreur.
            </Text>
          </Card>

          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              Relevés émis
            </Text>
            {data.statements.length === 0 ? (
              <Text variant="body" tone="muted">
                Aucun relevé pour l’instant. Le premier sera émis le 1er du mois qui suit votre première commande livrée.
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
                          {statement.number} · {statement.totals.orderCount} commande{statement.totals.orderCount > 1 ? 's' : ''}
                        </Text>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <Text variant="body" className="tabular font-semibold">
                          {formatCad(Math.abs(statement.totals.balanceCad))}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {statement.totals.balanceCad < 0 ? 'dû à Sougouba' : 'à vous verser'}
                        </Text>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => open(statement)} disabled={openingId === statement.id}>
                        PDF
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Text variant="caption" tone="muted">
            Un relevé est un état de compte, pas une facture fiscale. L’abonnement mensuel est facturé séparément par Stripe.
          </Text>
        </>
      )}
    </div>
  );
}

/** The month's money column: what the orders were worth to the shop, what came off, what was sent, what is left. */
function Figures({ totals }: { totals: StatementTotals }) {
  const owed = totals.balanceCad < 0;
  return (
    <dl className="flex max-w-md flex-col gap-1.5 font-sans text-[0.875rem]">
      <Line
        label={`${totals.orderCount} commande${totals.orderCount > 1 ? 's' : ''} livrée${totals.orderCount > 1 ? 's' : ''} — produits et taxes`}
        value={formatCad(totals.goodsCad + totals.gstCad + totals.qstCad)}
      />
      {totals.couponsCad > 0 && <Line label="Vos codes promo" value={formatCad(-totals.couponsCad)} />}
      <Line label="Commission Sougouba" value={formatCad(-totals.commissionCad)} />
      <Line label="Votre part des ventes" value={formatCad(totals.earnedCad)} />
      {totals.refundCount > 0 && <Line label="Remboursements, votre part" value={formatCad(-totals.refundsCad)} />}
      {totals.openingCad !== 0 && <Line label="Solde reporté du mois précédent" value={formatCad(totals.openingCad)} />}
      {totals.payoutCount > 0 && <Line label="Versé sur votre compte" value={formatCad(-totals.paidCad)} />}
      <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-border pt-2.5">
        <dt className="font-semibold">{owed ? 'Solde dû à Sougouba' : 'Solde à vous verser'}</dt>
        <dd className={`tabular text-[1.125rem] font-bold ${owed ? 'text-destructive' : 'text-primary'}`}>{formatCad(Math.abs(totals.balanceCad))}</dd>
      </div>
    </dl>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
