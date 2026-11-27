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
import { t, lazy, useLocale } from '@/lib/i18n';

/**
 * When the shop is paid, how much, and into which account — the web twin of
 * the mobile app's payout card.
 *
 * The bank account is given on Stripe's own form; this portal never sees it.
 * The two reads are independent: a server that cannot reach Stripe still knows
 * what the shop is owed.
 */

type State = 'unavailable' | 'setup' | 'review' | 'active';

const STATE: Record<State, { label: string; tone: Tone; body: string }> = lazy(() => ({
  active: { label: t('portalShop.payouts.state.active.label'), tone: 'success', body: t('portalShop.payouts.state.active.body') },
  review: {
    label: t('portalShop.payouts.state.review.label'),
    tone: 'warning',
    body: t('portalShop.payouts.state.review.body'),
  },
  setup: {
    label: t('portalShop.payouts.state.setup.label'),
    tone: 'warning',
    body: t('portalShop.payouts.state.setup.body'),
  },
  unavailable: {
    label: t('portalShop.payouts.state.unavailable.label'),
    tone: 'neutral',
    body: t('portalShop.payouts.state.unavailable.body'),
  },
}));

const toState = (status: PayoutStatus): State => (status.payoutsEnabled ? 'active' : status.onboarded ? 'review' : 'setup');

/** `2026-12-04` at noon, so no time zone tips it into a neighbouring day. */
const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`);

export function PayoutsCard() {
  useLocale();
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
      toast('error', failureMessage(error, t('portalShop.payouts.stripeFailed')));
      setLeaving(false);
    }
  }

  return (
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text variant="subtitle">{t('portalShop.payouts.title')}</Text>
          <Text variant="body" tone="muted" className="mt-0.5 max-w-xl">
            {t('portalShop.payouts.intro')}
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
              {summary.orderCount > 0
                ? t('portalShop.payouts.nextWithOrders', { date: day(summary.nextPayoutOn), count: summary.orderCount })
                : t('portalShop.payouts.next', { date: day(summary.nextPayoutOn) })}
            </span>
          </div>
          {summary.pendingCad < 0 && (
            <Text variant="caption" tone="muted" className="mt-1">
              {t('portalShop.payouts.negative')}
            </Text>
          )}
          {!summary.enabled && (
            <Text variant="caption" tone="muted" className="mt-1">
              {t('portalShop.payouts.notOpen')}
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
            {leaving ? t('portalShop.payouts.opening') : state === 'setup' ? t('portalShop.payouts.setUp') : t('portalShop.payouts.review')}
          </Button>
        </div>
      )}

      {summary && summary.payouts.length > 0 && (
        <div className="border-t border-border pt-3">
          <Text variant="label" tone="muted">
            {t('portalShop.payouts.recent')}
          </Text>
          <ul className="mt-2 flex max-w-md flex-col gap-1.5 font-sans text-[0.875rem]">
            {summary.payouts.map((payout) => (
              <li key={payout.id} className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">
                  {payout.status === 'paid' && payout.paidAt
                    ? t('portalShop.payouts.paidRow', { date: formatDate(payout.paidAt), count: payout.orderCount })
                    : t('portalShop.payouts.pendingRow', { count: payout.orderCount })}
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
