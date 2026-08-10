import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';

export interface StatColumn {
  label: string;
  value: string;
  /** Percent change vs the previous window. Null when there is no base to compare against. */
  deltaPct?: number | null;
}

export interface StatColumnsProps {
  title: string;
  columns: StatColumn[];
}

/**
 * A period's figures, split into equal columns by hairlines.
 *
 * The same structural device the customer app uses for a product's nutrition
 * row, for the same reason: these are parallel readings of one thing, and a grid
 * of separate cards would imply they are separate subjects. Four identical
 * shadowed tiles is also the shape every merchant dashboard already has.
 */
export function StatColumns({ title, columns }: StatColumnsProps) {
  return (
    <View className="rounded-[20px] bg-card px-4 py-4 gap-3.5">
      <Text variant="label" tone="muted" className="text-[10px]">
        {title}
      </Text>
      <View className="flex-row">
        {columns.map((column, index) => (
          <View key={column.label} className="flex-1 flex-row">
            {index > 0 ? <View className="w-px bg-border my-0.5" /> : null}
            <View className={`flex-1 gap-1 ${index > 0 ? 'pl-3' : 'pr-3'}`}>
              <Text variant="title" weight="bold" numberOfLines={1} className="text-[19px] leading-[23px]">
                {column.value}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
                {column.label}
              </Text>
              <Delta pct={column.deltaPct} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Delta({ pct }: { pct?: number | null }) {
  const colors = useThemeColors();

  if (pct === undefined) return null;
  if (pct === null) {
    return (
      <Text variant="caption" tone="muted" className="text-[11px] opacity-70">
        —
      </Text>
    );
  }

  const rising = pct >= 0;
  const Icon = rising ? TrendingUp : TrendingDown;
  // Green for up and red for down would read as pass/fail on a number that is
  // often neither. Direction is the signal; the colour just separates it from
  // the label above.
  const color = rising ? colors.success : colors.destructive;

  return (
    <View className="flex-row items-center gap-1">
      <Icon size={12} color={color} strokeWidth={2.5} />
      <Text variant="caption" weight="semibold" numberOfLines={1} className="text-[11px]" style={{ color }}>
        {rising ? '+' : ''}
        {pct} %
      </Text>
    </View>
  );
}
