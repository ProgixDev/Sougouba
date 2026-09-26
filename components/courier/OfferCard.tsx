import * as Haptics from 'expo-haptics';
import { MapPin, Store } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Button, Text } from '@/components/ui';
import { useLocale } from '@/lib/i18n/useT';
import { useThemeColors } from '@/hooks/useColorScheme';
import { formatCad } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { OFFER_TIMEOUT_MS, offerRemainingMs, type DeliveryOffer } from '@/lib/dispatch';

export interface OfferCardProps {
  offer: DeliveryOffer;
  vendorName: string;
  /** Street line of the drop-off, so the courier knows the neighbourhood. */
  dropoffLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
}

const RING = 52;
const STROKE = 4;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A run, offered.
 *
 * The countdown is a ring rather than a number because it has to be readable at
 * a glance by someone who may be holding a phone at a red light — but the
 * seconds sit inside it, because "how long exactly" is a fair question when
 * money is attached.
 *
 * The three figures shown are the three a courier actually decides on: how far
 * to the shop (unpaid), how far the run is, and what it pays. The payout is
 * labelled as a minimum — the tip is not known yet and quoting a number that
 * later shrinks is worse than quoting the floor.
 */
export function OfferCard({
  offer,
  vendorName,
  dropoffLabel,
  onAccept,
  onDecline,
  busy = false,
}: OfferCardProps) {
  // Formats money here but renders no translated string of its own; this is
  // the subscription that re-runs those formatters on a language switch.
  useLocale();
  const colors = useThemeColors();
  const [remaining, setRemaining] = useState(() => offerRemainingMs(offer, Date.now()));

  useEffect(() => {
    // A new offer announces itself: this card can appear while the phone is in a
    // pocket, and the whole thing is over in thirty seconds.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [offer.id]);

  useEffect(() => {
    setRemaining(offerRemainingMs(offer, Date.now()));
    // 100 ms, not 1000: the ring is a continuous sweep and a one-second step
    // would tick like a clock hand.
    const id = setInterval(() => setRemaining(offerRemainingMs(offer, Date.now())), 100);
    return () => clearInterval(id);
  }, [offer]);

  const fraction = remaining / OFFER_TIMEOUT_MS;
  const seconds = Math.ceil(remaining / 1000);
  // Turns urgent in the last third rather than counting down in red the whole
  // time, which would make every offer read as a problem.
  const ringColor = fraction < 0.34 ? colors.destructive : colors.secondary;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 24 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 190, mass: 0.9 }}
      className="rounded-[24px] bg-card p-5 gap-4"
      style={{
        shadowColor: '#0A2018',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 8,
      }}
    >
      <View className="flex-row items-center gap-4">
        <View style={{ width: RING, height: RING }}>
          <Svg width={RING} height={RING}>
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={colors.border}
              strokeWidth={STROKE}
              fill="none"
            />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={ringColor}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              // Starts at twelve o'clock and empties clockwise, the way every
              // timer anyone has ever seen does.
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <View className="absolute inset-0 items-center justify-center">
            <Text weight="bold" className="text-[17px]" style={{ color: ringColor }}>
              {seconds}
            </Text>
          </View>
        </View>

        <View className="flex-1 gap-0.5">
          <Text variant="label" tone="muted" className="text-[10px]">
            Nouvelle course
          </Text>
          <Text variant="subtitle" weight="bold" numberOfLines={1} className="text-[19px]">
            {formatCad(offer.estimatedEarningsCad)}
            <Text variant="caption" tone="muted" className="text-[12px]">
              {' '}
              minimum
            </Text>
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mt-0.5">
            <Store size={15} color={colors.primary} strokeWidth={2} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="caption" weight="bold" numberOfLines={1}>
              {vendorName}
            </Text>
            <Text variant="caption" tone="muted" className="text-[12px]">
              {formatDistance(offer.distanceToPickupKm)} pour le ramassage
            </Text>
          </View>
        </View>

        <View className="flex-row items-start gap-3">
          <View className="w-8 h-8 rounded-full bg-secondary/10 items-center justify-center mt-0.5">
            <MapPin size={15} color={colors.secondary} strokeWidth={2} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="caption" weight="bold" numberOfLines={1}>
              {dropoffLabel}
            </Text>
            <Text variant="caption" tone="muted" className="text-[12px]">
              {formatDistance(offer.distanceToDropoffKm)} de livraison
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <Button label="Refuser" variant="ghost" size="md" fullWidth disabled={busy} onPress={onDecline} />
        </View>
        <View className="flex-[1.4]">
          <Button label="Accepter" variant="primary" size="md" fullWidth loading={busy} onPress={onAccept} />
        </View>
      </View>
    </MotiView>
  );
}
