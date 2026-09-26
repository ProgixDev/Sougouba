import { LinearGradient } from 'expo-linear-gradient';
import { MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { forest, mustard } from '@/theme/tokens';
import { SearchField } from './SearchField';

export interface HomeHeaderProps {
  fullName: string;
  city: string;
  onSearchPress?: () => void;
  onProfilePress?: () => void;
}

/**
 * The Home hero panel: location and search on one soft gradient field with a
 * deep bottom-only radius.
 *
 * It carries the screen's only gradient on purpose — the rest of Home is plain
 * background, so the panel reads as a single deliberate surface rather than
 * decoration.
 *
 * It used to close with a strip of eight category circles. Those asked the
 * shopper to filter a mixed catalogue before deciding what kind of shop they
 * wanted; the CDC addendum puts that choice first instead, and it is now made on
 * the two `VerticalCard`s directly below this panel.
 */
export function HomeHeader({ fullName, city, onSearchPress, onProfilePress }: HomeHeaderProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();

  // Dark mode gets a tonal forest wash rather than the light mint→lime sweep,
  // which would glow against a near-black background.
  const gradient =
    colorScheme === 'dark'
      ? ([forest[950], '#13231D'] as const)
      : ([forest[100], mustard[50]] as const);

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 26,
        borderBottomLeftRadius: 34,
        borderBottomRightRadius: 34,
      }}
    >
      <View className="flex-row items-center gap-3 px-5">
        <View className="w-11 h-11 items-center justify-center rounded-full bg-card">
          <MapPin size={19} color={colors.primary} strokeWidth={2} />
        </View>
        <View className="flex-1">
          <Text variant="caption" tone="muted" className="text-[12px]">
            {t('customer.home.deliverTo')}
          </Text>
          <Text variant="subtitle" weight="bold" numberOfLines={1} className="text-[17px] leading-[22px]">
            {city}
          </Text>
        </View>
        <Pressable
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('customer.misc.yourProfile')}
          onPress={onProfilePress}
        >
          <Avatar fullName={fullName} size={44} />
        </Pressable>
      </View>

      <View className="px-5 mt-5">
        <SearchField onPress={onSearchPress} />
      </View>
    </LinearGradient>
  );
}
