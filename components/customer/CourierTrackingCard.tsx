import { Bike, Car, MessageSquare, Motorbike, Phone, Star } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import type { Courier, VehicleType } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import type { DeliveryPhase } from '@/hooks/useDeliveryProgress';
import { mustard } from '@/theme/tokens';

export interface CourierTrackingCardProps {
  courier: Courier;
  phase: DeliveryPhase;
  etaMin: number;
  /** The code the shopper reads out at the door. */
  pin: string;
}

const VEHICLE_ICONS: Record<VehicleType, typeof Bike> = {
  bike: Bike,
  scooter: Motorbike,
  car: Car,
};

const PHASE_COPY: Record<DeliveryPhase, string> = {
  to_pickup: 'récupère votre commande',
  awaiting_pickup: 'est au commerce',
  to_dropoff: 'est en route vers vous',
  delivered: 'a livré votre commande',
};

/**
 * Who is bringing the order, and when.
 *
 * A name and a face, not "votre livreur" — someone is about to knock on the
 * door, and a shopper who knows who to expect is a shopper who opens it.
 *
 * The delivery code sits here rather than being buried in the receipt: it is
 * needed at exactly the moment this card is on screen, and hunting for it while
 * someone waits outside is the failure this whole surface exists to prevent.
 */
export function CourierTrackingCard({ courier, phase, etaMin, pin }: CourierTrackingCardProps) {
  const colors = useThemeColors();
  const VehicleIcon = VEHICLE_ICONS[courier.vehicle];
  const rated = courier.deliveryCount > 0 && courier.rating > 0;
  const arrived = phase === 'delivered';

  return (
    <View className="rounded-[20px] bg-card p-4 gap-4">
      <View className="flex-row items-center gap-3.5">
        <Avatar uri={courier.photoUrl} fullName={courier.fullName} size={52} />

        <View className="flex-1 gap-1">
          <Text variant="caption" weight="bold" className="text-[15px]" numberOfLines={1}>
            {courier.fullName}
          </Text>
          <View className="flex-row items-center gap-2">
            {rated ? (
              <View className="flex-row items-center gap-1">
                <Star size={12} color={mustard[500]} fill={mustard[500]} strokeWidth={0} />
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {courier.rating.toFixed(1).replace('.', ',')}
                </Text>
              </View>
            ) : null}
            <View className="flex-row items-center gap-1">
              <VehicleIcon size={12} color={colors.mutedForeground} strokeWidth={2} />
              <Text variant="caption" tone="muted" className="text-[12px]" numberOfLines={1}>
                {PHASE_COPY[phase]}
              </Text>
            </View>
          </View>
        </View>

        {!arrived ? (
          <View className="items-end">
            <Text weight="bold" className="text-[22px]" style={{ fontVariant: ['tabular-nums'] }}>
              {etaMin}
            </Text>
            <Text variant="caption" tone="muted" className="text-[11px]">
              min
            </Text>
          </View>
        ) : null}
      </View>

      {!arrived ? (
        <View className="flex-row gap-2.5">
          <ContactButton
            icon={Phone}
            label="Appeler"
            onPress={() => Linking.openURL(`tel:${courier.phone.replace(/\s/g, '')}`)}
          />
          <ContactButton
            icon={MessageSquare}
            label="Message"
            onPress={() => Linking.openURL(`sms:${courier.phone.replace(/\s/g, '')}`)}
          />
        </View>
      ) : null}

      <View className="rounded-2xl bg-muted p-3.5 gap-1">
        <Text variant="label" tone="muted" className="text-[10px]">
          Code de livraison
        </Text>
        <Text
          weight="bold"
          className="text-[24px] tracking-[6px]"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {pin}
        </Text>
        <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
          Donnez ce code à {courier.fullName.split(' ')[0]} à la remise de votre commande.
        </Text>
      </View>
    </View>
  );
}

function ContactButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Phone;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-1 h-11 rounded-full border border-border flex-row items-center justify-center gap-2 active:bg-muted"
    >
      <Icon size={15} color={colors.foreground} strokeWidth={2} />
      <Text variant="caption" weight="bold" className="text-[13px]">
        {label}
      </Text>
    </Pressable>
  );
}
