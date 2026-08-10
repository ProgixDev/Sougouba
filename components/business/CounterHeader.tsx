import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useColorScheme } from '@/hooks/useColorScheme';
import { forest, semantic } from '@/theme/tokens';

export interface CounterHeaderProps {
  title: string;
  /** The trading line — what the shop's state is, or what happens next. */
  eyebrow?: string;
  tradingState?: 'open' | 'closed';
  /** Trailing control, aligned with the eyebrow row. */
  right?: ReactNode;
  children?: ReactNode;
}

/** Ivory and mint, fixed: the slab is dark in both themes, so these do not follow the scheme. */
export const onSlab = {
  text: '#F3EFE6',
  muted: forest[200],
  hairline: 'rgba(243, 239, 230, 0.14)',
  fill: 'rgba(243, 239, 230, 0.08)',
} as const;

/**
 * The header every merchant screen opens on.
 *
 * The customer app is daylight — ivory ground, mint gradient, photography. The
 * merchant app is the other side of the counter: a tool consulted in seconds
 * between customers, so its numbers sit on a deep forest slab where they read as
 * an instrument panel rather than as marketing. Same brand ramp, opposite end of
 * it, which is what tells a user at a glance which of the two apps they are in.
 *
 * The slab carries the screen's only strong surface. Everything below it stays
 * on plain background with quiet white cards — one deliberate depth cue, not
 * stacked ones.
 */
export function CounterHeader({ title, eyebrow, tradingState, right, children }: CounterHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  // Light mode wants maximum separation from the ivory page; dark mode needs the
  // slab to sit *above* a near-black forest background, so it lifts instead.
  const gradient =
    colorScheme === 'dark'
      ? ([forest[700], forest[900]] as const)
      : ([forest[800], forest[950]] as const);

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        paddingTop: insets.top + 10,
        paddingBottom: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
      }}
    >
      <View className="px-5 gap-4">
        <View className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            {eyebrow ? (
              <View className="flex-row items-center gap-1.5">
                {tradingState ? (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor:
                        tradingState === 'open' ? semantic.success.dark : forest[400],
                    }}
                  />
                ) : null}
                <Text
                  variant="caption"
                  weight="semibold"
                  numberOfLines={1}
                  style={{ color: onSlab.muted }}
                  className="text-[12px]"
                >
                  {eyebrow}
                </Text>
              </View>
            ) : null}
            <Text
              variant="title"
              weight="bold"
              numberOfLines={1}
              style={{ color: onSlab.text }}
              className="text-[25px] leading-[30px]"
            >
              {title}
            </Text>
          </View>
          {right}
        </View>

        {children}
      </View>
    </LinearGradient>
  );
}

/**
 * A headline figure on the slab.
 *
 * Label above value, not below: the merchant is scanning for a known quantity
 * ("what did I take today"), so the label is the thing being looked up and the
 * number is the answer.
 */
export function SlabMetric({
  label,
  value,
  hint,
  align = 'left',
}: {
  label: string;
  value: string;
  hint?: string;
  align?: 'left' | 'right';
}) {
  const alignment = align === 'right' ? 'items-end' : 'items-start';
  return (
    <View className={`gap-1 ${alignment}`}>
      <Text variant="label" style={{ color: onSlab.muted }} className="text-[10px]">
        {label}
      </Text>
      <Text
        variant="title"
        weight="bold"
        numberOfLines={1}
        style={{ color: onSlab.text }}
        className="text-[27px] leading-[31px]"
      >
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" style={{ color: onSlab.muted }} className="text-[11px]">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
