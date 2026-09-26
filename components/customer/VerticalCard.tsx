import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Skeleton, Text } from '@/components/ui';
import type { Vertical } from '@/lib/verticals';
import { useT } from '@/lib/i18n/useT';
import { shadows } from '@/theme/shadows';

export interface VerticalCardProps {
  vertical: Vertical;
  /** Shops currently listed under it, and the quickest delivery among them. */
  shopCount?: number;
  fastestEtaMin?: number;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const HEIGHT = 136;
/**
 * Full-height rule in the vertical's own colour — the only place it is spent.
 * At 3px it disappeared against a photograph; 5 is the width at which it reads
 * as a deliberate spine rather than an edge artefact.
 */
const ACCENT_WIDTH = 5;

/**
 * A front door to one of the two verticals, on Home.
 *
 * It replaces the row of eight category circles, which asked the shopper to
 * filter a mixed catalogue before knowing what kind of shop they wanted. Two
 * destinations, stacked full-width rather than side by side: at 375px a 2-up
 * grid leaves each card 168px across, which cannot carry a photograph, a name at
 * display size and a line of live inventory without one of the three shrinking
 * out of legibility.
 *
 * The scrim is load-bearing, not decoration — white type over a market stall is
 * unreadable without it — and it is the card's only depth effect beyond the
 * shared card shadow.
 */
export function VerticalCard({ vertical, shopCount, fastestEtaMin, onPress }: VerticalCardProps) {
  const t = useT();
  const label = t(`domain.vertical.${vertical.type}.label`);
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const Icon = vertical.icon;
  const ready = shopCount !== undefined;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={
        ready
          ? t('customer.verticalCard.a11y', {
              label,
              count: t(`domain.vertical.${vertical.type}.count`, { count: shopCount }),
            })
          : label
      }
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={() => {
        scale.value = withTiming(0.985, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 130 });
      }}
      style={[shadows.card, pressStyle, { height: HEIGHT }]}
      className="rounded-[24px] overflow-hidden bg-card"
    >
      {vertical.cover ? (
        // expo-image drops className — NativeWind registers no cssInterop here.
        <Image
          source={vertical.cover}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
          contentFit="cover"
          transition={220}
        />
      ) : (
        <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: vertical.accent }} />
      )}

      <LinearGradient
        // Tuned against the brightest cover in the set: the subtitle sits over
        // the pale rim of a plate, and at 0.78 it was borderline against it.
        colors={['transparent', 'rgba(12,10,8,0.34)', 'rgba(12,10,8,0.86)']}
        locations={[0, 0.40, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%' }}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: ACCENT_WIDTH,
          backgroundColor: vertical.accent,
        }}
      />

      <View className="flex-1 flex-row items-end gap-3 px-5 pb-4">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Icon size={19} color="#FFFFFF" strokeWidth={2.1} />
            <Text variant="title" weight="bold" className="text-[25px] leading-[30px] text-white">
              {label}
            </Text>
          </View>

          {ready ? (
            <Text variant="caption" weight="medium" className="text-[13px] text-white/85">
              {fastestEtaMin !== undefined
                ? t('customer.verticalCard.countWithEta', {
                    shops: t(`domain.vertical.${vertical.type}.count`, { count: shopCount }),
                    minutes: fastestEtaMin,
                  })
                : t(`domain.vertical.${vertical.type}.count`, { count: shopCount })}
            </Text>
          ) : (
            // Sized to the line it replaces, so the card does not resettle when
            // the catalogue resolves.
            <Skeleton height={16} width={150} radius={6} />
          )}
        </View>

        <ChevronRight size={22} color="rgba(255,255,255,0.8)" strokeWidth={2.2} />
      </View>
    </AnimatedPressable>
  );
}
