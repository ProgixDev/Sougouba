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
import { t, lazy, useLocale } from '@/lib/i18n';

/**
 * The shop's monthly subscription: where it stands, and the way to Stripe to
 * start it, change the card or cancel. The card is entered on Stripe's own
 * page — this portal never sees it.
 *
 * `reloadKey` changes when the merchant comes back from Stripe, so the status
 * is read again rather than assumed from the address they came back to.
 *
 * Reading it is also what brings an offline shop back once it has paid — the
 * server settles the shop on every read — so `onLoaded` hands the page what
 * came back, for it to notice that the shop is no longer where it thought.
 */

const STATUS: Record<Subscription['status'], { label: string; tone: Tone }> = lazy(() => ({
  inactive: { label: t('portalShop.subscription.status.inactive'), tone: 'neutral' },
  active: { label: t('portalShop.subscription.status.active'), tone: 'success' },
  past_due: { label: t('portalShop.subscription.status.pastDue'), tone: 'destructive' },
  canceled: { label: t('portalShop.subscription.status.canceled'), tone: 'neutral' },
}));

export function SubscriptionCard({ reloadKey, onLoaded }: { reloadKey: number; onLoaded?: (subscription: Subscription) => void }) {
  useLocale();
  const toast = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setFailed(false);
    getMySubscription()
      .then((loaded) => {
        setSubscription(loaded);
        onLoaded?.(loaded);
      })
      .catch(() => setFailed(true));
    // `onLoaded` is the page's to keep stable or not; a new one is no reason to ask Stripe again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  /** Off to Stripe, in this tab: it sends the merchant back here when they are done. */
  async function go(link: () => Promise<string>) {
    setLeaving(true);
    try {
      window.location.href = await link();
    } catch (error) {
      toast('error', failureMessage(error, t('portalShop.subscription.stripeFailed')));
      setLeaving(false);
    }
  }

  const subscribed = subscription?.status === 'active' || subscription?.status === 'past_due';
  // What the subscription means for the shop being online — said only while it is required to sell.
  const notice = !subscription
    ? null
    : subscription.offline
      ? t('portalShop.subscription.notice.offline')
      : subscription.offlineAt
        ? t('portalShop.subscription.notice.offlineOn', { date: formatDate(subscription.offlineAt) })
        : subscription.required && !subscribed
          ? t('portalShop.subscription.notice.required')
          : null;

  return (
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text variant="subtitle">{t('portalShop.subscription.title')}</Text>
          <Text variant="body" tone="muted" className="mt-0.5 max-w-xl">
            {t('portalShop.subscription.intro')}
          </Text>
        </div>
        {subscription && <Badge tone={STATUS[subscription.status].tone}>{STATUS[subscription.status].label}</Badge>}
      </div>

      {failed ? (
        <Text variant="body" tone="destructive">
          {t('portalShop.subscription.loadFailed')}
        </Text>
      ) : !subscription ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[1.75rem] font-bold tabular text-foreground">{formatCad(subscription.priceCad)}</span>
            <span className="font-sans text-[0.875rem] text-muted-foreground">{t('portalShop.subscription.perMonth')}</span>
          </div>

          <Text variant="body" tone="muted">
            {describe(subscription)}
          </Text>
          {notice && (
            <Text variant="body" tone={subscription.offline || subscription.offlineAt ? 'destructive' : 'default'} className="font-medium">
              {notice}
            </Text>
          )}

          {!subscription.available ? (
            <Text variant="body" tone="muted">
              {t('portalShop.subscription.unavailable')}
            </Text>
          ) : (
            <div>
              {subscribed ? (
                <Button variant="outline" onClick={() => go(openSubscriptionPortal)} disabled={leaving}>
                  {leaving ? t('portalShop.subscription.opening') : subscription.status === 'past_due' ? t('portalShop.subscription.updateCard') : t('portalShop.subscription.manage')}
                </Button>
              ) : (
                <Button onClick={() => go(startSubscriptionCheckout)} disabled={leaving}>
                  {leaving ? t('portalShop.subscription.opening') : t('portalShop.subscription.subscribe')}
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
      if (subscription.cancelAt) return t('portalShop.subscription.describe.cancelling', { date: formatDate(subscription.cancelAt) });
      return end ? t('portalShop.subscription.describe.nextCharge', { date: end }) : t('portalShop.subscription.describe.active');
    case 'past_due':
      return t('portalShop.subscription.describe.pastDue');
    case 'canceled':
      return t('portalShop.subscription.describe.canceled');
    default:
      return t('portalShop.subscription.describe.inactive');
  }
}
