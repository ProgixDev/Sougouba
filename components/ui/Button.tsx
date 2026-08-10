import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, type PressableProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { coloredShadow } from '@/theme/shadows';
import { forest, semantic, terracotta } from '@/theme/tokens';
import { Text } from './Text';

type Variant = 'cta' | 'primary' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-10 px-5',
  md: 'h-12 px-6',
  lg: 'h-14 px-7',
};

/** Shadow tint per filled variant — a lift matched to the button's own color, not a generic gray drop shadow. */
const shadowColor: Partial<Record<Variant, string>> = {
  primary: forest[700],
  cta: terracotta[800],
  destructive: semantic.destructive.light,
};

const fillClass: Partial<Record<Variant, string>> = {
  primary: 'bg-primary',
  destructive: 'bg-destructive',
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const scale = useSharedValue(1);
  const pressOverlay = useSharedValue(0);
  const isDisabled = disabled || loading;
  const filled = variant === 'primary' || variant === 'cta' || variant === 'destructive';

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: pressOverlay.value }));

  const content = (
    <View className="flex-row items-center justify-center gap-2">
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? undefined : '#fff'} />
      ) : (
        <>
          {icon}
          <Text
            variant="body"
            weight="bold"
            tone={variant === 'outline' || variant === 'ghost' ? 'primary' : 'inverted'}
            className={`tracking-wide ${variant === 'destructive' ? 'text-destructive-foreground' : ''}`}
          >
            {label}
          </Text>
        </>
      )}
    </View>
  );

  const containerClass = `rounded-full items-center justify-center overflow-hidden ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${isDisabled ? 'opacity-50' : ''}`;

  const tint = shadowColor[variant];
  const shadowStyle = !isDisabled && tint ? coloredShadow(tint, 0.16, 9, 3, 3) : undefined;

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={8}
      style={[animatedStyle, shadowStyle, fullWidth ? { width: '100%' } : undefined]}
      onPressIn={(e) => {
        scale.value = withTiming(0.97, { duration: 100 });
        pressOverlay.value = withTiming(filled ? 0.12 : 0.06, { duration: 100 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: 150 });
        pressOverlay.value = withTiming(0, { duration: 150 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (!isDisabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          rest.onPress?.(e);
        }
      }}
    >
      {variant === 'cta' ? (
        <View className={containerClass} style={{ backgroundColor: terracotta[600] }}>
          {content}
          <Animated.View pointerEvents="none" className="absolute inset-0 bg-black" style={overlayStyle} />
        </View>
      ) : (
        <View
          className={`${containerClass} ${
            fillClass[variant] ??
            (variant === 'outline' ? 'bg-transparent border-[1.5px] border-border' : 'bg-transparent')
          }`}
        >
          {content}
          {filled ? <Animated.View pointerEvents="none" className="absolute inset-0 bg-black" style={overlayStyle} /> : null}
        </View>
      )}
    </AnimatedPressable>
  );
}
