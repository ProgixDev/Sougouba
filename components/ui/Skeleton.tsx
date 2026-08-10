import { useEffect } from 'react';
import { type DimensionValue, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  className?: string;
}

export function Skeleton({ width = '100%', height = 16, radius = 8, className = '' }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.4, { duration: 700 })), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      className={`bg-muted ${className}`}
      style={[{ width, height, borderRadius: radius }, style]}
    />
  );
}

export function SkeletonCircle({ size = 44 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius={size / 2} />;
}

export function SkeletonCard() {
  return (
    <View className="gap-3 p-3">
      <Skeleton height={120} radius={16} />
      <Skeleton height={14} width="70%" />
      <Skeleton height={14} width="40%" />
    </View>
  );
}
