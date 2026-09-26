import * as Haptics from 'expo-haptics';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useColorScheme } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import { darkColors, lightColors } from '@/theme/colors';
import { Text } from './Text';

export interface QuantityStepperProps {
  qty: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
}

/**
 * −/qty/+ control for cart rows.
 *
 * At the minimum the decrement turns into a bin icon rather than going inert:
 * a disabled minus at qty 1 leaves no way to remove the line without hunting
 * for a swipe gesture. `onChange(0)` is the removal signal — the cart store
 * already filters out non-positive quantities.
 */
export function QuantityStepper({ qty, onChange, min = 1, max = 99 }: QuantityStepperProps) {
  const t = useT();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const atMin = qty <= min;
  const atMax = qty >= max;

  function step(next: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(next);
  }

  return (
    <View className="flex-row items-center gap-1 rounded-full bg-muted p-1">
      <Pressable
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={t(atMin ? 'common.ui.removeFromCart' : 'common.ui.decrease')}
        onPress={() => step(atMin ? 0 : qty - 1)}
        className="w-7 h-7 items-center justify-center rounded-full bg-card"
      >
        {atMin ? (
          <Trash2 size={14} color={colors.destructive} strokeWidth={2} />
        ) : (
          <Minus size={14} color={colors.foreground} strokeWidth={2.5} />
        )}
      </Pressable>

      <Text
        weight="bold"
        className="text-[13px] min-w-[22px] text-center"
        accessibilityLabel={t('common.ui.quantity', { qty })}
      >
        {qty}
      </Text>

      <Pressable
        hitSlop={4}
        disabled={atMax}
        accessibilityRole="button"
        accessibilityLabel={t('common.ui.increase')}
        onPress={() => step(qty + 1)}
        className={`w-7 h-7 items-center justify-center rounded-full ${atMax ? 'bg-card opacity-40' : 'bg-card'}`}
      >
        <Plus size={14} color={colors.foreground} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}
