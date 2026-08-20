import { View } from 'react-native';

import { formatCad } from '@/lib/format';
import { Text } from './Text';

export interface PriceSummaryProps {
  subtotalCad: number;
  gstCad: number;
  qstCad: number;
  deliveryFeeCad: number;
  totalCad: number;
}

/**
 * The order's money column — cart, checkout, and both order-detail screens.
 *
 * It was four hand-written copies of three rows until TPS and TVQ arrived; five
 * rows written out four times is four receipts free to disagree. Deliberately
 * surface-less: the cart floats it on a card, the order screens sit it under the
 * item list, and the caller owns that decision.
 *
 * Three tiers of emphasis, because five equal rows read as a list rather than as
 * an arithmetic. The two taxes are inset and set smaller — they derive from the
 * subtotal above them and should read that way — while delivery returns to the
 * base tier, since it is a charge in its own right and, per the CDC, is the one
 * line the taxes are *not* computed on.
 */
export function PriceSummary({
  subtotalCad,
  gstCad,
  qstCad,
  deliveryFeeCad,
  totalCad,
}: PriceSummaryProps) {
  return (
    <View className="gap-2.5">
      <Line label="Sous-total" value={subtotalCad} />

      <View className="gap-1.5 pl-3">
        <Line label="Taxe fédérale (TPS)" value={gstCad} tier="minor" />
        <Line label="Taxe provinciale (TVQ)" value={qstCad} tier="minor" />
      </View>

      <Line label="Livraison" value={deliveryFeeCad} />

      <View className="h-px bg-border mt-1.5" />

      <Line label="Total" value={totalCad} tier="total" />
    </View>
  );
}

function Line({
  label,
  value,
  tier = 'base',
}: {
  label: string;
  value: number;
  tier?: 'base' | 'minor' | 'total';
}) {
  const amount = formatCad(value);
  const minor = tier === 'minor';

  return (
    <View
      accessible
      accessibilityLabel={`${label} : ${amount}`}
      className="flex-row items-baseline justify-between gap-3"
    >
      <Text
        variant="caption"
        tone={tier === 'total' ? 'default' : 'muted'}
        weight={tier === 'total' ? 'bold' : 'regular'}
        className={minor ? 'text-[13px]' : undefined}
      >
        {label}
      </Text>

      {tier === 'total' ? (
        // The display face carries prices elsewhere in the app; the bottom line
        // is the one number on the screen worth spending it on.
        <Text variant="title" weight="bold" className="text-[20px]" style={tabular}>
          {amount}
        </Text>
      ) : (
        <Text
          variant="caption"
          weight={minor ? 'regular' : 'semibold'}
          tone={minor ? 'muted' : 'default'}
          className={minor ? 'text-[13px]' : undefined}
          style={tabular}
        >
          {amount}
        </Text>
      )}
    </View>
  );
}

/**
 * Proportional digits make a right-aligned column of five amounts wobble as
 * quantities change — a "1" is half the width of a "0" in both faces here.
 */
const tabular = { fontVariant: ['tabular-nums' as const] };
