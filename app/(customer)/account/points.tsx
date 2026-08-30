import { router, useFocusEffect } from 'expo-router';
import { Clock, Coins, Gift, Percent, Sparkles } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { loyaltyApi, ordersApi } from '@/data/api';
import {
  MAX_REDEMPTION_SHARE,
  POINTS_EXPIRY_MONTHS,
  POINTS_PER_CAD_REDEEMED,
  pointsToDiscountCad,
} from '@/data/loyalty';
import type { LoyaltyTransaction } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { formatCad, formatDate, formatMonthYear } from '@/lib/format';
import { formatPoints, loyaltyReasonLabel } from '@/lib/loyalty';
import { routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

export default function PointsScreen() {
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      (async () => {
        await ordersApi.ensureLoyaltyBackfill(user.id);
        const [nextBalance, nextHistory] = await Promise.all([
          loyaltyApi.getBalance(user.id),
          loyaltyApi.getHistory(user.id),
        ]);
        if (!active) return;
        setBalance(nextBalance);
        setHistory(nextHistory);
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [user])
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Mes points" />

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
                  Solde Points Sougouba
                </Text>
              </View>
              <View className="gap-0.5">
                <Text variant="display" weight="extrabold" className="text-[40px]" style={tabular}>
                  {balance}
                </Text>
                <Text variant="caption" tone="muted">
                  ≈ {formatCad(pointsToDiscountCad(balance))} de valeur — jusqu’à{' '}
                  {Math.round(MAX_REDEMPTION_SHARE * 100)} % du sous-total utilisables par commande.
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
                  Parrainer un proche
                </Text>
                <Text variant="caption" tone="muted" className="text-[12px]">
                  300 points pour vous, 300 points pour votre ami.
                </Text>
              </View>
            </Pressable>
          </Reveal>

          <Reveal delay={100}>
            <View className="rounded-[20px] bg-card overflow-hidden">
              <RuleRow icon={Coins} text="1 $ d’achats éligibles (hors taxes, livraison et pourboire) = 1 point." />
              <View className="h-px bg-border ml-16" />
              <RuleRow
                icon={Percent}
                text={`${POINTS_PER_CAD_REDEEMED} points = 1 $ de réduction, jusqu’à ${Math.round(
                  MAX_REDEMPTION_SHARE * 100
                )} % du sous-total d’une commande.`}
              />
              <View className="h-px bg-border ml-16" />
              <RuleRow icon={Clock} text={`Les points sont crédités après livraison et expirent ${POINTS_EXPIRY_MONTHS} mois après leur obtention.`} />
            </View>
          </Reveal>

          <View className="gap-3">
            <Text variant="label" tone="muted" className="px-1">
              Historique
            </Text>
            {history.length === 0 ? (
              <View className="rounded-[20px] bg-card">
                <EmptyState
                  icon={Sparkles}
                  title="Aucun mouvement pour l’instant"
                  description="Vos points apparaissent ici dès qu’une commande est livrée."
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
                          {loyaltyReasonLabel[tx.reason]}
                        </Text>
                        <Text variant="caption" tone="muted" className="text-[12px]">
                          {formatDate(tx.createdAt)}
                          {/* Month + year, not the day-level `formatDate` used above — an
                              expiry a year out with no year shown reads as today's date. */}
                          {tx.expiresAt ? ` · expire en ${formatMonthYear(tx.expiresAt)}` : ''}
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
