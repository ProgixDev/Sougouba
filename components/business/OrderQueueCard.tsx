import { ChevronRight } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import type { Order } from '@/data/types';
import { formatCad, formatElapsed } from '@/lib/format';
import { advanceActionLabel, isActiveStatus, orderStatusMeta } from '@/lib/orderStatus';

export interface OrderQueueCardProps {
  order: Order;
  customerName: string;
  onPress?: () => void;
  /** Omitted on closed orders and on screens where advancing is not the point. */
  onAdvance?: () => void;
  advancing?: boolean;
}

/**
 * A ticket in the shop's queue.
 *
 * Three things a merchant needs before deciding anything: how long it has been
 * waiting, what has to come off the shelves, and what the next move is. The
 * previous row gave the order id and an item count, which is neither — so it
 * showed the id (`#g3_004`, meaningless to a shop) and hid the contents behind a
 * tap.
 *
 * The action is inline because advancing an order is the single most repeated
 * thing on this screen; making it a round trip through a detail view is what
 * turns a working queue into a browsing one. The card body still opens the
 * order for anything else.
 */
export function OrderQueueCard({
  order,
  customerName,
  onPress,
  onAdvance,
  advancing = false,
}: OrderQueueCardProps) {
  const colors = useThemeColors();
  const meta = orderStatusMeta[order.status];
  const actionLabel = advanceActionLabel(order.status);
  const showAction = Boolean(onAdvance) && isActiveStatus(order.status) && Boolean(actionLabel);

  const preview = order.items
    .map((item) => (item.qty > 1 ? `${item.name} ×${item.qty}` : item.name))
    .join(', ');

  return (
    <View className="rounded-[20px] bg-card overflow-hidden">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Commande de ${customerName}, ${meta.label}`}
        onPress={onPress}
        className="p-4 gap-2.5"
      >
        <View className="flex-row items-center gap-2">
          <Badge label={meta.label} tone={meta.tone} size="sm" />
          <Text variant="caption" tone="muted" className="text-[12px] flex-1">
            {formatElapsed(order.createdAt)}
          </Text>
          <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
        </View>

        <View className="flex-row items-baseline gap-3">
          <Text variant="subtitle" weight="bold" numberOfLines={1} className="flex-1 text-[17px]">
            {customerName}
          </Text>
          <Text weight="bold" className="text-[16px]">
            {formatCad(order.totalCad)}
          </Text>
        </View>

        <Text variant="caption" tone="muted" numberOfLines={2} className="text-[12px] leading-[17px]">
          {preview}
        </Text>
      </Pressable>

      {showAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel!}
          disabled={advancing}
          onPress={onAdvance}
          // A hairline instead of a gap: the action belongs to this ticket, and
          // a floating button would read as a second card.
          className="flex-row items-center justify-center gap-2 h-12 border-t border-border active:bg-muted"
        >
          {advancing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text variant="caption" weight="bold" tone="primary">
              {actionLabel}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
