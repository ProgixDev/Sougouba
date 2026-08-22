import { Truck } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { DELIVERY_TIERS } from '@/data/deliveryPricing';
import { useThemeColors } from '@/hooks/useColorScheme';
import { formatCad } from '@/lib/format';

/**
 * The delivery grid, shown to the merchant rather than asked of them.
 *
 * Shops used to type their own fee. They no longer can — every courier is
 * Sougouba's, so the price of the run is the platform's to set — and a field
 * that simply vanishes reads as something lost. This says what replaced it, and
 * reads the bands straight from `data/deliveryPricing.ts` so the two cannot
 * drift.
 */
export function DeliveryGrid() {
  const colors = useThemeColors();

  return (
    <View className="rounded-2xl bg-card p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Truck size={15} color={colors.mutedForeground} strokeWidth={2} />
        <Text variant="label" tone="muted">
          Frais de livraison
        </Text>
      </View>

      <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
        Fixés par Sougouba selon la distance jusqu’au client, et payés par lui en plus du
        total. Vous n’avez rien à saisir.
      </Text>

      <View className="rounded-xl bg-muted px-3 py-2">
        {DELIVERY_TIERS.map((tier, index) => {
          const from = index === 0 ? 0 : DELIVERY_TIERS[index - 1].maxKm;
          return (
            <View
              key={tier.maxKm}
              className={`flex-row items-center justify-between py-1.5 ${
                index > 0 ? 'border-t border-border' : ''
              }`}
            >
              <Text variant="caption" tone="muted" className="text-[12px]">
                {Number.isFinite(tier.maxKm) ? `${from} – ${tier.maxKm} km` : `Plus de ${from} km`}
              </Text>
              <Text variant="caption" weight="semibold" className="text-[12px]">
                {formatCad(tier.feeCad)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
