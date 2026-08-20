import { ChevronRight, MapPin, Store } from 'lucide-react-native';
import { MotiView } from 'moti';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import type { Order, Vendor } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import type { DeliveryProgress } from '@/hooks/useDeliveryProgress';
import { formatCad } from '@/lib/format';
import { courierActionLabel } from '@/lib/orderStatus';

export interface MissionSheetProps {
  order: Order;
  vendor: Vendor | null;
  progress: DeliveryProgress | null;
  onOpen: () => void;
  onAdvance: () => void;
  advancing?: boolean;
}

const PHASE_COPY: Record<DeliveryProgress['phase'], string> = {
  to_pickup: 'En route vers le commerce',
  awaiting_pickup: 'Sur place — récupérez la commande',
  to_dropoff: 'En route vers le client',
  delivered: 'Livrée',
};

/**
 * The run in progress, docked at the bottom of the map.
 *
 * Everything a courier needs while moving, and nothing else: which half of the
 * trip they are on, minutes left, where they are headed, and the one button that
 * advances it. Detail lives a tap away rather than on the driving surface.
 *
 * The ETA counts the *current* leg, not the whole run — someone on their way to
 * the shop wants to know when they arrive at the shop.
 */
export function MissionSheet({
  order,
  vendor,
  progress,
  onOpen,
  onAdvance,
  advancing = false,
}: MissionSheetProps) {
  const colors = useThemeColors();
  const actionLabel = courierActionLabel(order.status);
  const heading = progress ? PHASE_COPY[progress.phase] : 'Course acceptée';
  const towardsShop = progress?.phase === 'to_pickup' || progress?.phase === 'awaiting_pickup';

  return (
    <MotiView
      from={{ opacity: 0, translateY: 40 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 190, mass: 0.9 }}
      className="rounded-[24px] bg-card overflow-hidden"
      style={{
        shadowColor: '#0A2018',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 8,
      }}
    >
      <Pressable accessibilityRole="button" onPress={onOpen} className="p-5 gap-3">
        <View className="flex-row items-center gap-2">
          <Badge
            label={heading}
            tone={progress?.phase === 'awaiting_pickup' ? 'warning' : 'secondary'}
            size="sm"
          />
          <View className="flex-1" />
          <Text weight="bold" className="text-[15px]">
            {formatCad(order.delivery?.earningsCad ?? 0)}
          </Text>
          <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
        </View>

        <View className="flex-row items-center gap-3">
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{
              backgroundColor: towardsShop ? `${colors.primary}1A` : `${colors.secondary}1A`,
            }}
          >
            {towardsShop ? (
              <Store size={17} color={colors.primary} strokeWidth={2} />
            ) : (
              <MapPin size={17} color={colors.secondary} strokeWidth={2} />
            )}
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="caption" weight="bold" numberOfLines={1} className="text-[15px]">
              {towardsShop ? (vendor?.name ?? 'Commerce') : order.deliveryAddress.street}
            </Text>
            <Text variant="caption" tone="muted" className="text-[12px]">
              {towardsShop
                ? (vendor?.address.street ?? '')
                : `${order.deliveryAddress.city} ${order.deliveryAddress.postalCode}`}
            </Text>
          </View>
          {progress && progress.phase !== 'delivered' ? (
            <View className="items-end">
              <Text weight="bold" className="text-[19px]" style={{ fontVariant: ['tabular-nums'] }}>
                {progress.etaMin}
              </Text>
              <Text variant="caption" tone="muted" className="text-[11px]">
                min
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          disabled={advancing}
          onPress={onAdvance}
          // Full-width and tall: this is pressed with a thumb, often in a hurry,
          // sometimes in gloves.
          className="h-14 flex-row items-center justify-center border-t border-border active:bg-muted"
        >
          {advancing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text variant="caption" weight="bold" tone="primary" className="text-[14px]">
              {actionLabel}
            </Text>
          )}
        </Pressable>
      ) : null}
    </MotiView>
  );
}
