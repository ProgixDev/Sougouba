import { CalendarClock, CircleAlert, Hourglass, Landmark } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Skeleton, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import type { MerchantPayouts, MerchantPayoutState } from '@/hooks/useMerchantPayouts';
import { formatCad, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { mustard } from '@/theme/tokens';

export interface MerchantPayoutCardProps {
  payouts: MerchantPayouts;
}

/** `2026-12-04` → a date at noon, so no time zone can tip it into a neighbouring day. */
const dayOf = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`);

/**
 * When the shop is paid, how much, and whether the money has somewhere to go —
 * the merchant's counterpart of the courier's `PayoutCard`.
 *
 * The amount is the server's: orders delivered and not yet paid, less the
 * shop's part of any refund. It is what the next Friday transfer carries, not
 * a sum the phone could work out from the orders it happens to have loaded.
 *
 * The bank line sits under the amount because it qualifies it: "68 $ vendredi"
 * is a promise only once Stripe has an account to pay. When it does not, this
 * card is where the merchant fixes that — it is the only place in the app that
 * opens Stripe's form.
 */
export function MerchantPayoutCard({ payouts }: MerchantPayoutCardProps) {
  const t = useT();
  const colors = useThemeColors();
  const { state, summary, setUp, settingUp, error } = payouts;
  const recent = summary?.payouts.slice(0, 3) ?? [];

  return (
    <View className="rounded-[20px] bg-card p-4 gap-3.5">
      <View className="flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: `${colors.primary}14` }}>
          <CalendarClock size={18} color={colors.primary} strokeWidth={2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="caption" weight="bold" className="text-[14px]">
            {t('business.payouts.nextPayout')}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px]">
            {summary ? dayOf(summary.nextPayoutOn) : ''}
            {summary && summary.orderCount > 0 ? ` · ${t('business.payouts.orderCount', { count: summary.orderCount })}` : ''}
          </Text>
        </View>
        {summary === null ? (
          <Skeleton width={72} height={22} radius={8} />
        ) : (
          <Text
            weight="bold"
            tone={summary.pendingCad < 0 ? 'destructive' : 'default'}
            className="text-[19px]"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatCad(summary.pendingCad)}
          </Text>
        )}
      </View>

      {summary && summary.pendingCad < 0 ? (
        <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
          {t('business.payouts.negativeNote')}
        </Text>
      ) : null}

      {state === 'loading' ? null : (
        <>
          <View className="h-px bg-border" />
          <StatusLine state={state} />
          {state === 'setup' || state === 'review' ? (
            <Button
              label={t(state === 'setup' ? 'business.payouts.setupCta' : 'business.payouts.reviewCta')}
              variant={state === 'setup' ? 'primary' : 'outline'}
              size="sm"
              fullWidth
              loading={settingUp}
              onPress={setUp}
              icon={state === 'setup' ? <Landmark size={16} color={colors.primaryForeground} strokeWidth={2.2} /> : undefined}
            />
          ) : null}
          {error ? (
            <Text variant="caption" tone="destructive" className="text-[12px] leading-[18px]">
              {error}
            </Text>
          ) : null}
        </>
      )}

      {recent.length > 0 ? (
        <>
          <View className="h-px bg-border" />
          <View className="gap-2">
            <Text variant="label" tone="muted" className="text-[10px]">
              {t('business.payouts.recent')}
            </Text>
            {recent.map((payout) => (
              <View key={payout.id} className="flex-row items-baseline justify-between gap-3">
                <Text variant="caption" tone="muted">
                  {payout.status === 'paid' && payout.paidAt ? formatDate(payout.paidAt) : t('business.payouts.onItsWay')}
                </Text>
                <Text variant="caption" weight="semibold" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatCad(payout.amountCad)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
        {t(summary && !summary.enabled ? 'business.payouts.notOpenNote' : 'business.payouts.note')}
      </Text>
    </View>
  );
}

/**
 * The account's state in a sentence, with an icon so it does not rest on colour.
 * Mustard rather than red for "not set up": nothing has gone wrong, a step is
 * missing.
 */
function StatusLine({ state }: { state: Exclude<MerchantPayoutState, 'loading'> }) {
  const t = useT();
  const colors = useThemeColors();

  const { Icon, tint } = {
    active: { Icon: Landmark, tint: colors.primary },
    review: { Icon: Hourglass, tint: mustard[600] },
    setup: { Icon: Landmark, tint: mustard[600] },
    unavailable: { Icon: CircleAlert, tint: colors.mutedForeground },
  }[state];

  return (
    <View className="flex-row gap-3" accessible accessibilityRole="text">
      <View className="w-10 items-center pt-0.5">
        <Icon size={17} color={tint} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="caption" weight="bold" className="text-[13px]">
          {t(`business.payouts.${state}Title`)}
        </Text>
        <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
          {t(`business.payouts.${state}Body`)}
        </Text>
      </View>
    </View>
  );
}
