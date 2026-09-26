import { useEffect, useState } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import { darkColors, lightColors } from '@/theme/colors';
import { neutral } from '@/theme/tokens';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  isPassword?: boolean;
  icon?: LucideIcon;
}

const FIELD_HEIGHT = 58;
/** Four lines under the floating label — enough to describe a problem without scrolling. */
const MULTILINE_HEIGHT = 122;

export function Input({
  label,
  error,
  helperText,
  required,
  isPassword,
  icon: Icon,
  secureTextEntry,
  value,
  defaultValue,
  onFocus,
  onBlur,
  onChangeText,
  multiline,
  placeholder: _placeholder,
  ...rest
}: InputProps) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(Boolean((value ?? defaultValue)?.toString().length));
  const [hidden, setHidden] = useState(!!isPassword);
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const labelFloat = useSharedValue(filled ? 1 : 0);
  const focusRing = useSharedValue(0);

  // Controlled resets (e.g. react-hook-form's reset()) should re-sync the floated label.
  useEffect(() => {
    const nextFilled = Boolean(value?.toString().length);
    setFilled(nextFilled);
    labelFloat.value = withTiming(nextFilled || focused ? 1 : 0, { duration: 160 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const labelStyle = useAnimatedStyle(() => ({
    top: interpolate(labelFloat.value, [0, 1], [19, 6]),
    transform: [{ scale: interpolate(labelFloat.value, [0, 1], [1, 0.78]) }],
  }));

  const labelColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      focusRing.value,
      [0, 1],
      [error ? colors.destructive : colors.mutedForeground, error ? colors.destructive : colors.primary]
    ),
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.destructive
      : interpolateColor(focusRing.value, [0, 1], [colors.borderStrong, colors.primary]),
    shadowOpacity: error ? 0 : interpolate(focusRing.value, [0, 1], [0, 0.14]),
  }));

  const iconColor = error ? colors.destructive : focused ? colors.primary : neutral[400];
  const fieldHeight = multiline ? MULTILINE_HEIGHT : FIELD_HEIGHT;

  return (
    <View className="gap-1.5">
      <Animated.View
        // A multiline field grows downward, so its contents align to the top —
        // centring them would float four lines of text in the middle of the box.
        className={`rounded-2xl bg-card border-[1.5px] px-4 flex-row ${multiline ? 'items-start' : 'items-center'}`}
        style={[{ height: fieldHeight }, SOFT_FOCUS_SHADOW, borderStyle]}
      >
        {Icon ? (
          <View className="mr-3">
            <Icon size={19} color={iconColor} strokeWidth={2} />
          </View>
        ) : null}

        <View className="flex-1" style={{ height: fieldHeight }}>
          <Animated.View pointerEvents="none" className="absolute left-0" style={[{ transformOrigin: 'left' }, labelStyle]}>
            <Animated.Text className="font-sans-medium text-base" style={labelColorStyle} numberOfLines={1}>
              {label}
              {required ? ' *' : ''}
            </Animated.Text>
          </Animated.View>

          <TextInput
            className="text-base text-foreground font-sans-medium"
            multiline={multiline}
            style={{
              height: fieldHeight,
              paddingTop: 22,
              paddingBottom: multiline ? 12 : 0,
              textAlignVertical: multiline ? 'top' : 'center',
            }}
            value={value}
            defaultValue={defaultValue}
            secureTextEntry={isPassword ? hidden : secureTextEntry}
            onFocus={(e) => {
              setFocused(true);
              focusRing.value = withTiming(1, { duration: 160 });
              labelFloat.value = withTiming(1, { duration: 160 });
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              focusRing.value = withTiming(0, { duration: 160 });
              labelFloat.value = withTiming(filled ? 1 : 0, { duration: 160 });
              onBlur?.(e);
            }}
            onChangeText={(text) => {
              const nextFilled = text.length > 0;
              setFilled(nextFilled);
              labelFloat.value = withTiming(nextFilled || focused ? 1 : 0, { duration: 160 });
              onChangeText?.(text);
            }}
            placeholder=""
            {...rest}
          />
        </View>

        {isPassword ? (
          <Pressable
            hitSlop={8}
            onPress={() => setHidden((h) => !h)}
            accessibilityLabel={t(hidden ? 'common.ui.showPassword' : 'common.ui.hidePassword')}
          >
            {hidden ? <EyeOff size={19} color={colors.mutedForeground} /> : <Eye size={19} color={colors.mutedForeground} />}
          </Pressable>
        ) : null}
      </Animated.View>

      {error ? (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="muted">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const SOFT_FOCUS_SHADOW = {
  shadowColor: '#246B47',
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: 10,
  elevation: 3,
};
