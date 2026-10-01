import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { formatCad, formatPercent } from '@/lib/format';
import { COMMISSION_RATE, MONTHLY_SUBSCRIPTION_CAD } from '@/lib/monetization';

export interface PayoutSummaryProps {
  /** Goods sold over the selected range. */
  salesCad: number;
  commissionCad: number;
  netCad: number;
  /** "7 jours", "30 jours" — the window these figures cover. */
  rangeLabel: string;
}

/**
 * What the merchant actually takes home.
 *
 * "Recettes" answers how much was sold; it does not answer how much arrives,
 * and with a 12 % commission the gap is not small. Stated as a deduction —
 * sales, minus the cut, equals net — because a merchant checking a payout reads
 * it as arithmetic, and three unrelated figures would leave them doing the
 * subtraction themselves.
 *
 * The monthly subscription is named but deliberately not folded into the total:
 * it is a flat monthly charge, so pro-rating it across a 7-day window would
 * invent a number that appears on no invoice.
 */
export function PayoutSummary({ salesCad, commissionCad, netCad, rangeLabel }: PayoutSummaryProps) {
  const t = useT();
  return (
    <View className="rounded-[20px] bg-card p-4 gap-3">
      <Text variant="label" tone="muted" className="text-[10px]">
        {t('business.payout.title', { range: rangeLabel })}
      </Text>

      <View className="gap-2.5">
        <Row label={t('business.payout.sales')} value={formatCad(salesCad)} />
        <Row
          label={t('business.payout.commission', { rate: formatPercent(COMMISSION_RATE) })}
          value={`− ${formatCad(commissionCad)}`}
          minor
        />
        <View className="h-px bg-border mt-0.5" />
        <Row label={t('business.payout.netSales')} value={formatCad(netCad)} emphasis />
      </View>

      <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
        {t('business.payout.subscriptionNote', { amount: formatCad(MONTHLY_SUBSCRIPTION_CAD) })}
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
  const t = useT();
  return (
    <View
      accessible
      accessibilityLabel={t('common.ui.labelledValue', { label, value })}
      className="flex-row items-baseline justify-between gap-3"
    >
      <Text
        variant="caption"
        tone={emphasis ? 'default' : 'muted'}
        weight={emphasis ? 'bold' : 'regular'}
        className={minor ? 'text-[13px] flex-1' : 'flex-1'}
      >
        {label}
      </Text>
      {emphasis ? (
        <Text variant="title" weight="bold" className="text-[20px]" style={tabular}>
          {value}
        </Text>
      ) : (
        <Text
          variant="caption"
          weight={minor ? 'regular' : 'semibold'}
          tone={minor ? 'muted' : 'default'}
          className={minor ? 'text-[13px]' : undefined}
          style={tabular}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

/** Matches `components/ui/PriceSummary.tsx`: a right-aligned money column must not wobble. */
const tabular = { fontVariant: ['tabular-nums' as const] };
