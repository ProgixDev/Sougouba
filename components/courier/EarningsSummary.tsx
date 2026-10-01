import { View } from 'react-native';

import { Text } from '@/components/ui';
import { BASE_FARE_CAD, PER_KM_CAD } from '@/data/courierPay';
import type { Order } from '@/data/types';
import { formatCad } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { formatDistance } from '@/lib/geo';

export interface EarningsSummaryProps {
  runs: Order[];
  /** "aujourd'hui", "7 jours" — the window these figures cover. */
  rangeLabel: string;
}

/**
 * Where the money came from.
 *
 * Mirror of `components/business/PayoutSummary.tsx`, and the same argument: a
 * single total answers "how much" but not "why that much", and a courier who
 * cannot see the split has no way to tell a good run from a bad one. So the
 * fare is broken into the parts the rates in `data/courierPay.ts` actually
 * define — a flat pickup fee, a distance component, and tips passed through
 * whole.
 *
 * Tips are shown on their own line rather than folded in, because they are not
 * the platform's money and a courier reading a payout needs to know which part
 * the rates can change.
 *
 * **The total is the sum of what was actually paid**, not a recomputation from
 * the rates. Each run's `earningsCad` was rounded to the cent when it was
 * completed, so re-deriving the total from raw kilometres rounds once instead of
 * once per run and lands a couple of cents away — which put 254,88 $ at the top
 * of this screen and 254,86 $ at the bottom of it. The distance line is
 * therefore derived by subtraction: the pickup fee and the tips are exact, so
 * whatever rounding happened lives in the component it came from, and the column
 * adds up.
 */
export function EarningsSummary({ runs, rangeLabel }: EarningsSummaryProps) {
  const t = useT();
  const km = runs.reduce((sum, o) => sum + (o.delivery?.distanceKm ?? 0), 0);
  const tips = round2(runs.reduce((sum, o) => sum + (o.delivery?.tipCad ?? 0), 0));
  const base = round2(runs.length * BASE_FARE_CAD);
  const total = round2(runs.reduce((sum, o) => sum + (o.delivery?.earningsCad ?? 0), 0));
  const distance = round2(total - base - tips);

  return (
    <View className="rounded-[20px] bg-card p-4 gap-3">
      <Text variant="label" tone="muted" className="text-[10px]">
        {t('courier.earnings.title', { range: rangeLabel })}
      </Text>

      <View className="gap-2.5">
        <Row
          label={t('courier.earnings.baseFareRow', {
            runs: t('courier.runCount', { count: runs.length }),
          })}
          value={formatCad(base)}
        />
        <Row label={t('courier.earnings.distanceRow', { distance: formatDistance(km) })} value={formatCad(distance)} />
        <Row label={t('courier.earnings.tipsRow')} value={formatCad(tips)} minor />
        <View className="h-px bg-border mt-0.5" />
        <Row label={t('common.price.total')} value={formatCad(total)} emphasis />
      </View>

      <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
        {t('courier.earnings.rateNote', {
          base: formatCad(BASE_FARE_CAD),
          perKm: formatCad(PER_KM_CAD),
        })}
      </Text>
    </View>
  );
}

function Row({
  label,
  value,
  minor = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  minor?: boolean;
  emphasis?: boolean;
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text
        variant="caption"
        tone={minor || !emphasis ? 'muted' : 'default'}
        weight={emphasis ? 'bold' : 'regular'}
        className={emphasis ? 'text-[14px]' : 'text-[13px]'}
      >
        {label}
      </Text>
      <Text
        weight={emphasis ? 'bold' : 'medium'}
        className={emphasis ? 'text-[17px]' : 'text-[13px]'}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
