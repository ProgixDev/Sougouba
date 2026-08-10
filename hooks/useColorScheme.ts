import { useEffect } from 'react';
import { colorScheme as nativewindColorScheme, useColorScheme as useNativewindColorScheme } from 'nativewind';

import { useThemeStore } from '@/store/useThemeStore';
import { darkColors, lightColors, type ThemeColors } from '@/theme/colors';

/** Keeps NativeWind's active color scheme in sync with our persisted theme preference. Mount once, at the root. */
export function useSyncColorScheme() {
  const preference = useThemeStore((s) => s.preference);

  useEffect(() => {
    nativewindColorScheme.set(preference);
  }, [preference]);
}

/** Read the currently active scheme anywhere (mirrors nativewind's own hook). */
export function useColorScheme() {
  return useNativewindColorScheme();
}

/**
 * The active semantic palette.
 *
 * Anything that takes a colour as a *prop* rather than a class — Lucide icons,
 * `shadowColor`, chart series, SVG fills — must go through this. Reaching for a
 * raw ramp value there bakes in the light theme: `neutral[600]` sits at 1.7:1 on
 * the dark card, so those icons simply disappear.
 */
export function useThemeColors(): ThemeColors {
  const { colorScheme } = useNativewindColorScheme();
  return colorScheme === 'dark' ? darkColors : lightColors;
}
