import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useColorScheme } from '@/hooks/useColorScheme';
import { routes } from '@/lib/routes';
import { darkColors, lightColors } from '@/theme/colors';
import { Text } from './Text';

export interface BackHeaderProps {
  title?: string;
  onBack?: () => void;
}

export function BackHeader({ title, onBack }: BackHeaderProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  function goBack() {
    if (onBack) return onBack();
    // A deep link straight into a nested screen has no history to pop —
    // fall back to the group's own root instead of a dead button.
    if (router.canGoBack()) return router.back();
    router.replace(routes.authWelcome);
  }

  return (
    <View className="flex-row items-center h-12 px-4">
      <Pressable
        hitSlop={10}
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        className="w-10 h-10 items-center justify-center rounded-full -ml-2"
      >
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>
      {title ? (
        <Text weight="bold" variant="body" className="ml-1">
          {title}
        </Text>
      ) : null}
    </View>
  );
}
