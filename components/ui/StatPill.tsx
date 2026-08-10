import { View } from 'react-native';

import { Text } from './Text';

export interface StatPillProps {
  label: string;
  value: string;
}

/** One column of the product-detail nutrition row (Calories / Protein / Fat / Weight). */
export function StatPill({ label, value }: StatPillProps) {
  return (
    <View className="flex-1 items-center gap-1">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text weight="bold" variant="subtitle">
        {value}
      </Text>
    </View>
  );
}
