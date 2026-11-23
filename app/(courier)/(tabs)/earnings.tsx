import { useFocusEffect } from 'expo-router';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import {
  CourierGate,
  CourierSlab,
  EarningsChart,
  EarningsSummary,
  PayoutCard,
  SlabFigure,
  SlabSegmented,
  onCourierSlab,
} from '@/components/courier';
import { EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { useCourierEarnings } from '@/hooks/useCourierEarnings';
import { useCourierPayouts } from '@/hooks/useCourierPayouts';
import { useCourierProfile } from '@/hooks/useCourierProfile';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { compareRuns } from '@/lib/courierAnalytics';
import { formatCad } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { formatDistance } from '@/lib/geo';
import { mustard } from '@/theme/tokens';

type Range = 'today' | 'week' | 'month';

/**
 * Windows, not filters. Each is a question a courier actually asks — what have I
 * made tonight, is this week worth it, how is the month going — and "Tout",
 * which the previous version offered, is none of them: an all-time total cannot
 * be compared against anything and cannot be charted by day.
 */
/**
 * The arrow's tint on a light card. mustard[600] rather than the theme accent:
 * it has to clear 3:1 as a 12pt glyph on white, which mustard[500] does not.
 * The percentage beside it is set in the foreground colour, so the figure is
 * readable whatever happens to the icon.
 */
const ACCENT_DELTA = mustard[600];

/** Day counts and keys; the labels are `courier.ranges.*`. */
const RANGES: { key: Range; days: number }[] = [
  { key: 'today', days: 1 },
  { key: 'week', days: 7 },
  { key: 'month', days: 30 },
];

/**
 * What the courier has earned.
 *
 * One question, answered at the top in the largest type on the screen, on the
 * courier's own dark slab — then explained downward: how it compares to the same
 * window before it, which nights it came from, what the fare was made of, and
 * when it lands in the bank. A courier opening this screen wants the number
 * first and the reasoning only if the number surprises them, so the reasoning is
 * below the fold by design.
 *
 * Every figure comes out of `lib/courierAnalytics.ts` rather than being summed
 * in the screen, so the chart, the comparison and the payout cannot disagree
 * with the headline — see the note there about `earningsCad` being frozen at
 * completion.
 */
export default function CourierEarningsScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const { courier, loading: profileLoading, missing, pending, reload } = useCourierProfile();
  const { runs, loading, reload: reloadRuns, allTimeCad, allTimeRuns } = useCourierEarnings(courier?.id);
  const payouts = useCourierPayouts(courier?.status === 'approved');
  const reloadPayouts = payouts.reload;

  const [range, setRange] = useState<Range>('week');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadRuns();
      void reloadPayouts();
    }, [reload, reloadRuns, reloadPayouts])
  );

  const selected = RANGES.find((r) => r.key === range)!;

  const comparison = useMemo(() => compareRuns(runs, selected.days), [runs, selected.days]);
  const summary = comparison.current;

  // The window the *runs list* is filtered to, for the breakdown card below.
  const rangeRuns = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const from = start.getTime() - (selected.days - 1) * 86400000;
    return runs.filter((o) => Date.parse(o.delivery!.deliveredAt ?? o.createdAt) >= from);
  }, [runs, selected.days]);

  // Summed by the database over the whole history, not over the recent runs loaded here.
  const allTime = { runCount: allTimeRuns, earningsCad: allTimeCad };

  if (profileLoading) return null;
  if (missing || pending) {
    return <CourierGate state={missing ? 'missing' : 'pending'} />;
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([reloadRuns(), reloadPayouts()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <CourierSlab title={t('courier.earningsScreen.title')} eyebrow={t(`courier.ranges.${selected.key}`)}>
          <SlabSegmented
            options={RANGES.map((r) => ({ key: r.key, label: t(`courier.ranges.${r.key}`) }))}
            value={range}
            onChange={setRange}
          />

          <View className="flex-row items-end justify-between gap-4">
            <SlabFigure
              label={t('courier.earningsScreen.collected')}
              value={formatCad(summary.earningsCad)}
              hint={
                summary.runCount === 0
                  ? t('courier.runCount', { count: 0 })
                  : t('courier.history.runsWithDistance', {
                      runs: t('courier.runCount', { count: summary.runCount }),
                      distance: formatDistance(summary.distanceKm),
                    })
              }
              hero
            />
            <SlabDelta pct={comparison.earningsDeltaPct} days={selected.days} />
          </View>
        </CourierSlab>

        {loading ? (
          <View className="px-5 pt-6 gap-4">
            <Skeleton height={92} radius={20} />
            <Skeleton height={190} radius={20} />
            <Skeleton height={160} radius={20} />
          </View>
        ) : summary.runCount === 0 ? (
          <View className="px-5 pt-10">
            <EmptyState
              icon={Wallet}
              title={t('courier.earningsScreen.emptyTitle')}
              description={
                allTime.runCount > 0
                  ? t('courier.earningsEmpty.lifetime', {
                      amount: formatCad(allTime.earningsCad),
                    })
                  : t('courier.earningsEmpty.body')
              }
            />
          </View>
        ) : (
          <View className="px-5 pt-5 gap-4">
            {/* Three readings of the same window, split by hairlines rather than
                into separate tiles — they are one subject, and the merchant side
                makes the identical argument in `StatColumns`. */}
            <Reveal>
              <View className="rounded-[20px] bg-card px-4 py-4 gap-3.5">
                <Text variant="label" tone="muted" className="text-[10px]">
                  {t('courier.earnings.vsPrevious', { count: selected.days })}
                </Text>
                <View className="flex-row">
                  <Column
                    label="Courses"
                    value={String(summary.runCount)}
                    pct={comparison.runDeltaPct}
                  />
                  <Column
                    label={t('courier.perRun')}
                    value={formatCad(summary.avgPerRunCad)}
                    pct={comparison.avgDeltaPct}
                    divided
                  />
                  <Column
                    label="Distance"
                    value={formatDistance(summary.distanceKm)}
                    divided
                  />
                </View>
              </View>
            </Reveal>

            <Reveal index={1}>
              <EarningsChart buckets={summary.buckets} bestDay={summary.bestDay} />
            </Reveal>

            <Reveal index={2}>
              <EarningsSummary runs={rangeRuns} rangeLabel={t(`courier.ranges.${selected.key}`).toLowerCase()} />
            </Reveal>

          </View>
        )}

        {/* Outside the range's branches: what is owed, and where it goes, does
            not depend on whether tonight had any runs. A quiet day is exactly
            when a courier checks that Friday's transfer is still coming. */}
        {loading ? null : (
          <View className="px-5 pt-4">
            <Reveal index={3}>
              <PayoutCard payouts={payouts} />
            </Reveal>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * The direction, beside the amount it belongs to.
 *
 * On the slab rather than in the cards below because it modifies the headline:
 * "412 $" and "412 $, up a fifth on last week" are different pieces of news, and
 * separating them by a scroll makes the courier hold the first in their head.
 */
function SlabDelta({ pct, days }: { pct: number | null; days: number }) {
  const t = useT();
  if (pct === null) {
    return (
      <Text variant="caption" style={{ color: onCourierSlab.muted }} className="text-[11px] pb-1">
        {days === 1
          ? t('courier.earnings.noComparisonYesterday')
          : t('courier.earnings.noComparisonPeriod')}
      </Text>
    );
  }

  const rising = pct >= 0;
  const Icon = rising ? TrendingUp : TrendingDown;
  // Not green-for-good / red-for-bad: a quieter week is not a failure, and
  // colouring it as one is a judgement the app has no standing to make. Mustard
  // for movement in either direction, with the arrow carrying the sign.
  const tint = onCourierSlab.accent;

  return (
    <View className="items-end gap-1 pb-1.5">
      <View
        className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1.5"
        style={{ backgroundColor: onCourierSlab.fill }}
      >
        <Icon size={13} color={tint} strokeWidth={2.5} />
        <Text
          variant="caption"
          weight="bold"
          className="text-[12px]"
          style={{ color: tint, fontVariant: ['tabular-nums'] }}
        >
          {rising ? '+' : ''}
          {pct} %
        </Text>
      </View>
      <Text variant="caption" style={{ color: onCourierSlab.muted }} className="text-[10px]">
        {t('courier.earnings.vsPreviousShort', { count: days })}
      </Text>
    </View>
  );
}

/**
 * One reading of the window, with its direction.
 *
 * The delta is not coloured green-for-up and red-for-down, which is what the
 * merchant's `StatColumns` does and what this screen did at first. On a shop's
 * dashboard that reads as performance; on a courier's payout it reads as a
 * verdict on their week, and a quiet Tuesday is not a failing grade. The arrow
 * carries the direction — the same decision the slab above makes, so one screen
 * does not tell the courier two different things about the same number.
 */
function Column({
  label,
  value,
  pct,
  divided = false,
}: {
  label: string;
  value: string;
  pct?: number | null;
  divided?: boolean;
}) {
  return (
    <View className="flex-1 flex-row">
      {divided ? <View className="w-px bg-border my-0.5" /> : null}
      <View className={`flex-1 gap-1 ${divided ? 'pl-3' : 'pr-3'}`}>
        <Text
          variant="title"
          weight="bold"
          numberOfLines={1}
          className="text-[19px] leading-[23px]"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {value}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
          {label}
        </Text>
        {pct === undefined ? null : pct === null ? (
          <Text variant="caption" tone="muted" className="text-[11px] opacity-70">
            —
          </Text>
        ) : (
          <View className="flex-row items-center gap-1">
            {pct >= 0 ? (
              <TrendingUp size={12} color={ACCENT_DELTA} strokeWidth={2.5} />
            ) : (
              <TrendingDown size={12} color={ACCENT_DELTA} strokeWidth={2.5} />
            )}
            <Text variant="caption" weight="semibold" numberOfLines={1} className="text-[11px]">
              {pct >= 0 ? '+' : ''}
              {pct} %
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
