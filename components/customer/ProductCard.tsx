import * as Haptics from 'expo-haptics';
import { Heart, Plus, Store } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { CatalogImage, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import type { Product } from '@/data/types';
import { categoryIcons } from '@/lib/categoryIcons';
import { formatCad } from '@/lib/format';
import { useCartStore } from '@/store/useCartStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { shadows } from '@/theme/shadows';
import { forest, mustard, neutral, terracotta } from '@/theme/tokens';

export interface ProductCardProps {
  product: Product;
  /** Exact pixel width from the grid. Omit only when the parent already constrains width. */
  width?: number;
  /** Lucide key from the product's category, for the image placeholder. */
  categoryIcon?: string;
  /** The shop it comes from — a grid mixes shops, and the cart holds only one. */
  vendorName?: string;
  onPress?: () => void;
  onAdd?: () => void;
  /** The shop is closed right now: the product can be looked at, not added. */
  closed?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Image occupies this share of the card width — keeps the card near-square on any device. */
const IMAGE_RATIO = 0.64;
/** At or under this, the card warns that it is nearly gone. */
const LOW_STOCK = 5;

/**
 * Grid card for Home / search results, following the reference: image block,
 * outline heart top-right, savings flag top-left, then name, price, and a round
 * add button.
 *
 * Height is content-driven on purpose — no `flex-1`. See the note in
 * ProductGrid: growing to fill a stretch-aligned row is what made these render
 * far taller than their content. Equal heights come from the content instead:
 * the name's two lines, the weight line and the struck-through price line are
 * all reserved whether or not they have anything to show.
 */
export function ProductCard({ product, width, categoryIcon, vendorName, onPress, onAdd, closed = false }: ProductCardProps) {
  const t = useT();
  const scale = useSharedValue(1);
  const isFavorite = useFavoritesStore((s) => s.productIds.includes(product.id));
  const toggleProduct = useFavoritesStore((s) => s.toggleProduct);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const soldOut = !product.isAvailable || product.stockQty <= 0;
  const lowStock = !soldOut && product.stockQty <= LOW_STOCK;
  // Once it is in the cart, the + becomes the quantity — the card itself says
  // the add worked, not only the cart bar.
  const inCart = useCartStore((s) => s.items.find((i) => i.productId === product.id)?.qty ?? 0);
  const discountPct =
    product.compareAtPriceCad && product.compareAtPriceCad > product.priceCad
      ? Math.round((1 - product.priceCad / product.compareAtPriceCad) * 100)
      : 0;
  const weight = product.nutrition?.weightG
    ? product.nutrition.weightG >= 1000
      ? `${(product.nutrition.weightG / 1000).toLocaleString('fr-CA')} kg`
      : `${product.nutrition.weightG} g`
    : null;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t('common.a11y.priced', { name: product.name, price: formatCad(product.priceCad) })}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.975, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 130 });
      }}
      style={[animatedStyle, shadows.card, width ? { width } : null]}
      className="rounded-[20px] bg-card p-3"
    >
      <View className="relative">
        <CatalogImage
          id={product.id}
          path={product.imageUrl}
          kind="product"
          icon={categoryIcon ? categoryIcons[categoryIcon] : undefined}
          radius={14}
          height={width ? Math.round(width * IMAGE_RATIO) : 112}
        />

        {discountPct > 0 ? (
          <View className="absolute left-1.5 top-1.5 rounded-full px-2 py-1" style={{ backgroundColor: terracotta[600] }}>
            <Text variant="caption" weight="bold" className="text-[11px] leading-[13px] text-white">
              −{discountPct} %
            </Text>
          </View>
        ) : null}

        {soldOut ? (
          <View className="absolute inset-0 rounded-[14px] items-center justify-center" style={{ backgroundColor: 'rgba(20,16,12,0.45)' }}>
            <View className="rounded-full bg-card px-3 py-1">
              <Text variant="caption" weight="bold" className="text-[12px]">
                {t('customer.productCard.soldOut')}
              </Text>
            </View>
          </View>
        ) : lowStock ? (
          <View className="absolute left-1.5 bottom-1.5 rounded-full px-2 py-1" style={{ backgroundColor: mustard[100] }}>
            <Text variant="caption" weight="bold" className="text-[11px] leading-[13px]" style={{ color: mustard[900] }}>
              {t('customer.productCard.lowStock', { count: product.stockQty })}
            </Text>
          </View>
        ) : null}

        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? t('customer.favorite.remove') : t('customer.favorite.add')}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleProduct(product.id);
          }}
          className="absolute right-1.5 top-1.5 w-8 h-8 items-center justify-center rounded-full bg-card/90"
        >
          <Heart
            size={17}
            color={isFavorite ? terracotta[600] : neutral[500]}
            fill={isFavorite ? terracotta[600] : 'transparent'}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      <View className="mt-2.5 gap-1">
        {vendorName ? (
          <View className="flex-row items-center gap-1">
            <Store size={11} color={neutral[500]} strokeWidth={2.2} />
            <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px] leading-[14px] flex-1">
              {vendorName}
            </Text>
          </View>
        ) : null}
        {/* Two lines, and the height reserved even for a short name, so every
            card in a row keeps its price on the same baseline. */}
        <Text variant="caption" weight="semibold" numberOfLines={2} className="text-[14px] leading-[18px] min-h-[36px]">
          {product.name}
        </Text>
        {/* Reserved even when empty, like the name's second line: a product with
            no weight would otherwise be a line shorter than its neighbours. */}
        <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px] leading-[14px] min-h-[14px]">
          {weight ?? ''}
        </Text>
      </View>

      <View className="mt-2 flex-row items-end justify-between gap-2">
        <View className="flex-1">
          {/* Stacked, not side by side: two prices in a row overflow the room
              beside the add button and wrap. The struck-through line keeps its
              height when there is no discount, so every card is the same height. */}
          <Text variant="caption" tone="muted" className="text-[11px] leading-[13px] min-h-[13px] line-through">
            {discountPct > 0 ? formatCad(product.compareAtPriceCad!) : ''}
          </Text>
          <Text
            variant="subtitle"
            weight="bold"
            numberOfLines={1}
            className="text-[17px] leading-[22px]"
            style={discountPct > 0 ? { color: terracotta[600] } : undefined}
          >
            {formatCad(product.priceCad)}
          </Text>
        </View>

        <Pressable
          hitSlop={6}
          disabled={soldOut || closed}
          accessibilityRole="button"
          accessibilityLabel={
            soldOut
              ? t('customer.misc.productOutOfStock')
              : closed
                ? t('customer.misc.shopClosed')
                : t('common.a11y.addToCart', { name: product.name })
          }
          accessibilityValue={inCart > 0 ? { text: t('customer.productCard.inCart', { count: inCart }) } : undefined}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAdd?.();
          }}
          className="w-9 h-9 items-center justify-center rounded-full"
          // Greyed out the same way for sold out and for a closed shop: either way it cannot be added now.
          style={{ backgroundColor: soldOut || closed ? neutral[200] : inCart > 0 ? forest[900] : forest[600] }}
        >
          {inCart > 0 && !soldOut && !closed ? (
            <Text key={inCart} variant="caption" weight="bold" className="text-[14px]" style={{ color: mustard[300] }}>
              {inCart}
            </Text>
          ) : (
            <Plus size={18} color={soldOut || closed ? neutral[400] : '#FFFFFF'} strokeWidth={2.5} />
          )}
        </Pressable>
      </View>
    </AnimatedPressable>
  );
}
