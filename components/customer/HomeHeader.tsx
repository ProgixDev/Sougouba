import { LinearGradient } from 'expo-linear-gradient';
import { MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Text } from '@/components/ui';
import type { Category, ID } from '@/data/types';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { forest, mustard } from '@/theme/tokens';
import { CategoryRow } from './CategoryRow';
import { SearchField } from './SearchField';

export interface HomeHeaderProps {
  fullName: string;
  city: string;
  categories: Category[];
  selectedCategoryId?: ID | null;
  onSelectCategory?: (id: ID) => void;
  onSearchPress?: () => void;
  onProfilePress?: () => void;
}

/**
 * The Home hero panel: location, search and categories on one soft gradient
 * field with a deep bottom-only radius, exactly as in the reference.
 *
 * It carries the screen's only gradient on purpose. The rest of Home is plain
 * background so the panel reads as a single deliberate surface rather than
 * decoration — which is also why CategoryRow is transparent.
 */
export function HomeHeader({
  fullName,
  city,
  categories,
  selectedCategoryId,
  onSelectCategory,
  onSearchPress,
  onProfilePress,
}: HomeHeaderProps) {
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
        paddingBottom: 22,
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
            Livraison à
          </Text>
          <Text variant="subtitle" weight="bold" numberOfLines={1} className="text-[17px] leading-[22px]">
            {city}
          </Text>
        </View>
        <Pressable
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Votre profil"
          onPress={onProfilePress}
        >
          <Avatar fullName={fullName} size={44} />
        </Pressable>
      </View>

      <View className="px-5 mt-5">
        <SearchField onPress={onSearchPress} />
      </View>

      <View className="mt-6">
        <CategoryRow
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={onSelectCategory}
        />
      </View>
    </LinearGradient>
  );
}
