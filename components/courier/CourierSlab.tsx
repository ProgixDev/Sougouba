import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useColorScheme } from '@/hooks/useColorScheme';
import { mustard, neutral } from '@/theme/tokens';

/**
 * Ink and signal, fixed in both themes: the slab is dark either way, so these
 * do not follow the colour scheme. Mustard is the courier's accent everywhere
 * else in the app — the map puck, the run marker — and it carries here so the
 * three roles never share a headline surface.
 */
export const onCourierSlab = {
  text: '#F6F2E9',
  // neutral[300], not [400]. The glow below lightens the top-right of the slab
  // by roughly 18 % of mustard, and against *that* corner — not the flat
  // gradient — [400] fell under AA. `scripts/verify-contrast.ts` checks the
  // blended colour rather than the base one for exactly this reason.
  muted: neutral[300],
  accent: mustard[300],
  hairline: 'rgba(246, 242, 233, 0.13)',
  fill: 'rgba(246, 242, 233, 0.09)',
} as const;

export interface CourierSlabProps {
  title: string;
  /** The line above the title — what this screen is a reading of. */
  eyebrow?: string;
  /** Trailing control, aligned with the title row. */
  right?: ReactNode;
  children?: ReactNode;
}

/**
 * The header the courier's non-map screens open on.
 *
 * Each role in this app is recognisable before a word is read. The customer app
 * is daylight — ivory ground, mint gradient, photography. The merchant app is a
 * deep forest slab, an instrument consulted between customers. The courier app
 * is the cab at night: graphite, with the one warm signal (mustard) that already
 * marks them on every map in the product.
 *
 * Structurally this is `components/business/CounterHeader.tsx` — same rounded
 * shelf, same eyebrow/title/children stack — because the two solve the same
 * problem and a second layout idea would be a second thing to maintain. What
 * differs is the palette, which is the whole point: a courier glancing at their
 * phone should never wonder which app they are in.
 *
 * The glow is a second gradient over the first rather than a flat fill. A plain
 * dark rectangle behind a large number reads as a placeholder; the light falling
 * off the top-right corner is what makes it read as a surface with a lamp over
 * it — and it costs one more composited layer, not a blur.
 */
export function CourierSlab({ title, eyebrow, right, children }: CourierSlabProps) {
  return (
    <CourierSlabSurface>
      <View className="px-5 gap-4">
        <View className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            {eyebrow ? (
              <Text
                variant="label"
                numberOfLines={1}
                style={{ color: onCourierSlab.accent }}
                className="text-[10px]"
              >
                {eyebrow}
              </Text>
            ) : null}
            <Text
              variant="title"
              weight="bold"
              numberOfLines={1}
              style={{ color: onCourierSlab.text }}
              className="text-[25px] leading-[30px]"
            >
              {title}
            </Text>
          </View>
          {right}
        </View>

        {children}
      </View>
    </CourierSlabSurface>
  );
}

/**
 * Opacity of the corner glow, as the hex suffix the gradient takes.
 * Mirrored in `scripts/verify-contrast.ts`, which blends it onto the slab
 * before auditing anything drawn on top — keep the two in step.
 */
const GLOW_ALPHA_HEX = '26';

export interface CourierSlabSurfaceProps {
  /** Extra space above the content, on top of the safe-area inset. */
  topPadding?: number;
  bottomPadding?: number;
  children: ReactNode;
}

/**
 * The slab itself, without any opinion about what sits on it.
 *
 * Split out because the profile screen needs the same surface at a different
 * height with an avatar breaking its bottom edge, and a second copy of the
 * gradient pair is a second place for the palette to drift.
 *
 * It also owns the status bar. The slab runs under it, and iOS draws the clock
 * in whatever the app last asked for — which on a light theme is dark glyphs,
 * invisible against graphite. Set on focus and restored on blur rather than
 * declaratively, because the tab screens stay mounted after they are left: a
 * mounted `<StatusBar>` would keep forcing light glyphs over the Missions map,
 * where the surface at the top is a pale tile and a glass header.
 */
export function CourierSlabSurface({
  topPadding = 10,
  bottomPadding = 20,
  children,
}: CourierSlabSurfaceProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content', true);
      return () => {
        StatusBar.setBarStyle(colorScheme === 'dark' ? 'light-content' : 'dark-content', true);
      };
    }, [colorScheme])
  );

  return (
    <View
      style={{
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={[neutral[900], neutral[950]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ paddingTop: insets.top + topPadding, paddingBottom: bottomPadding }}
      >
        {/* The lamp: a warm rim on the top-right corner, not a wash over the
            whole slab. The first attempt ran mustard at 18 % from corner to
            corner and turned graphite into mud — a brown header with the
            figures sitting in it, which is the opposite of a lit surface. It
            falls off inside the top-right quarter now, so the corner glows and
            the type below it stays on near-black.
            `scripts/verify-contrast.ts` audits the slab against this corner
            blended in, not against the flat gradient. */}
        <LinearGradient
          colors={[`${mustard[400]}${GLOW_ALPHA_HEX}`, `${mustard[600]}00`]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.45, y: 0.55 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        />
        {children}
      </LinearGradient>
    </View>
  );
}

export interface SlabFigureProps {
  label: string;
  value: string;
  hint?: string;
  /** The one figure the screen exists to answer. Sets it in the display face at hero size. */
  hero?: boolean;
  align?: 'left' | 'right';
}

/**
 * A number on the slab.
 *
 * Label above value: the courier is scanning for a known quantity ("what have I
 * made"), so the label is the lookup and the number is the answer. Tabular
 * figures throughout — a total that shifts sideways as it ticks past a digit
 * boundary is the cheapest way to make a payout screen feel unfinished.
 */
export function SlabFigure({ label, value, hint, hero = false, align = 'left' }: SlabFigureProps) {
  return (
    <View className={`gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <Text variant="label" style={{ color: onCourierSlab.muted }} className="text-[10px]">
        {label}
      </Text>
      <Text
        variant="title"
        weight="bold"
        numberOfLines={1}
        style={{ color: onCourierSlab.text, fontVariant: ['tabular-nums'] }}
        className={hero ? 'text-[42px] leading-[48px]' : 'text-[22px] leading-[26px]'}
      >
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" style={{ color: onCourierSlab.muted }} className="text-[12px]">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface SlabSegmentedProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}

/**
 * The range control, on the slab with the figures it governs.
 *
 * On the slab rather than under it for the reason the merchant Analytique screen
 * gives: a control sitting below the headline number leaves that number
 * unexplained for the moment it takes to find the control. The selected segment
 * is filled ivory with dark text — a contrast inversion rather than a tint,
 * because a tinted "selected" state on an already-dark surface is the first
 * thing to disappear in daylight on a bike mount.
 */
export function SlabSegmented<T extends string>({
  options,
  value,
  onChange,
}: SlabSegmentedProps<T>) {
  return (
    <View
      className="flex-row self-start rounded-full p-1"
      style={{ backgroundColor: onCourierSlab.fill }}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            // 36pt tall inside a 44pt row of padding — the slab's own gap
            // carries the rest of the touch target.
            className="px-4 h-9 items-center justify-center rounded-full"
            style={selected ? { backgroundColor: onCourierSlab.text } : undefined}
          >
            <Text
              variant="caption"
              weight="bold"
              className="text-[12px]"
              style={{ color: selected ? neutral[900] : onCourierSlab.muted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
