import { ChevronRight, CornerDownRight, Coins, Route } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import type { Order } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { formatCad, formatTime } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { mustard } from '@/theme/tokens';


export interface RunRowProps {
  order: Order;
  vendorName?: string;
  /** First run of its day — nothing above the dot. */
  first?: boolean;
  /** Last run of its day — nothing below it. */
  last?: boolean;
  onPress?: () => void;
}

/** Left rail: the clock column plus the connector. Fixed, so every card starts on the same line. */
const RAIL_WIDTH = 58;
const DOT = 9;
/** Vertical centre of the dot, measured from the top of the row — where the connector starts and ends. */
const DOT_TOP = 26;

/**
 * One finished run, in the day it belongs to.
 *
 * Two columns, not one card. The rail on the left carries the time and a
 * connector that threads every run of a shift together — which is the thing a
 * flat list of cards could never show: that these happened in sequence, one
 * evening, one after another. The card on the right carries the run itself.
 *
 * Inside the card the payout leads, because that is what a courier scans a
 * history for. Everything else — where from, where to, how far, what was
 * tipped — is the context that makes the number make sense, and it is set below
 * it at a weight that does not compete.
 *
 * The date is deliberately absent: the day header above already said it, and
 * repeating it on every row is the noise that made the previous version read as
 * a log file.
 */
export function RunRow({ order, vendorName, first = false, last = false, onPress }: RunRowProps) {
  const colors = useThemeColors();
  const delivery = order.delivery;
  const at = delivery?.deliveredAt ?? order.createdAt;
  const tipped = (delivery?.tipCad ?? 0) > 0;

  return (
    <View className="flex-row">
      <View style={{ width: RAIL_WIDTH }} className="items-center">
        {/* The connector runs the full height of the row behind the dot, cut
            at the ends of the day. Absolute rather than a flex sibling so the
            card's height drives it and the two never disagree.
            A day with a single run draws none of it: a stub of line hanging off
            one dot reads as a rendering fault, not as a short shift. */}
        {first && last ? null : (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 1.5,
              // DOT_TOP is where the dot's centre lands: the clock line plus its
              // top padding plus the 6pt gap plus half the dot.
              top: first ? DOT_TOP : 0,
              bottom: last ? undefined : 0,
              height: last ? DOT_TOP : undefined,
              backgroundColor: colors.border,
            }}
          />
        )}
        <Text
          variant="caption"
          tone="muted"
          className="text-[11px] pt-1"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatTime(at)}
        </Text>
        <View
          style={{
            marginTop: 6,
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            backgroundColor: mustard[500],
            // Ringed in the page colour so the connector passes behind it
            // rather than through it.
            borderWidth: 2.5,
            borderColor: colors.background,
          }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Course chez ${vendorName ?? 'un commerce'}, ${formatCad(delivery?.earningsCad ?? 0)}`}
        onPress={onPress}
        className="flex-1 rounded-[18px] bg-card p-3.5 mb-2.5 gap-2 active:opacity-80"
      >
        <View className="flex-row items-baseline gap-3">
          <Text variant="subtitle" weight="bold" numberOfLines={1} className="flex-1 text-[15px]">
            {vendorName ?? 'Commerce'}
          </Text>
          <Text
            weight="bold"
            className="text-[16px]"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatCad(delivery?.earningsCad ?? 0)}
          </Text>
          <ChevronRight size={15} color={colors.mutedForeground} strokeWidth={2} />
        </View>

        <View className="flex-row items-center gap-1.5">
          <CornerDownRight size={12} color={colors.mutedForeground} strokeWidth={2} />
          <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1 text-[12px]">
            {order.deliveryAddress.street}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5 flex-wrap">
          {delivery ? (
            <Meta icon={Route} label={formatDistance(delivery.distanceKm)} tint={colors.mutedForeground} />
          ) : null}
          {tipped ? (
            // Tips get their own marker rather than a line of text: they are the
            // part of a payout the platform does not set, and a courier looking
            // back at a good night is looking for these.
            //
            // The emphasis is weight, not colour. Mustard is the courier's
            // accent, but at caption size on a white card it does not reach AA —
            // so the accent stays on the icon (which only needs 3:1) and the
            // amount is set in the foreground colour at semibold. That also
            // satisfies the rule the whole app follows: never carry meaning in
            // colour alone.
            <Meta
              icon={Coins}
              label={`${formatCad(delivery!.tipCad)} de pourboire`}
              tint={colors.accent}
              emphasis
            />
          ) : null}
          <View className="flex-1" />
          {order.courierIssue ? <Badge label="Signalé" tone="warning" size="sm" /> : null}
        </View>
      </Pressable>
    </View>
  );
}

function Meta({
  icon: Icon,
  label,
  tint,
  emphasis = false,
}: {
  icon: typeof Route;
  label: string;
  /** Icon colour. Text is never tinted — see the note at the call site. */
  tint: string;
  emphasis?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon size={12} color={tint} strokeWidth={2} />
      <Text
        variant="caption"
        weight={emphasis ? 'semibold' : 'regular'}
        tone={emphasis ? 'default' : 'muted'}
        className="text-[11px]"
      >
        {label}
      </Text>
    </View>
  );
}
