import { View } from 'react-native';

import { Text } from '@/components/ui';
import { formatCad } from '@/lib/format';
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
  return (
    <View className="rounded-[20px] bg-card p-4 gap-3">
      <Text variant="label" tone="muted" className="text-[10px]">
        Reversement · {rangeLabel}
      </Text>

      <View className="gap-2.5">
        <Row label="Ventes" value={formatCad(salesCad)} />
        <Row
          label={`Commission Sougouba (${formatPercent(COMMISSION_RATE)})`}
          value={`− ${formatCad(commissionCad)}`}
          minor
        />
        <View className="h-px bg-border mt-0.5" />
        <Row label="Net des ventes" value={formatCad(netCad)} emphasis />
      </View>

      <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
        Abonnement de {formatCad(MONTHLY_SUBSCRIPTION_CAD)} par mois facturé séparément.
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
    <View
      accessible
      accessibilityLabel={`${label} : ${value}`}
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

/** "12 %" — French spacing, and no trailing zeros on a whole percentage. */
function formatPercent(rate: number): string {
  return `${new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 2 }).format(rate * 100)} %`;
}

/** Matches `components/ui/PriceSummary.tsx`: a right-aligned money column must not wobble. */
const tabular = { fontVariant: ['tabular-nums' as const] };
