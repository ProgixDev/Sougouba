'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Skeleton } from '@/components/data/Skeleton';
import { useToast } from '@/components/Toast';
import { getMyPayoutStatus, getMyPayouts, startPayoutOnboarding, type PayoutStatus, type PayoutSummary } from '@/lib/api/merchantBilling';
import { failureMessage } from '@/lib/merchantForm';
import { formatCad, formatDate } from '@/lib/format';

/**
 * When the shop is paid, how much, and into which account — the web twin of
 * the mobile app's payout card.
 *
 * The bank account is given on Stripe's own form; this portal never sees it.
 * The two reads are independent: a server that cannot reach Stripe still knows
 * what the shop is owed.
 */

type State = 'unavailable' | 'setup' | 'review' | 'active';

const STATE: Record<State, { label: string; tone: Tone; body: string }> = {
  active: { label: 'Versements actifs', tone: 'success', body: 'Stripe dépose votre part des ventes sur votre compte bancaire, chaque vendredi.' },
  review: {
    label: 'Vérification en cours',
    tone: 'warning',
    body: 'Stripe vérifie vos informations. Vos ventes s’accumulent d’ici là et seront versées ensuite.',
  },
  setup: {
    label: 'Compte bancaire à ajouter',
    tone: 'warning',
    body: 'Votre part des ventes reste en attente tant qu’aucun compte n’est relié. Stripe recueille vos coordonnées bancaires — Sougouba ne les voit jamais.',
  },
  unavailable: {
    label: 'Statut indisponible',
    tone: 'neutral',
    body: 'Impossible de joindre le service de paiement pour le moment. Vos ventes sont bien enregistrées.',
  },
};

const toState = (status: PayoutStatus): State => (status.payoutsEnabled ? 'active' : status.onboarded ? 'review' : 'setup');

/** `2026-12-04` at noon, so no time zone tips it into a neighbouring day. */
const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`);

export function PayoutsCard() {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    getMyPayoutStatus()
      .then((status) => setState(toState(status)))
      .catch(() => setState('unavailable'));
    getMyPayouts()
      .then(setSummary)
      .catch(() => undefined);
  }, []);

  /** Off to Stripe, in this tab: it sends the merchant back here when they are done. */
  async function setUp() {
    setLeaving(true);
    try {
      window.location.href = await startPayoutOnboarding();
    } catch (error) {
      toast('error', failureMessage(error, 'Ouverture de Stripe impossible. Veuillez réessayer.'));
      setLeaving(false);
    }
  }

  return (
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text variant="subtitle">Versements</Text>
          <Text variant="body" tone="muted" className="mt-0.5 max-w-xl">
            Chaque vendredi, pour les commandes livrées : vos produits et leurs taxes, moins la commission et vos codes promo.
          </Text>
        </div>
        {state && <Badge tone={STATE[state].tone}>{STATE[state].label}</Badge>}
      </div>

      {!summary ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`font-display text-[1.75rem] font-bold tabular ${summary.pendingCad < 0 ? 'text-destructive' : 'text-foreground'}`}>
              {formatCad(summary.pendingCad)}
            </span>
            <span className="font-sans text-[0.875rem] text-muted-foreground">
              prochain versement, le {day(summary.nextPayoutOn)}
              {summary.orderCount > 0 ? ` · ${summary.orderCount} commande${summary.orderCount > 1 ? 's' : ''}` : ''}
            </span>
          </div>
          {summary.pendingCad < 0 && (
            <Text variant="caption" tone="muted" className="mt-1">
              Des remboursements dépassent vos ventes livrées depuis le dernier versement. La différence sera retenue sur les prochains.
            </Text>
          )}
          {!summary.enabled && (
            <Text variant="caption" tone="muted" className="mt-1">
              Les versements automatiques ne sont pas encore ouverts par Sougouba. Vos ventes sont enregistrées et figurent sur vos relevés.
            </Text>
          )}
        </div>
      )}

      {state && (
        <Text variant="body" tone="muted">
          {STATE[state].body}
        </Text>
      )}

      {(state === 'setup' || state === 'review') && (
        <div>
          <Button variant={state === 'setup' ? 'primary' : 'outline'} onClick={setUp} disabled={leaving}>
            {leaving ? 'Ouverture…' : state === 'setup' ? 'Configurer mes versements' : 'Revoir mes informations'}
          </Button>
        </div>
      )}

      {summary && summary.payouts.length > 0 && (
        <div className="border-t border-border pt-3">
          <Text variant="label" tone="muted">
            Derniers versements
          </Text>
          <ul className="mt-2 flex max-w-md flex-col gap-1.5 font-sans text-[0.875rem]">
            {summary.payouts.map((payout) => (
              <li key={payout.id} className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">
                  {payout.status === 'paid' && payout.paidAt ? formatDate(payout.paidAt) : 'En cours'}
                  {` · ${payout.orderCount} commande${payout.orderCount > 1 ? 's' : ''}`}
                </span>
                <span className="tabular font-medium">{formatCad(payout.amountCad)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
