import { CalendarClock, CircleAlert, Hourglass, Landmark } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Skeleton, Text } from '@/components/ui';
import type { CourierPayouts, PayoutState } from '@/hooks/useCourierPayouts';
import { useThemeColors } from '@/hooks/useColorScheme';
import { nextPayoutDate } from '@/lib/courierAnalytics';
import { formatCad, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { mustard } from '@/theme/tokens';

export interface PayoutCardProps {
  payouts: CourierPayouts;
}

/**
 * When the money moves, how much, and whether it has somewhere to go.
 *
 * The amount is the server's — runs delivered and not yet transferred — not a
 * sum of the last seven days on the phone, which could not know about a payout
 * that already went or one that failed and is still owed.
 *
 * The bank line sits under the amount because it qualifies it: "48 $ vendredi"
 * is a promise only once Stripe has an account to pay. When it does not, this
 * card is where the courier fixes that, with the one button on the screen.
 */
export function PayoutCard({ payouts }: PayoutCardProps) {
  const t = useT();
  const colors = useThemeColors();
  const { state, pendingCad, pendingRuns, setUp, settingUp, error } = payouts;

  return (
    <View className="rounded-[20px] bg-card p-4 gap-3.5">
      <View className="flex-row items-center gap-3">
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: `${colors.primary}14` }}
        >
          <CalendarClock size={18} color={colors.primary} strokeWidth={2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="caption" weight="bold" className="text-[14px]">
            {t('courier.payouts.nextPayout')}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px]">
            {formatDate(nextPayoutDate().toISOString())}
            {pendingRuns > 0 ? ` · ${t('courier.runCount', { count: pendingRuns })}` : ''}
          </Text>
        </View>
        {pendingCad === null ? (
          <Skeleton width={72} height={22} radius={8} />
        ) : (
          <Text weight="bold" className="text-[19px]" style={{ fontVariant: ['tabular-nums'] }}>
            {formatCad(pendingCad)}
          </Text>
        )}
      </View>

      {state === 'loading' ? null : (
        <>
          <View className="h-px bg-border" />
          <PayoutStatusLine state={state} />
          {state === 'setup' || state === 'review' ? (
            <Button
              label={t(state === 'setup' ? 'courier.payouts.setupCta' : 'courier.payouts.reviewCta')}
              variant={state === 'setup' ? 'primary' : 'outline'}
              size="sm"
              fullWidth
              loading={settingUp}
              onPress={setUp}
              icon={
                state === 'setup' ? (
                  <Landmark size={16} color={colors.primaryForeground} strokeWidth={2.2} />
                ) : undefined
              }
            />
          ) : null}
          {error ? (
            <Text variant="caption" tone="destructive" className="text-[12px] leading-[18px]">
              {error}
            </Text>
          ) : null}
        </>
      )}

      <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
        {t('courier.earningsScreen.payoutNote')}
      </Text>
    </View>
  );
}

/**
 * The account's state in a sentence, with an icon so it does not rest on colour.
 * Mustard rather than red for "not set up": nothing has gone wrong, a step is
 * missing.
 */
function PayoutStatusLine({ state }: { state: Exclude<PayoutState, 'loading'> }) {
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
          {t(`courier.payouts.${state}Title`)}
        </Text>
        <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
          {t(`courier.payouts.${state}Body`)}
        </Text>
      </View>
    </View>
  );
}
