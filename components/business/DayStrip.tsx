import { View } from 'react-native';

import { Reveal, Text } from '@/components/ui';
import type { Order } from '@/data/types';
import { positionInDay, type ShopDay } from '@/lib/shopHours';
import { useT } from '@/lib/i18n/useT';
import { forest, mustard } from '@/theme/tokens';

export interface DayStripProps {
  day: ShopDay;
  /** Orders placed today, in any status. */
  orders: Order[];
  /** Orders have not arrived yet — draw the track, but say nothing about the day. */
  loading?: boolean;
}

const TRACK_HEIGHT = 3;
const MIN_TICK = 7;
const MAX_TICK = 26;

/** Ivory and mint on the dark slab — fixed, because the slab is dark in both themes. */
const ON_SLAB = {
  rule: 'rgba(243, 239, 230, 0.16)',
  // forest[400] sat at 2.91:1 against the lighter end of the slab gradient —
  // below the 3:1 a non-text indicator needs. See scripts/verify-contrast.ts.
  elapsed: forest[300],
  tick: mustard[300],
  now: '#F3EFE6',
  label: forest[200],
} as const;

/**
 * Today's trading, drawn as the shop's own day.
 *
 * A merchant does not think in 30-day windows — they think in the day they are
 * standing in. The track spans this shop's opening hours, each order is a spike
 * at the time it was placed and as tall as it was large, and the marker is now.
 * Read in one glance: how far through the day, when the rushes landed, whether
 * the last hour has been quiet.
 *
 * Everything here comes from `vendor.hours` and the order timestamps, so it is
 * specific to this shop on this day rather than a generic sparkline.
 */
export function DayStrip({ day, orders, loading = false }: DayStripProps) {
  const t = useT();
  if (day.closedToday) {
    return (
      <View className="gap-2">
        <View style={{ height: MAX_TICK + TRACK_HEIGHT, justifyContent: 'flex-end' }}>
          <View style={{ height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT, backgroundColor: ON_SLAB.rule }} />
        </View>
        <Text variant="caption" style={{ color: ON_SLAB.label }} className="text-[11px]">
          {t('business.dashboard.shopClosedToday')}
        </Text>
      </View>
    );
  }

  const plotted = loading
    ? []
    : orders
        .map((order) => ({ order, at: positionInDay(day, order.createdAt) }))
        .filter((entry): entry is { order: Order; at: number } => entry.at !== null);

  // Spikes are scaled against the day's own biggest basket, so the shape reads
  // as this shop's rhythm rather than against some absolute dollar scale.
  const largest = plotted.reduce((max, entry) => Math.max(max, entry.order.totalCad), 0);

  return (
    <View className="gap-2">
      <View style={{ height: MAX_TICK + TRACK_HEIGHT, justifyContent: 'flex-end' }}>
        <View style={{ height: MAX_TICK, position: 'relative' }}>
          {plotted.map((entry, index) => {
            const scale = largest > 0 ? entry.order.totalCad / largest : 0;
            return (
              <Reveal
                key={entry.order.id}
                index={index}
                from="fade"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: `${entry.at * 100}%`,
                  marginLeft: -1.5,
                }}
              >
                <View
                  style={{
                    width: 3,
                    height: MIN_TICK + scale * (MAX_TICK - MIN_TICK),
                    borderRadius: 2,
                    backgroundColor: ON_SLAB.tick,
                    opacity: 0.9,
                  }}
                />
              </Reveal>
            );
          })}
        </View>

        <View style={{ height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT, backgroundColor: ON_SLAB.rule }}>
          <View
            style={{
              width: `${day.progress * 100}%`,
              height: TRACK_HEIGHT,
              borderRadius: TRACK_HEIGHT,
              backgroundColor: ON_SLAB.elapsed,
            }}
          />
          {/* The now marker only makes sense while the shop is trading; outside
              hours the filled track already says where the day ended. */}
          {day.isOpen ? (
            <View
              style={{
                position: 'absolute',
                left: `${day.progress * 100}%`,
                top: -4,
                marginLeft: -5.5,
                width: 11,
                height: 11,
                borderRadius: 6,
                backgroundColor: ON_SLAB.now,
              }}
            />
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <Text variant="caption" style={{ color: ON_SLAB.label }} className="text-[11px]">
          {day.hours!.open}
        </Text>
        <Text variant="caption" style={{ color: ON_SLAB.label }} className="text-[11px]">
          {loading ? ' ' : t('business.dayStrip.orderCount', { count: plotted.length })}
        </Text>
        <Text variant="caption" style={{ color: ON_SLAB.label }} className="text-[11px]">
          {day.hours!.close}
        </Text>
      </View>
    </View>
  );
}
