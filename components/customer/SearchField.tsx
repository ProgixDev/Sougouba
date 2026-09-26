import { Search, SlidersHorizontal } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useColorScheme } from '@/hooks/useColorScheme';
import { darkColors, lightColors } from '@/theme/colors';

export interface SearchFieldProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onFilterPress?: () => void;
  /** Number of filters in effect — shown on the glyph so the count is visible without opening the sheet. */
  activeFilterCount?: number;
  /** Render as a button that navigates to the search screen instead of a live field. */
  onPress?: () => void;
  placeholder?: string;
}

/**
 * The translucent pill in the Home header. Two modes: a real input, or a
 * pressable that hands off to the search screen — Home uses the latter so the
 * keyboard never covers the content behind the header gradient.
 *
 * Unlike `components/ui/Input`, this one *does* take a placeholder: there is no
 * floating label here to collide with.
 */
export function SearchField({
  value,
  onChangeText,
  onFilterPress,
  activeFilterCount = 0,
  onPress,
  placeholder,
}: SearchFieldProps) {
  const t = useT();
  // See `CitySelect` — resolved inside, so the placeholder follows the language.
  const resolvedPlaceholder = placeholder ?? t('customer.searchField.placeholder');
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  const readOnly = Boolean(onPress);
  const glyphBackground = colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)';

  const body = (
    <View
      className="h-14 flex-row items-center gap-3 rounded-full px-5"
      style={{ backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)' }}
    >
      <Search size={20} color={colors.mutedForeground} strokeWidth={2} />
      <TextInput
        className="flex-1 text-base text-foreground font-sans-medium"
        placeholder={resolvedPlaceholder}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChangeText}
        // In hand-off mode the input must not steal the tap or raise a keyboard.
        editable={!readOnly}
        pointerEvents={readOnly ? 'none' : 'auto'}
        returnKeyType="search"
      />
      {/* Decorative unless a handler is supplied — a tappable glyph that does
          nothing is worse than no glyph, and on Home it would also swallow the
          tap meant to open the search screen. */}
      {onFilterPress ? (
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0
              ? t('customer.searchField.filtersActive', { count: activeFilterCount })
              : t('customer.searchField.filters')
          }
          onPress={onFilterPress}
          className="w-9 h-9 items-center justify-center rounded-full"
          style={{ backgroundColor: activeFilterCount > 0 ? colors.primary : glyphBackground }}
        >
          <SlidersHorizontal
            size={17}
            color={activeFilterCount > 0 ? colors.primaryForeground : colors.primary}
            strokeWidth={2}
          />
          {activeFilterCount > 0 ? (
            <View
              className="absolute -right-1 -top-1 min-w-[17px] h-[17px] items-center justify-center rounded-full px-1"
              style={{ backgroundColor: colors.secondary }}
            >
              {/* Not hard-coded white: the dark theme's secondary is a light
                  terracotta, where white text falls below AA. */}
              <Text
                weight="bold"
                className="text-[10px] leading-[13px]"
                style={{ color: colors.secondaryForeground }}
              >
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View
          pointerEvents="none"
          className="w-9 h-9 items-center justify-center rounded-full"
          style={{ backgroundColor: glyphBackground }}
        >
          <SlidersHorizontal size={17} color={colors.primary} strokeWidth={2} />
        </View>
      )}
    </View>
  );

  if (!readOnly) return body;

  return (
    <Pressable accessibilityRole="search" accessibilityLabel={resolvedPlaceholder} onPress={onPress}>
      {body}
    </Pressable>
  );
}
