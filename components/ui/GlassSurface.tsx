import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useColorScheme } from '@/hooks/useColorScheme';

export interface GlassSurfaceProps extends ViewProps {
  intensity?: number;
  className?: string;
}

/** Selective glassmorphism — tab bar, sheets, and cards over hero imagery only (see theme decisions). */
export function GlassSurface({ intensity = 40, className = '', style, children, ...rest }: GlassSurfaceProps) {
  const { colorScheme } = useColorScheme();

  return (
    <View className={`overflow-hidden ${className}`} style={style} {...rest}>
      <BlurView
        intensity={intensity}
        tint={colorScheme === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
