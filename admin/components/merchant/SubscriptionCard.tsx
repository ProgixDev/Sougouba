'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Skeleton } from '@/components/data/Skeleton';
import { useToast } from '@/components/Toast';
import { getMySubscription, openSubscriptionPortal, startSubscriptionCheckout, type Subscription } from '@/lib/api/merchantBilling';
import { failureMessage } from '@/lib/merchantForm';
import { formatCad, formatDate } from '@/lib/format';

/**
 * The shop's monthly subscription: where it stands, and the way to Stripe to
 * start it, change the card or cancel. The card is entered on Stripe's own
 * page — this portal never sees it.
 *
 * `reloadKey` changes when the merchant comes back from Stripe, so the status
 * is read again rather than assumed from the address they came back to.
 */

const STATUS: Record<Subscription['status'], { label: string; tone: Tone }> = {
  inactive: { label: 'Non abonné', tone: 'neutral' },
  active: { label: 'Actif', tone: 'success' },
  past_due: { label: 'Paiement en retard', tone: 'destructive' },
  canceled: { label: 'Annulé', tone: 'neutral' },
};

export function SubscriptionCard({ reloadKey }: { reloadKey: number }) {
  const toast = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setFailed(false);
    getMySubscription().then(setSubscription).catch(() => setFailed(true));
  }, [reloadKey]);

  /** Off to Stripe, in this tab: it sends the merchant back here when they are done. */
  async function go(link: () => Promise<string>) {
    setLeaving(true);
    try {
      window.location.href = await link();
    } catch (error) {
      toast('error', failureMessage(error, 'Ouverture de Stripe impossible. Veuillez réessayer.'));
      setLeaving(false);
    }
  }

  const subscribed = subscription?.status === 'active' || subscription?.status === 'past_due';

  return (
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text variant="subtitle">Abonnement mensuel</Text>
          <Text variant="body" tone="muted" className="mt-0.5 max-w-xl">
            Un montant fixe par mois, en plus de la commission sur chaque vente. Prélevé sur votre carte par Stripe.
          </Text>
        </div>
        {subscription && <Badge tone={STATUS[subscription.status].tone}>{STATUS[subscription.status].label}</Badge>}
      </div>

      {failed ? (
        <Text variant="body" tone="destructive">
          Impossible de lire votre abonnement. Rechargez la page.
        </Text>
      ) : !subscription ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[1.75rem] font-bold tabular text-foreground">{formatCad(subscription.priceCad)}</span>
            <span className="font-sans text-[0.875rem] text-muted-foreground">par mois</span>
          </div>

          <Text variant="body" tone="muted">
            {describe(subscription)}
          </Text>

          {!subscription.available ? (
            <Text variant="body" tone="muted">
              Le paiement en ligne de l’abonnement n’est pas encore activé. Vous serez prévenu dès qu’il le sera.
            </Text>
          ) : (
            <div>
              {subscribed ? (
                <Button variant="outline" onClick={() => go(openSubscriptionPortal)} disabled={leaving}>
                  {leaving ? 'Ouverture…' : subscription.status === 'past_due' ? 'Mettre à jour ma carte' : 'Gérer mon abonnement'}
                </Button>
              ) : (
                <Button onClick={() => go(startSubscriptionCheckout)} disabled={leaving}>
                  {leaving ? 'Ouverture…' : 'S’abonner'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function describe(subscription: Subscription): string {
  const end = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : null;
  switch (subscription.status) {
    case 'active':
      if (subscription.cancelAt) return `Résilié : votre abonnement reste actif jusqu’au ${formatDate(subscription.cancelAt)}.`;
      return end ? `Prochain prélèvement le ${end}.` : 'Votre abonnement est actif.';
    case 'past_due':
      return 'Le dernier prélèvement a échoué. Mettez votre carte à jour pour garder votre abonnement.';
    case 'canceled':
      return 'Votre abonnement est terminé. Vous pouvez vous réabonner quand vous voulez.';
    default:
      return 'Vous n’êtes pas encore abonné.';
  }
}
