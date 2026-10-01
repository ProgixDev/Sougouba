import { router, useFocusEffect } from 'expo-router';
import { Clock, Coins, Gift, Percent, Sparkles } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { loyaltyApi } from '@/data/api';
import {
  MAX_REDEMPTION_SHARE,
  POINTS_EXPIRY_MONTHS,
  POINTS_PER_CAD_REDEEMED,
  REFERRAL_REWARD_POINTS,
  pointsToDiscountCad,
} from '@/data/loyalty';
import type { LoyaltyTransaction } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { formatCad, formatDate, formatMonthYear, formatPercent } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { formatPoints, loyaltyReasonKey } from '@/lib/loyalty';
import { routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

export default function PointsScreen() {
  const t = useT();
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      Promise.all([loyaltyApi.getBalance(user.id), loyaltyApi.getHistory(user.id)])
        .then(([nextBalance, nextHistory]) => {
          if (!active) return;
          setBalance(nextBalance);
          setHistory(nextHistory);
        })
        .catch(() => undefined)
        // Always end the skeleton — a failed load shows an empty ledger, not a spinner forever.
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [user])
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.account.points.title')} />

      {loading ? (
        <View className="px-5 pt-2 gap-3">
          <Skeleton height={140} radius={20} />
          <Skeleton height={132} radius={20} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pt-2 pb-8 gap-5"
        >
          <Reveal>
            <View className="rounded-[20px] bg-card p-5 gap-4">
              <View className="flex-row items-center gap-2">
                <View className="w-9 h-9 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles size={17} color={colors.primary} strokeWidth={2} />
                </View>
                <Text variant="label" tone="muted">
                  {t('customer.account.points.balance')}
                </Text>
              </View>
              <View className="gap-0.5">
                <Text variant="display" weight="extrabold" className="text-[40px]" style={tabular}>
                  {balance}
                </Text>
                <Text variant="caption" tone="muted">
                  {t('customer.account.points.value', {
                    amount: formatCad(pointsToDiscountCad(balance)),
                    percent: formatPercent(MAX_REDEMPTION_SHARE),
                  })}
                </Text>
              </View>
            </View>
          </Reveal>

          <Reveal delay={60}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(routes.accountRefer)}
              className="flex-row items-center gap-3 rounded-[20px] bg-primary/10 p-4 active:opacity-80"
            >
              <View className="w-10 h-10 items-center justify-center rounded-full bg-card">
                <Gift size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View className="flex-1">
                <Text variant="caption" weight="bold" tone="primary">
                  {t('customer.account.points.refer')}
                </Text>
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {t('customer.account.points.referTeaser', { points: REFERRAL_REWARD_POINTS })}
                </Text>
              </View>
            </Pressable>
          </Reveal>

          <Reveal delay={100}>
            <View className="rounded-[20px] bg-card overflow-hidden">
              <RuleRow icon={Coins} text={t('customer.pointsRules.earn')} />
              <View className="h-px bg-border ml-16" />
              <RuleRow
                icon={Percent}
                text={t('customer.pointsRules.redeem', {
                  points: POINTS_PER_CAD_REDEEMED,
                  percent: formatPercent(MAX_REDEMPTION_SHARE),
                })}
              />
              <View className="h-px bg-border ml-16" />
              <RuleRow icon={Clock} text={t('customer.pointsRules.expiry', { months: POINTS_EXPIRY_MONTHS })} />
            </View>
          </Reveal>

          <View className="gap-3">
            <Text variant="label" tone="muted" className="px-1">
              {t('customer.account.points.history')}
            </Text>
            {history.length === 0 ? (
              <View className="rounded-[20px] bg-card">
                <EmptyState
                  icon={Sparkles}
                  title={t('customer.account.points.emptyTitle')}
                  description={t('customer.account.points.emptyBody')}
                />
              </View>
            ) : (
              <View className="rounded-[20px] bg-card overflow-hidden">
                {history.map((tx, index) => (
                  <View key={tx.id}>
                    {index > 0 ? <View className="h-px bg-border ml-4" /> : null}
                    <View className="flex-row items-center gap-3 p-4">
                      <View className="flex-1 gap-0.5">
                        <Text variant="caption" weight="semibold">
                          {t(loyaltyReasonKey(tx.reason))}
                        </Text>
                        <Text variant="caption" tone="muted" className="text-[12px]">
                          {/* Month + year, not the day-level `formatDate` — an expiry a
                              year out with no year shown reads as today's date. */}
                          {tx.expiresAt
                            ? t('customer.account.points.expiryLine', {
                                date: formatDate(tx.createdAt),
                                expiry: formatMonthYear(tx.expiresAt),
                              })
                            : formatDate(tx.createdAt)}
                        </Text>
                      </View>
                      <Text
                        variant="caption"
                        weight="bold"
                        tone={tx.points > 0 ? 'primary' : 'muted'}
                        style={tabular}
                      >
                        {formatPoints(tx.points)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RuleRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-start gap-3 p-4">
      <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
        <Icon size={16} color={colors.mutedForeground} strokeWidth={2} />
      </View>
      <Text variant="caption" tone="muted" className="flex-1 text-[13px] leading-[18px]">
        {text}
      </Text>
    </View>
  );
}

const tabular = { fontVariant: ['tabular-nums' as const] };
