import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import type { NutritionInfo } from '@/data/types';

export interface NutritionRowProps {
  nutrition: NutritionInfo;
}

/**
 * The four-column nutrition strip on Product Detail: muted label above a bold
 * value with a smaller muted unit, columns separated by hairlines — as in the
 * reference. Values are rendered `<number> <unit>` with the unit de-emphasised
 * so the numbers line up as the thing you scan.
 */
/** Keys, not sentences — module scope. Wording is `customer.nutrition.*`. */
const COLUMNS = [
  { key: 'calories', unit: 'kcal' },
  { key: 'proteinG', unit: 'g' },
  { key: 'fatG', unit: 'g' },
  { key: 'weightG', unit: 'g' },
] as const;

export function NutritionRow({ nutrition }: NutritionRowProps) {
  const t = useT();
  return (
    <View className="flex-row rounded-2xl bg-muted px-1 py-3">
      {COLUMNS.map((column, index) => (
        <View
          key={column.key}
          className={`flex-1 items-center gap-1 px-1 ${index > 0 ? 'border-l border-border' : ''}`}
        >
          <Text variant="caption" tone="muted" className="text-[12px]">
            {t(`customer.nutrition.${column.key}`)}
          </Text>
          <View className="flex-row items-baseline gap-1">
            <Text variant="subtitle" weight="bold" className="text-[16px] leading-[20px]">
              {nutrition[column.key]}
            </Text>
            <Text variant="caption" tone="muted" className="text-[11px]">
              {column.unit}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
