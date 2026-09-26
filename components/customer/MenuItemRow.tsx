import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { CatalogImage, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import type { Product } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { categoryIcons } from '@/lib/categoryIcons';
import { formatCad } from '@/lib/format';

export interface MenuItemRowProps {
  product: Product;
  /** Lucide key from the product's category, for the image placeholder. */
  categoryIcon?: string;
  onPress?: () => void;
  onAdd?: () => void;
}

const THUMB = 84;

/**
 * One dish on a restaurant's menu.
 *
 * A restaurant needs the description — "Poulet mariné, oignons confits, riz
 * blanc" is most of what a dish is, and a two-column grid tile has no line to
 * put it on. So restaurants get rows and groceries keep the grid: a bag of rice
 * is fully described by its name and price, and the grid shows twice as many of
 * them per screen.
 *
 * Laid out on the plain background with a hairline rule between items rather
 * than as cards, because a menu is a list of things to read, and ten stacked
 * card surfaces read as ten separate objects.
 */
export function MenuItemRow({ product, categoryIcon, onPress, onAdd }: MenuItemRowProps) {
  const t = useT();
  const colors = useThemeColors();
  const soldOut = !product.isAvailable;
  const Icon = categoryIcon ? categoryIcons[categoryIcon] : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        t('common.a11y.priced', { name: product.name, price: formatCad(product.priceCad) }) +
        (soldOut ? t('customer.misc.outOfStockSuffix') : '')
      }
      onPress={onPress}
      className="flex-row items-start gap-4 py-4"
      style={soldOut ? { opacity: 0.5 } : undefined}
    >
      <View className="flex-1 gap-1">
        <Text variant="caption" weight="bold" className="text-[15px] leading-[20px]" numberOfLines={2}>
          {product.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2} className="text-[13px] leading-[18px]">
          {product.description}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <Text variant="subtitle" weight="bold" className="text-[15px]">
            {formatCad(product.priceCad)}
          </Text>
          {product.compareAtPriceCad ? (
            <Text variant="caption" tone="muted" className="text-[13px] line-through">
              {formatCad(product.compareAtPriceCad)}
            </Text>
          ) : null}
        </View>
      </View>

      <View>
        <CatalogImage
          id={product.id}
          kind="product"
          icon={Icon}
          height={THUMB}
          width={THUMB}
          radius={14}
        />

        {soldOut ? (
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: 'rgba(12,10,8,0.55)' }}
          >
            <Text variant="caption" weight="bold" className="text-[11px] text-white">
              {t('customer.misc.outOfStock')}
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.a11y.addToCart', { name: product.name })}
            // The button is 32px so it does not crowd an 84px thumbnail; the
            // hitSlop is what actually makes it a 44pt target.
            hitSlop={8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAdd?.();
            }}
            className="absolute -bottom-1 -right-1 w-8 h-8 items-center justify-center rounded-full bg-primary"
          >
            <Plus size={17} color={colors.primaryForeground} strokeWidth={2.6} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
