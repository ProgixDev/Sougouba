import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';

/**
 * Frosted tab bar.
 *
 * This is the one place the "subtle, selective glassmorphism" decision actually
 * lands — it needs content moving underneath to read as glass, which the tab bar
 * has and a static card does not.
 *
 * The blur alone is too transparent for label contrast over busy content (a
 * product grid scrolling past), so a heavy card-tinted wash sits on top of it.
 * That keeps the depth cue while leaving the labels legible, which matters more.
 */
export function TabBarBackground() {
  const { colorScheme } = useColorScheme();
  const colors = useThemeColors();
  const isDark = colorScheme === 'dark';

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={isDark ? 40 : 55} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.card, opacity: isDark ? 0.72 : 0.78 },
        ]}
      />
    </View>
  );
}
