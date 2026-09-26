import { router, useFocusEffect } from 'expo-router';
import { History } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';

import { CourierGate, CourierSlab, RunRow, SlabFigure } from '@/components/courier';
import { EmptyState, Skeleton, Text } from '@/components/ui';
import { vendorsApi } from '@/data/api';
import type { ID } from '@/data/types';
import { useCourierEarnings } from '@/hooks/useCourierEarnings';
import { useCourierProfile } from '@/hooks/useCourierProfile';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { groupRunsByDay, summariseRuns } from '@/lib/courierAnalytics';
import { formatCad, formatDayLong } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import type { TFunction } from '@/lib/i18n';
import { useT } from '@/lib/i18n/useT';
import { dynamicRoutes } from '@/lib/routes';

/**
 * Every run this courier has finished, by shift.
 *
 * Grouped by day rather than listed flat, because that is the unit a courier
 * thinks in: "what did Friday come to" is the question a history is opened
 * with, and an undifferentiated feed makes it one they have to answer with
 * their own arithmetic. Each day header carries its own total and distance, so
 * the answer is on the way past rather than at the end of a scroll.
 *
 * Shop names are resolved once for the whole list rather than per row: the mock
 * API delays every call by a few hundred milliseconds, so a lookup inside
 * `renderItem` would fire dozens of them and make scrolling feel broken.
 */
export default function CourierHistoryScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const { courier, loading: profileLoading, missing, pending, reload } = useCourierProfile();
  const { runs, loading, reload: reloadRuns } = useCourierEarnings(courier?.id);

  const [vendorNames, setVendorNames] = useState<Record<ID, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadRuns();
    }, [reload, reloadRuns])
  );

  useEffect(() => {
    let active = true;
    const missingIds = [...new Set(runs.map((o) => o.vendorId))].filter((id) => !vendorNames[id]);
    if (missingIds.length === 0) return;
    Promise.all(missingIds.map((id) => vendorsApi.getVendorById(id))).then((found) => {
      if (!active) return;
      setVendorNames((prev) => {
        const next = { ...prev };
        found.forEach((v) => {
          if (v) next[v.id] = v.name;
        });
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [runs, vendorNames]);

  const sections = useMemo(
    () =>
      groupRunsByDay(runs).map((day) => ({
        ...day,
        title: dayTitle(t, day.date),
        data: day.runs,
      })),
    [runs, t]
  );

  const allTime = useMemo(() => summariseRuns(runs, 3650), [runs]);

  if (profileLoading) return null;
  if (missing || pending) {
    return <CourierGate state={missing ? 'missing' : 'pending'} onApproved={reload} />;
  }

  return (
    <View className="flex-1 bg-background">
      <CourierSlab
        title={t('courier.historyScreen.title')}
        eyebrow={courier ? `depuis ${courier.city}` : undefined}
      >
        <View className="flex-row items-end justify-between gap-4">
          <SlabFigure label={t('courier.historyScreen.delivered')} value={String(allTime.runCount)} />
          <SlabFigure label="Distance" value={formatDistance(allTime.distanceKm)} />
          <SlabFigure label={t('courier.earningsScreen.collected')} value={formatCad(allTime.earningsCad)} align="right" />
        </View>
      </CourierSlab>

      {loading ? (
        <View className="px-5 pt-5 gap-3">
          <Skeleton height={104} radius={20} />
          <Skeleton height={104} radius={20} />
          <Skeleton height={104} radius={20} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          // Headers scroll away rather than pinning: a courier scrolling weeks
          // back is reading days as blocks, and a header stuck to the top of the
          // viewport claims a day the rows below it no longer belong to.
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: tabBarInset + 24,
          }}
          ListEmptyComponent={
            <View className="pt-16">
              <EmptyState
                icon={History}
                title={t('courier.historyScreen.emptyTitle')}
                description={t('courier.historyScreen.emptyBody')}
              />
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await reloadRuns();
                setRefreshing(false);
              }}
            />
          }
          renderSectionHeader={({ section }) => (
            <DayHeader
              title={section.title}
              runCount={section.runs.length}
              distanceKm={section.distanceKm}
              earningsCad={section.earningsCad}
            />
          )}
          renderItem={({ item, index, section }) => (
            <RunRow
              order={item}
              vendorName={vendorNames[item.vendorId]}
              // Rows within a day are one continuous column, so the connector
              // knows where it is: nothing above the first, nothing below the
              // last, a through-line everywhere between.
              first={index === 0}
              last={index === section.data.length - 1}
              onPress={() =>
                router.push({ pathname: dynamicRoutes.courierDelivery, params: { id: item.id } })
              }
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * The day's own line: what it was, and what it came to.
 *
 * The total sits on the right at the same optical weight as the date on the
 * left, because both are being scanned — a courier flicking back through a
 * fortnight is looking for the good days, and a date without its figure makes
 * them open the day to find out.
 */
function DayHeader({
  title,
  runCount,
  distanceKm,
  earningsCad,
}: {
  title: string;
  runCount: number;
  distanceKm: number;
  earningsCad: number;
}) {
  const t = useT();
  return (
    <View className="flex-row items-baseline gap-3 pt-5 pb-2.5">
      <View className="flex-1 gap-0.5">
        <Text variant="subtitle" weight="bold" numberOfLines={1} className="text-[17px]">
          {title}
        </Text>
        <Text variant="caption" tone="muted" className="text-[11px]">
          {t('courier.history.runsWithDistance', {
            runs: t('courier.runCount', { count: runCount }),
            distance: formatDistance(distanceKm),
          })}
        </Text>
      </View>
      <Text
        weight="bold"
        className="text-[16px]"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatCad(earningsCad)}
      </Text>
    </View>
  );
}

/**
 * "Aujourd'hui" / "Hier" / "vendredi 8 août".
 *
 * The two nearest days get their names because that is how they are referred to
 * out loud, and a courier checking tonight's takings should not have to match a
 * date against their own memory of the calendar.
 *
 * The long form comes from `formatDayLong`; this file used to build its own
 * `Intl.DateTimeFormat('fr-CA', …)`, which is how it acquired a second hardcoded
 * locale that no language switch could reach.
 */
function dayTitle(t: TFunction, date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - value.getTime()) / 86400000);

  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.yesterday');
  return capitalise(formatDayLong(value.toISOString()));
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
