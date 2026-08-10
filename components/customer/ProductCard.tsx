import * as Haptics from 'expo-haptics';
import { Heart, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { CatalogImage, Text } from '@/components/ui';
import type { Product } from '@/data/types';
import { categoryIcons } from '@/lib/categoryIcons';
import { formatCad } from '@/lib/format';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { shadows } from '@/theme/shadows';
import { neutral, terracotta } from '@/theme/tokens';

export interface ProductCardProps {
  product: Product;
  /** Exact pixel width from the grid. Omit only when the parent already constrains width. */
  width?: number;
  /** Lucide key from the product's category, for the image placeholder. */
  categoryIcon?: string;
  onPress?: () => void;
  onAdd?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Image occupies this share of the card width — keeps the card near-square on any device. */
const IMAGE_RATIO = 0.64;

/**
 * Grid card for Home / search results, following the reference: image block,
 * outline heart top-right, savings flag top-left, then name, price, and a round
 * add button.
 *
 * Height is content-driven on purpose — no `flex-1`. See the note in
 * ProductGrid: growing to fill a stretch-aligned row is what made these render
 * far taller than their content.
 */
export function ProductCard({ product, width, categoryIcon, onPress, onAdd }: ProductCardProps) {
  const scale = useSharedValue(1);
  const isFavorite = useFavoritesStore((s) => s.productIds.includes(product.id));
  const toggleProduct = useFavoritesStore((s) => s.toggleProduct);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const soldOut = !product.isAvailable;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatCad(product.priceCad)}`}
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
          kind="product"
          icon={categoryIcon ? categoryIcons[categoryIcon] : undefined}
          radius={14}
          height={width ? Math.round(width * IMAGE_RATIO) : 112}
        />

        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
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

      <View className="mt-2.5 flex-row items-end justify-between gap-2">
        <View className="flex-1">
          <Text variant="caption" weight="medium" numberOfLines={1}>
            {product.name}
          </Text>
          {/* Single price only. Two prices side by side overflow the ~106px left
              after the add button and wrap onto a second line, which stretches
              every card in the row. The struck-through original lives on the
              product detail screen, where there is room for it. */}
          <Text
            variant="subtitle"
            weight="bold"
            numberOfLines={1}
            className="text-[17px] leading-[22px]"
          >
            {formatCad(product.priceCad)}
          </Text>
        </View>

        <Pressable
          hitSlop={6}
          disabled={soldOut}
          accessibilityRole="button"
          accessibilityLabel={soldOut ? 'Produit épuisé' : `Ajouter ${product.name} au panier`}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAdd?.();
          }}
          className={`w-9 h-9 items-center justify-center rounded-full ${
            soldOut ? 'bg-muted' : 'bg-primary'
          }`}
        >
          <Plus size={18} color={soldOut ? neutral[400] : '#FFFFFF'} strokeWidth={2.5} />
        </Pressable>
      </View>
    </AnimatedPressable>
  );
}
