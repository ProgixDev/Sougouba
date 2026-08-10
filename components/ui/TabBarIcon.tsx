import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export interface TabBarIconProps {
  icon: LucideIcon;
  /** Comes straight from the navigator, which types it as ColorValue. */
  color: ColorValue;
  size: number;
  focused: boolean;
}

/** Overshoots just enough to feel physical; damping keeps it from wobbling. */
const SPRING = { damping: 13, stiffness: 220, mass: 0.6 };

/**
 * Tab bar glyph that answers the tap.
 *
 * The tint change alone gives no sense of having pressed anything, so the
 * selected icon springs up and grows slightly. It is the only motion here —
 * the bar itself is already a blurred surface, and a second effect on top of
 * that reads as noise.
 */
export function TabBarIcon({ icon: Icon, color, size, focused }: TabBarIconProps) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, SPRING);
  }, [focused, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.12 }, { translateY: progress.value * -2 }],
  }));

  return (
    <Animated.View style={style}>
      <Icon color={color as string} size={size} strokeWidth={focused ? 2.4 : 2} />
    </Animated.View>
  );
}
