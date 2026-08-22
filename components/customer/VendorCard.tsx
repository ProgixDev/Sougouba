import { Clock, Navigation, Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Badge, CatalogImage, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { MIN_DELIVERY_FEE_CAD, deliveryFeeFor } from '@/data/deliveryPricing';
import type { Vendor } from '@/data/types';
import { formatCad } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { shopDay, shopStatusLine } from '@/lib/shopHours';
import { shadows } from '@/theme/shadows';
import { mustard } from '@/theme/tokens';

export type VendorCardLayout = 'carousel' | 'row';

export interface VendorCardProps {
  vendor: Vendor;
  onPress?: () => void;
  /**
   * `carousel` is the fixed-width tile on Home; `row` is the full-width entry in
   * a vertical's shop list. Same card, two proportions — a second component
   * would drift from this one the first time the meta line changed.
   */
  layout?: VendorCardLayout;
  /** Fixed width for the horizontal carousel on Home; omit to fill the parent. */
  width?: number;
  /** Straight-line distance from the shopper's delivery address, in km. */
  distanceKm?: number;
}

const COVER_HEIGHT: Record<VendorCardLayout, number> = { carousel: 104, row: 148 };

/** Shop card: cover image, name, what it sells, and what it costs to get here. */
export function VendorCard({
  vendor,
  onPress,
  layout = 'carousel',
  width,
  distanceKm,
}: VendorCardProps) {
  const colors = useThemeColors();
  const row = layout === 'row';
  const day = shopDay(vendor);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${vendor.name}, ${vendor.specialtyFr}${day.isOpen ? '' : ', fermé'}`}
      onPress={onPress}
      style={[shadows.card, width ? { width } : null]}
      className="rounded-[20px] bg-card p-3"
    >
      <View>
        <CatalogImage id={vendor.id} kind="vendor" radius={14} height={COVER_HEIGHT[layout]} />

        {/* A closed shop stays in the list — hiding it answers "where did they
            go?" with nothing — but says so over its own photograph rather than
            through a dimmed card the shopper has to interpret. */}
        {day.isOpen ? null : (
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: 'rgba(12,10,8,0.55)' }}
          >
            <Text variant="caption" weight="bold" className="text-[13px] text-white">
              {shopStatusLine(day)}
            </Text>
          </View>
        )}
      </View>

      <View className="mt-3 gap-1.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            variant={row ? 'subtitle' : 'caption'}
            weight="bold"
            numberOfLines={1}
            className={row ? 'flex-1 text-[17px] leading-[22px]' : 'flex-1'}
          >
            {vendor.name}
          </Text>
          <View className="flex-row items-center gap-1">
            <Star size={13} color={mustard[500]} fill={mustard[500]} strokeWidth={0} />
            <Text variant="caption" weight="semibold" className="text-[12px]">
              {vendor.rating.toFixed(1)}
            </Text>
          </View>
        </View>

        {/* What the shop sells, then where it is. The CDC asks the list for a
            "type de cuisine"; a neighbourhood alone never answered that. */}
        <Text variant="caption" tone="muted" numberOfLines={1} className="text-[12px]">
          {vendor.specialtyFr} · {vendor.neighborhood}
        </Text>

        <View className="flex-row items-center gap-2 mt-0.5">
          <Meta icon={Clock} color={colors.mutedForeground} label={`${vendor.deliveryEtaMin} min`} />
          {distanceKm !== undefined ? (
            <Meta
              icon={Navigation}
              color={colors.mutedForeground}
              label={formatDistance(distanceKm)}
            />
          ) : null}
          {/* The shop no longer sets this. When we know where the shopper is
              we quote the real fee; otherwise the floor of the grid, which is a
              promise the grid always keeps. */}
          <Text variant="caption" tone="muted" className="text-[12px]">
            {distanceKm === undefined
              ? `dès ${formatCad(MIN_DELIVERY_FEE_CAD)}`
              : formatCad(deliveryFeeFor(distanceKm))}
          </Text>
          {vendor.isHalalCertified ? (
            <View className="ml-auto">
              <Badge label="Halal" tone="success" size="sm" />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function Meta({
  icon: Icon,
  color,
  label,
}: {
  icon: typeof Clock;
  color: string;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon size={12} color={color} strokeWidth={2} />
      <Text variant="caption" tone="muted" className="text-[12px]">
        {label}
      </Text>
    </View>
  );
}
