import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';

export interface OnboardingSlideProps {
  photo: ImageSourcePropType;
  title: string;
  description: string;
  /** Whether this page is the one on screen — drives the copy's settle. */
  active: boolean;
  /** Drift direction alternates down the deck so consecutive slides don't move alike. */
  index: number;
  /** Room the pinned dots and CTA need at the foot of the slide. */
  bottomInset: number;
}

/** Long enough that the drift is felt rather than watched. */
const DRIFT_MS = 16000;
const ZOOM = 0.14;
const DRIFT_PX = 18;

/**
 * One full-bleed slide: photograph, scrim, headline.
 *
 * The photography is the product here — these are the same market and kitchen
 * photographs the catalogue is built from — so it runs edge to edge and the copy
 * sits on it rather than beside it. A single scrim carries both ends of the
 * frame: enough darkness at the top for the skip link, and a deep foot the
 * headline can sit on at any brightness the photo happens to have.
 */
export function OnboardingSlide({
  photo,
  title,
  description,
  active,
  index,
  bottomInset,
}: OnboardingSlideProps) {
  const reducedMotion = useReducedMotion();
  const drift = useSharedValue(0);
  const settle = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    drift.value = withRepeat(
      withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [drift, reducedMotion]);

  useEffect(() => {
    settle.value = reducedMotion
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [active, settle, reducedMotion]);

  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + drift.value * ZOOM },
      { translateY: drift.value * (index % 2 === 0 ? -DRIFT_PX : DRIFT_PX) },
    ],
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: settle.value,
    transform: [{ translateY: (1 - settle.value) * 22 }],
  }));

  return (
    <View className="flex-1">
      <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
        <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>

      <LinearGradient
        // The top stop only has to carry the skip link; at 0.55 it was dimming
        // the produce in the upper half of every slide for no other gain.
        colors={['rgba(10,32,24,0.42)', 'rgba(10,32,24,0.05)', 'rgba(10,32,24,0.88)', '#0A2018']}
        locations={[0, 0.3, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[copyStyle, { paddingBottom: bottomInset }]}
        className="flex-1 justify-end px-7 gap-3"
      >
        <Text variant="display" weight="extrabold" className="text-[34px] leading-[40px] text-white">
          {title}
        </Text>
        <Text variant="body" className="text-[15px] leading-[22px] text-white/75">
          {description}
        </Text>
      </Animated.View>
    </View>
  );
}
