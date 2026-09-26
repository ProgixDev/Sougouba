import { Bike, ChevronRight, Clock3 } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import type { Order } from '@/data/types';
import { formatCad, formatElapsed } from '@/lib/format';
import {
  advanceActionKey,
  isActiveStatus,
  nextStatusFor,
  orderStatusKey,
  orderStatusTone,
} from '@/lib/orderStatus';

export interface OrderQueueCardProps {
  order: Order;
  customerName: string;
  onPress?: () => void;
  /** Omitted on closed orders and on screens where advancing is not the point. */
  onAdvance?: () => void;
  advancing?: boolean;
  /** Resolved by the caller when the run has been accepted. */
  courierName?: string;
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
  courierName,
}: OrderQueueCardProps) {
  const t = useT();
  const colors = useThemeColors();
  const statusLabel = t(orderStatusKey(order.status));
  // Only what the shop can actually do. At `ready` the queue row shows the
  // waiting line below instead of a button nobody behind the counter can honour.
  const actionKey = nextStatusFor(order.status, 'merchant') ? advanceActionKey(order.status) : null;
  const actionLabel = actionKey ? t(actionKey) : null;
  const showAction = Boolean(onAdvance) && isActiveStatus(order.status) && Boolean(actionLabel);
  // The counter's half of the hand-off. Between packing the bag and the courier
  // driving off there is a real wait, and a ticket that simply loses its button
  // reads as a ticket that broke.
  const handoff =
    !showAction && isActiveStatus(order.status) && order.status !== 'pending'
      ? order.delivery
        ? {
            icon: Bike,
            label: courierName
              ? t('business.orderQueue.courierEnRoute', { name: courierName })
              : t('business.orderQueue.courierOnTheWay'),
          }
        : order.status === 'ready'
          ? { icon: Clock3, label: t('business.queue.awaitingCourier') }
          : null
      : null;

  const preview = order.items
    .map((item) =>
      item.qty > 1 ? t('business.orderQueue.itemWithQty', { name: item.name, qty: item.qty }) : item.name
    )
    .join(t('common.listSeparator'));

  return (
    <View className="rounded-[20px] bg-card overflow-hidden">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('business.orderQueue.a11y', { customer: customerName, status: statusLabel })}
        onPress={onPress}
        className="p-4 gap-2.5"
      >
        <View className="flex-row items-center gap-2">
          <Badge label={statusLabel} tone={orderStatusTone[order.status]} size="sm" />
          {/* An unanswered complaint outranks the status: it is the reason to
              open this ticket ahead of the others. */}
          {order.dispute && order.dispute.status !== 'answered' ? (
            <Badge label="Litige" tone="destructive" size="sm" />
          ) : null}
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

      {handoff ? (
        // Same geometry as the action row so the card keeps one rhythm whether
        // the merchant has a move to make or is waiting on someone else.
        <View className="flex-row items-center justify-center gap-2 h-12 border-t border-border">
          <handoff.icon size={14} color={colors.mutedForeground} strokeWidth={2} />
          <Text variant="caption" tone="muted" className="text-[12px]">
            {handoff.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
