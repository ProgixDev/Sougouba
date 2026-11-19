import * as Haptics from 'expo-haptics';
import { Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import { mustard } from '@/theme/tokens';

export interface StarRatingProps {
  /** 0 means "not rated yet" — every star empty. */
  value: number;
  /** Omit for a read-only row: the stars are then drawn, not pressable. */
  onChange?: (value: number) => void;
  size?: number;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * Five stars, as an input or as a display.
 *
 * Each star is its own button with its own label ("3 sur 5") rather than one
 * adjustable control: a row of five targets is what a thumb expects, and a
 * screen reader user can land on the mark they mean instead of stepping to it.
 *
 * There is no way to return to zero by tapping. A rating is given or it is
 * not — the sheet that hosts this decides whether one is required.
 */
export function StarRating({ value, onChange, size = 30 }: StarRatingProps) {
  const t = useT();
  const colors = useThemeColors();

  const star = (n: number) => (
    <Star
      size={size}
      color={n <= value ? mustard[500] : colors.border}
      fill={n <= value ? mustard[500] : 'transparent'}
      strokeWidth={n <= value ? 0 : 1.8}
    />
  );

  if (!onChange) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('common.rating.value', { value })}
        className="flex-row gap-1"
      >
        {STARS.map((n) => (
          <View key={n}>{star(n)}</View>
        ))}
      </View>
    );
  }

  return (
    <View className="flex-row gap-1.5">
      {STARS.map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={t('common.rating.value', { value: n })}
          accessibilityState={{ selected: n === value }}
          hitSlop={6}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(n);
          }}
        >
          {star(n)}
        </Pressable>
      ))}
    </View>
  );
}
