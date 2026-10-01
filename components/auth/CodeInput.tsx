import { MotiView } from 'moti';
import { forwardRef, useEffect } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';

export const CODE_LENGTH = 6;

/**
 * Six drawn cells over one real, invisible `TextInput`.
 *
 * One input rather than six keeps paste, iOS one-time-code autofill and
 * backspace native — six fields means re-implementing focus hopping, and
 * autofill only ever fills the first. `errorKey` changing plays the shake.
 */
export const CodeInput = forwardRef<
  TextInput,
  {
    value: string;
    onChange: (digits: string) => void;
    error?: boolean;
    errorKey?: number;
    focused: boolean;
    onFocusChange: (focused: boolean) => void;
    accessibilityLabel: string;
  }
>(function CodeInput({ value, onChange, error, errorKey = 0, focused, onFocusChange, accessibilityLabel }, ref) {
  const colors = useThemeColors();
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (!errorKey) return;
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withSpring(0, { damping: 8, stiffness: 400 })
    );
  }, [errorKey, shake]);

  const focus = () => (ref && typeof ref !== 'function' ? ref.current?.focus() : undefined);

  return (
    <Pressable onPress={focus} accessibilityLabel={accessibilityLabel}>
      <Animated.View className="flex-row justify-between gap-2" style={shakeStyle}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const char = value[i];
          const active = focused && i === Math.min(value.length, CODE_LENGTH - 1);
          const borderColor = error
            ? colors.destructive
            : active
              ? colors.primary
              : char
                ? colors.borderStrong
                : colors.border;
          return (
            <View
              key={i}
              className="flex-1 rounded-2xl bg-card items-center justify-center"
              style={{
                height: 62,
                maxWidth: 54,
                borderWidth: active ? 2 : 1.5,
                borderColor,
                shadowColor: colors.primary,
                shadowOpacity: active ? 0.16 : 0,
                shadowRadius: 9,
                shadowOffset: { width: 0, height: 3 },
              }}
            >
              {char ? (
                // Each digit pops in as it is typed — small, but it is what
                // makes the field feel like it is answering the keyboard.
                <MotiView
                  key={`${i}-${char}`}
                  from={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 260 }}
                >
                  <Text variant="title" weight="bold">
                    {char}
                  </Text>
                </MotiView>
              ) : active ? (
                <MotiView
                  from={{ opacity: 0.2 }}
                  animate={{ opacity: 1 }}
                  transition={{ type: 'timing', duration: 520, loop: true }}
                  style={{ width: 2, height: 24, borderRadius: 1, backgroundColor: colors.primary }}
                />
              ) : null}
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        caretHidden
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
    </Pressable>
  );
});
