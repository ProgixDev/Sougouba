import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import type { Category } from '@/data/types';
import { categoryIcons } from '@/lib/categoryIcons';
import { useLocalized } from '@/lib/localized';
import { categoryImages } from '@/lib/categoryImages';
import { categoryPalette } from '@/theme/colors';
import { forest } from '@/theme/tokens';

export interface CategoryCircleProps {
  category: Category;
  selected?: boolean;
  onPress?: () => void;
  size?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const RING_WIDTH = 2.5;
/** Breathing room between photo and ring, so the ring reads as a halo, not a border. */
const RING_GAP = 3;
const RING_INSET = RING_WIDTH + RING_GAP;
const SPRING = { damping: 14, stiffness: 200, mass: 0.6 };

/**
 * Circular category badge for the Home header row.
 *
 * It shows the goods, not a symbol for the goods. A thin outline glyph asked the
 * shopper to decode a pictogram before recognising a category; the photograph of
 * the actual merguez or ras el hanout is recognised before it is read, and it is
 * the strongest thing this marketplace has — 88 pieces of real food photography.
 * `lib/categoryImages.ts` holds the mapping; a category with no photo still gets
 * the tinted disc and its Lucide glyph, so a new category is never a grey hole.
 *
 * Selecting draws a forest ring rather than the white one the pastel discs used.
 * White separated a tinted disc from a tinted band; against photography it reads
 * as a gap in the image, and the brand green is unambiguous on all eight.
 */
export function CategoryCircle({ category, selected = false, onPress, size = 68 }: CategoryCircleProps) {
  const L = useLocalized();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const selection = useSharedValue(selected ? 1 : 0);

  const photo = categoryImages[category.id];
  const Icon = categoryIcons[category.icon];
  const palette = categoryPalette[category.colorToken as keyof typeof categoryPalette] ?? categoryPalette.forest;

  useEffect(() => {
    selection.value = reducedMotion ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, SPRING);
  }, [selected, selection, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // The ring springs open around the photo rather than appearing, so switching
  // category reads as one badge handing off to another. It is drawn as an
  // overlay on a fixed-size box — animating padding or width would relayout the
  // whole strip on every tap.
  const ringStyle = useAnimatedStyle(() => ({
    opacity: selection.value,
    transform: [{ scale: 0.86 + selection.value * 0.14 }],
  }));

  const glowStyle = useAnimatedStyle(() => ({ shadowOpacity: selection.value * 0.3 }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={L(category.name)}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={() => {
        scale.value = withTiming(0.94, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 });
      }}
      style={animatedStyle}
      className="items-center gap-2"
    >
      {/* The box is always `size`, so selecting only repaints — it never reflows the row. */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: forest[700],
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 9,
            elevation: selected ? 5 : 0,
          },
          glowStyle,
        ]}
      >
        <View
          className="flex-1 items-center justify-center overflow-hidden"
          style={{ borderRadius: size / 2, backgroundColor: palette.background }}
        >
          {photo ? (
            // expo-image drops className — NativeWind registers no cssInterop here.
            <Image source={photo} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={180} />
          ) : Icon ? (
            <Icon size={size * 0.4} color={palette.icon} strokeWidth={1.6} />
          ) : null}
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: -RING_INSET,
              left: -RING_INSET,
              right: -RING_INSET,
              bottom: -RING_INSET,
              borderRadius: size / 2 + RING_INSET,
              borderWidth: RING_WIDTH,
              borderColor: forest[600],
            },
            ringStyle,
          ]}
        />
      </Animated.View>

      <Text
        variant="caption"
        weight={selected ? 'bold' : 'medium'}
        tone={selected ? 'primary' : 'default'}
        numberOfLines={1}
        style={{ maxWidth: size + 14 }}
      >
        {L(category.shortName)}
      </Text>
    </AnimatedPressable>
  );
}
