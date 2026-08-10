import { Clock, Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Badge, CatalogImage, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import type { Vendor } from '@/data/types';
import { formatCad } from '@/lib/format';
import { shadows } from '@/theme/shadows';
import { mustard } from '@/theme/tokens';

export interface VendorCardProps {
  vendor: Vendor;
  onPress?: () => void;
  /** Fixed width for the horizontal carousel on Home; omit to fill the parent. */
  width?: number;
}

/** Shop card: cover image, name, rating, ETA and delivery fee. */
export function VendorCard({ vendor, onPress, width }: VendorCardProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${vendor.name}, ${vendor.neighborhood}`}
      onPress={onPress}
      style={[shadows.card, width ? { width } : null]}
      className="rounded-[20px] bg-card p-3"
    >
      <CatalogImage id={vendor.id} kind="vendor" radius={14} height={104} />

      <View className="mt-3 gap-1.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="caption" weight="bold" numberOfLines={1} className="flex-1">
            {vendor.name}
          </Text>
          <View className="flex-row items-center gap-1">
            <Star size={13} color={mustard[500]} fill={mustard[500]} strokeWidth={0} />
            <Text variant="caption" weight="semibold" className="text-[12px]">
              {vendor.rating.toFixed(1)}
            </Text>
          </View>
        </View>

        <Text variant="caption" tone="muted" numberOfLines={1} className="text-[12px]">
          {vendor.neighborhood} · {vendor.city}
        </Text>

        <View className="flex-row items-center gap-2 mt-0.5">
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={colors.mutedForeground} strokeWidth={2} />
            <Text variant="caption" tone="muted" className="text-[12px]">
              {vendor.deliveryEtaMin} min
            </Text>
          </View>
          <Text variant="caption" tone="muted" className="text-[12px]">
            ·
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px]">
            {formatCad(vendor.deliveryFeeCad)}
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
