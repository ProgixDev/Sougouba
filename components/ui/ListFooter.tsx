import { ActivityIndicator, View } from 'react-native';

import { useThemeColors } from '@/hooks/useColorScheme';

/**
 * The bottom of an infinite-scroll list: a small spinner while the next page
 * is on its way, nothing otherwise. Goes in `ListFooterComponent`.
 */
export function ListFooter({ loading }: { loading: boolean }) {
  const colors = useThemeColors();
  if (!loading) return null;
  return (
    <View className="items-center py-5">
      <ActivityIndicator color={colors.mutedForeground} />
    </View>
  );
}
