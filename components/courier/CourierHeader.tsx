import { BlurView } from 'expo-blur';
import { Power } from 'lucide-react-native';
import { MotiView } from 'moti';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { formatCad } from '@/lib/format';
import { semantic } from '@/theme/tokens';

const RADIUS = 22;

export interface CourierHeaderProps {
  online: boolean;
  onToggle: () => void;
  earningsTodayCad: number;
  runsToday: number;
}

/**
 * The courier's status bar, floating over the map.
 *
 * Map-first means the map owns the screen, so this is glass over it rather than
 * the solid forest slab the merchant side uses (`CounterHeader`). Same job —
 * name the state, carry today's number — different substrate, because there is
 * something moving underneath that is worth seeing.
 *
 * Blur *plus* a card wash, the same construction as `TabBarBackground` and for
 * the same reason stated there: the blur alone is too transparent for label
 * contrast over busy content, and a map is the busiest content in the app. Raw
 * `GlassSurface` here rendered the figures over whatever the tiles happened to
 * be, which on a dark stretch of map meant dark text on dark ground.
 *
 * The online toggle is the largest target here on purpose: it is the one control
 * a courier reaches for without looking.
 */
export function CourierHeader({
  online,
  onToggle,
  earningsTodayCad,
  runsToday,
}: CourierHeaderProps) {
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  return (
    <View style={{ paddingTop: insets.top + 8 }} className="px-4">
      {/* The radius is repeated on the blur and the wash rather than left to
          the parent's `overflow-hidden`: iOS draws `UIVisualEffectView` outside
          an ancestor's rounded clip, which leaves a dark crescent in the
          corners over a light map. */}
      <View className="rounded-[22px] overflow-hidden" style={{ borderRadius: RADIUS }}>
        <BlurView
          intensity={isDark ? 40 : 55}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.card, opacity: isDark ? 0.72 : 0.78, borderRadius: RADIUS },
          ]}
        />
        <View className="flex-row items-center gap-3 p-3">
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: online }}
            accessibilityLabel={online ? 'Passer hors ligne' : 'Passer en ligne'}
            onPress={onToggle}
            className="flex-row items-center gap-2.5 rounded-full px-3.5 h-11"
            style={{ backgroundColor: online ? semantic.success.light : colors.muted }}
          >
            <Power size={16} color={online ? '#FFFFFF' : colors.mutedForeground} strokeWidth={2.4} />
            <Text
              variant="caption"
              weight="bold"
              className="text-[13px]"
              style={{ color: online ? '#FFFFFF' : colors.mutedForeground }}
            >
              {online ? 'En ligne' : 'Hors ligne'}
            </Text>
            {online ? (
              // A slow pulse, not a blink: it says "listening" without
              // demanding attention every second.
              <MotiView
                from={{ opacity: 0.35, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'timing', duration: 900, loop: true }}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: '#FFFFFF' }}
              />
            ) : null}
          </Pressable>

          <View className="flex-1 items-end gap-0.5 pr-1">
            <Text weight="bold" className="text-[17px]" style={{ fontVariant: ['tabular-nums'] }}>
              {formatCad(earningsTodayCad)}
            </Text>
            <Text variant="caption" tone="muted" className="text-[11px]">
              {runsToday === 0
                ? 'aucune course aujourd’hui'
                : runsToday === 1
                  ? '1 course aujourd’hui'
                  : `${runsToday} courses aujourd’hui`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
