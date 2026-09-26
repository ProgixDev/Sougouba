import { useFocusEffect } from 'expo-router';
import { ChartColumn } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from 'react-native-gifted-charts';

import {
  CounterHeader,
  PayoutSummary,
  PendingApproval,
  SlabMetric,
  StatColumns,
  onSlab,
} from '@/components/business';
import { Badge, Reveal, Skeleton, Text } from '@/components/ui';
import { ordersApi } from '@/data/api';
import type { Order, OrderStatus } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { useThemeColors } from '@/hooks/useColorScheme';
import { comparePeriods } from '@/lib/analytics';
import { formatCad } from '@/lib/format';
import { orderStatusKey, orderStatusTone } from '@/lib/orderStatus';
import { useT } from '@/lib/i18n/useT';

/** Day counts only; the label is `common.rangeDays`, which pluralises per locale. */
const RANGES = [7, 30] as const;

export default function BusinessAnalyticsScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const { vendor, loading: vendorLoading, missing, pending, reload } = useOwnerVendor();
  const { width } = useWindowDimensions();
  const colors = useThemeColors();

  const [orders, setOrders] = useState<Order[]>([]);
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vendor) return;
    setOrders(await ordersApi.getOrdersByVendor(vendor.id));
  }, [vendor]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Guarded on `vendor`: load() returns immediately while the shop is still
      // resolving, and clearing the flag then would drop the screen out of its
      // loading state with nothing fetched — a flash of a zeroed dashboard.
      load().finally(() => {
        if (active && vendor) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load, vendor])
  );

  const comparison = useMemo(() => comparePeriods(orders, days), [orders, days]);
  const rangeLabel = t('common.rangeDays', { count: days });
  const summary = comparison.current;

  // Chart width tracks the card, and bars are sized from the bucket count so a
  // 30-day range stays legible instead of overflowing.
  const chartWidth = width - 40 - 32;
  const barWidth = days <= 7 ? 22 : 6;
  const spacing = days <= 7 ? 16 : 4;

  const chartData = useMemo(
    () =>
      summary.buckets.map((bucket, index) => ({
        value: bucket.revenueCad,
        // Labelling all 30 days is unreadable — show every fifth.
        label: days <= 7 || index % 5 === 0 ? bucket.label : '',
        frontColor: colors.primary,
      })),
    [summary.buckets, days, colors.primary]
  );

  const maxValue = Math.max(10, ...summary.buckets.map((b) => b.revenueCad));
  const bestDay = useMemo(
    () => summary.buckets.reduce((best, b) => (b.revenueCad > best.revenueCad ? b : best), summary.buckets[0]),
    [summary.buckets]
  );

  // A shop that is filed but not cleared is as unusable as no shop at all,
  // and for the merchant it is a different sentence — see `PendingApproval`.
  if (missing || pending) {
    return <PendingApproval state={missing ? 'missing' : 'pending'} onApproved={reload} />;
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarInset + 28 }}>
        <CounterHeader title={t('business.metrics.analytics')} eyebrow={vendor?.name}>
          {/* The range belongs with the figures it governs: a control sitting
              below the slab would leave the headline number unexplained. */}
          <View className="flex-row self-start rounded-full p-1" style={{ backgroundColor: onSlab.fill }}>
            {RANGES.map((range) => {
              const selected = days === range;
              return (
                <Pressable
                  key={range}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setDays(range)}
                  className="px-4 h-8 items-center justify-center rounded-full"
                  style={selected ? { backgroundColor: onSlab.text } : undefined}
                >
                  <Text
                    variant="caption"
                    weight="bold"
                    className="text-[12px]"
                    style={{ color: selected ? colors.primary : onSlab.muted }}
                  >
                    {t('common.rangeDays', { count: range })}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-end justify-between gap-4">
            <SlabMetric label={t('business.metrics.revenue')} value={formatCad(summary.revenueCad)} />
            <SlabMetric label={t('business.metrics.orders')} value={String(summary.orderCount)} align="right" />
          </View>
        </CounterHeader>

        {vendorLoading || loading ? (
          <View className="px-5 pt-6 gap-3">
            <Skeleton height={110} radius={20} />
            <Skeleton height={230} radius={20} />
          </View>
        ) : (
          <>
            <View className="px-5 pt-6">
              <Reveal>
                <StatColumns
                  title={t('courier.earnings.vsPrevious', { count: days })}
                  columns={[
                    {
                      label: t('business.metrics.revenue'),
                      value: formatCad(summary.revenueCad),
                      deltaPct: comparison.revenueDeltaPct,
                    },
                    {
                      label: t('business.metrics.orders'),
                      value: String(summary.orderCount),
                      deltaPct: comparison.orderDeltaPct,
                    },
                    {
                      label: t('business.metrics.avgBasket'),
                      value: formatCad(summary.avgBasketCad),
                      deltaPct: comparison.basketDeltaPct,
                    },
                  ]}
                />
              </Reveal>
            </View>

            {/* Directly under the period's figures, because it is the same
                period read the other way: what was sold, versus what arrives. */}
            <View className="px-5 pt-4">
              <Reveal delay={40}>
                <PayoutSummary
                  salesCad={summary.revenueCad}
                  commissionCad={summary.commissionCad}
                  netCad={summary.netCad}
                  rangeLabel={rangeLabel}
                />
              </Reveal>
            </View>

            <Reveal delay={60} className="mx-5 mt-4 rounded-[20px] bg-card p-4 gap-4">
              <View className="flex-row items-baseline justify-between gap-3">
                <Text variant="label" tone="muted" className="text-[10px]">
                  {t('business.analyticsScreen.revenueByDay')}
                </Text>
                {bestDay && bestDay.revenueCad > 0 ? (
                  <Text variant="caption" tone="muted" className="text-[11px]">
                    meilleur jour · {formatCad(bestDay.revenueCad)}
                  </Text>
                ) : null}
              </View>
              {summary.revenueCad === 0 ? (
                <View className="py-10 items-center gap-2">
                  <ChartColumn size={26} color={colors.mutedForeground} strokeWidth={1.5} />
                  <Text variant="caption" tone="muted">
                    {t('business.analyticsScreen.noSales')}
                  </Text>
                </View>
              ) : (
                <BarChart
                  data={chartData}
                  width={chartWidth}
                  height={170}
                  barWidth={barWidth}
                  spacing={spacing}
                  initialSpacing={8}
                  maxValue={Math.ceil(maxValue / 10) * 10}
                  noOfSections={4}
                  barBorderRadius={3}
                  hideRules={false}
                  rulesColor={colors.border}
                  rulesType="solid"
                  yAxisThickness={0}
                  xAxisThickness={0}
                  yAxisTextStyle={{ color: colors.mutedForeground, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: colors.mutedForeground, fontSize: 10 }}
                  isAnimated
                />
              )}
            </Reveal>

            <Reveal delay={120} className="mx-5 mt-4 rounded-[20px] bg-card p-4 gap-4">
              <Text variant="label" tone="muted" className="text-[10px]">
                {t('business.analyticsScreen.topSellers')}
              </Text>
              {summary.topProducts.length === 0 ? (
                <Text variant="caption" tone="muted">
                  {t('business.analyticsScreen.noSales')}
                </Text>
              ) : (
                <View className="gap-3">
                  {summary.topProducts.map((product, index) => {
                    const share = product.qty / summary.topProducts[0].qty;
                    return (
                      <View key={product.productId} className="gap-1.5">
                        <View className="flex-row items-center gap-2">
                          <Text variant="caption" weight="bold" tone="muted" className="w-4">
                            {index + 1}
                          </Text>
                          <Text variant="caption" weight="semibold" numberOfLines={1} className="flex-1">
                            {product.name}
                          </Text>
                          <Text variant="caption" tone="muted">
                            {product.qty} vendus
                          </Text>
                        </View>
                        {/* A bar per row reads faster than a second chart. */}
                        <View className="h-1.5 rounded-full bg-muted ml-6 overflow-hidden">
                          <View
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(6, share * 100)}%` }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Reveal>

            <Reveal delay={180} className="mx-5 mt-4 rounded-[20px] bg-card p-4 gap-3">
              <Text variant="label" tone="muted" className="text-[10px]">
                {t('business.analyticsScreen.statusBreakdown')}
              </Text>
              {Object.keys(summary.statusCounts).length === 0 ? (
                <Text variant="caption" tone="muted">
                  {t('business.analyticsScreen.noOrders')}
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {(Object.entries(summary.statusCounts) as [OrderStatus, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <Badge
                        key={status}
                        label={t('business.analytics.statusMix', {
                          status: t(orderStatusKey(status)),
                          count,
                        })}
                        tone={orderStatusTone[status]}
                        size="sm"
                      />
                    ))}
                </View>
              )}
            </Reveal>
          </>
        )}
      </ScrollView>
    </View>
  );
}
