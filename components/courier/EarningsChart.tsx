import { MotiView } from 'moti';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import type { RunBucket } from '@/lib/courierAnalytics';
import { useT } from '@/lib/i18n/useT';
import { formatCad } from '@/lib/format';
import { mustard } from '@/theme/tokens';

export interface EarningsChartProps {
  buckets: RunBucket[];
  /** Highlighted when nothing is selected — the day worth knowing about. */
  bestDay: RunBucket | null;
}

/** The plot area, bars and axis labels together. */
const PLOT_HEIGHT = 154;
/**
 * The axis-label row, reserved out of the plot so a full-height bar cannot push
 * it off. Wide enough for the label's own line box *plus* the 6pt gap above it —
 * at 18 the descenders were clipped by the card's bottom edge.
 */
const LABEL_ROW = 24;
/** Tallest a bar gets. Below ~120 the difference between a good and a flat night stops reading. */
const BAR_MAX = PLOT_HEIGHT - LABEL_ROW;
/** A bar that rounds to nothing still has to be visible — an empty day and a 2 $ day are not the same. */
const MIN_BAR = 3;
/**
 * Above this, columns are too narrow to tap without hitting the wrong one, so
 * selection is dropped rather than shrunk below the 44pt minimum. Thirty bars
 * across a phone is ~9pt each; a tap there is a coin toss.
 */
const SELECTABLE_MAX = 14;

/**
 * What a courier earned, day by day.
 *
 * Hand-built rather than reached for from `react-native-gifted-charts`, which
 * the merchant Analytique screen uses — and the reason is the interaction, not
 * the drawing. This chart's job is to answer "which nights are worth working",
 * so a bar has to be tappable, and the selection has to read back as money at
 * the top of the card rather than as a floating tooltip a thumb covers. Bars
 * also grow from the baseline on entry, which is the one animation on the
 * screen that means something: they are quantities rising.
 *
 * Axis labels are thinned rather than rotated — a rotated day-of-month on a
 * 375pt screen is unreadable, and a chart nobody can read is worse than one
 * with fewer ticks.
 */
export function EarningsChart({ buckets, bestDay }: EarningsChartProps) {
  const t = useT();
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const reducedMotion = useReducedMotion();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Emphasis is hue, not opacity and not lightness.
  //
  // Fading the quiet bars was the obvious move and the wrong one: mustard at
  // 40 % over a white card falls to roughly 1.5:1, well under the 3:1 a data
  // mark has to clear, so the quiet days stopped being data. Darkening the
  // highlight instead cleared the threshold and still read backwards — on a
  // white card the eye takes the *brighter* bar as the emphasised one, so the
  // best day looked like the dullest.
  //
  // So the highlight switches to the app's primary, the same green that marks
  // every other selected thing in the product. One green bar among gold ones is
  // unmistakable at a glance, it means "selected" everywhere else already, and
  // both tones clear 3:1 in both themes — `scripts/verify-contrast.ts` checks
  // all four.
  const barTone = colorScheme === 'dark' ? mustard[500] : mustard[600];
  const barToneStrong = colors.primary;

  const selectable = buckets.length <= SELECTABLE_MAX;
  const selected = selectedDate ? (buckets.find((b) => b.date === selectedDate) ?? null) : null;
  // Nothing selected falls back to the best day: the card always says something
  // specific rather than repeating the total already printed above it.
  const shown = selected ?? bestDay;

  // Scaled to the tallest bar, floored so a single quiet day does not blow one
  // 4 $ run up to full height and imply a record night.
  const peak = Math.max(20, ...buckets.map((b) => b.earningsCad));
  const labelEvery = buckets.length <= 7 ? 1 : buckets.length <= 14 ? 2 : 5;

  return (
    <View className="rounded-[20px] bg-card p-4 gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <Text variant="label" tone="muted" className="text-[10px]">
          Gains par jour
        </Text>
        {shown ? (
          <View className="items-end gap-0.5">
            <Text
              weight="bold"
              className="text-[15px]"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatCad(shown.earningsCad)}
            </Text>
            <Text variant="caption" tone="muted" className="text-[11px]">
              {selected
                ? t('courier.chart.selectedDay', {
                    label: shown.label,
                    runs: t('courier.runCount', { count: shown.runCount }),
                  })
                : t('courier.bestDay', { label: shown.label })}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row items-end gap-1.5" style={{ height: PLOT_HEIGHT }}>
        {buckets.map((bucket, index) => {
          const height = Math.max(
            bucket.earningsCad > 0 ? MIN_BAR : 2,
            (bucket.earningsCad / peak) * BAR_MAX
          );
          const isSelected = selected?.date === bucket.date;
          const isBest = !selected && bestDay?.date === bucket.date;
          const empty = bucket.earningsCad === 0;

          const fill = empty ? colors.border : isSelected || isBest ? barToneStrong : barTone;

          const bar = (
            <MotiView
              from={reducedMotion ? undefined : { height: 2 }}
              animate={{ height }}
              transition={{
                type: 'timing',
                // Staggered left to right so the week reads as filling in, and
                // capped so the last bar is never more than a beat behind.
                delay: reducedMotion ? 0 : Math.min(index * 28, 340),
                duration: 420,
              }}
              style={{
                height,
                borderRadius: 5,
                backgroundColor: fill,
              }}
            />
          );

          const column = (
            <>
              {bar}
              <Text
                variant="caption"
                tone="muted"
                numberOfLines={1}
                className="text-[9px] text-center"
                style={{ opacity: index % labelEvery === 0 || isSelected ? 1 : 0 }}
              >
                {bucket.label}
              </Text>
            </>
          );

          if (!selectable) {
            return (
              <View key={bucket.date} className="flex-1 justify-end" style={{ gap: 6 }}>
                {column}
              </View>
            );
          }

          return (
            <Pressable
              key={bucket.date}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t('courier.chart.barA11y', {
                label: bucket.label,
                amount: formatCad(bucket.earningsCad),
                runs: t('courier.runCount', { count: bucket.runCount }),
              })}
              // The whole column is the target, not the bar: an empty day is
              // still a day someone taps to confirm it was empty.
              hitSlop={{ top: 8, bottom: 8 }}
              onPress={() => setSelectedDate(isSelected ? null : bucket.date)}
              className="flex-1 justify-end"
              style={{ gap: 6 }}
            >
              {column}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
