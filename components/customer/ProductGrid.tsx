import { useWindowDimensions, View } from 'react-native';

import { Reveal, SkeletonCard } from '@/components/ui';
import type { Product } from '@/data/types';
import { ProductCard } from './ProductCard';

export const GRID_GUTTER = 14;
export const GRID_PADDING = 20;

export interface ProductGridProps {
  products: Product[];
  /** Maps categoryId → Lucide key, for image placeholders. */
  iconByCategory: Record<string, string>;
  loading?: boolean;
  skeletonCount?: number;
  onPressProduct?: (product: Product) => void;
  onAddProduct?: (product: Product) => void;
}

/**
 * Two-column product grid.
 *
 * Cards get an exact pixel width rather than a percentage, and no `flex` at all.
 * The earlier version wrapped each card in a percentage-width flex item and gave
 * the card `flex-1`: because a `flex-row flex-wrap` container aligns items with
 * `stretch` by default, every wrapper grew to the tallest card in its row and the
 * card then filled it — so card height stopped tracking its own content and the
 * whole row inherited the worst case. A definite width plus content-driven height
 * removes that coupling, and makes the two columns land on exact pixels instead
 * of rounding percentages against the padding and gutter.
 */
export function useCardWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((width - GRID_PADDING * 2 - GRID_GUTTER) / 2);
}

export function ProductGrid({
  products,
  iconByCategory,
  loading = false,
  skeletonCount = 4,
  onPressProduct,
  onAddProduct,
}: ProductGridProps) {
  const cardWidth = useCardWidth();

  if (loading) {
    return (
      <View
        className="flex-row flex-wrap"
        style={{ paddingHorizontal: GRID_PADDING, gap: GRID_GUTTER }}
      >
        {Array.from({ length: skeletonCount }, (_, i) => (
          <View key={i} className="rounded-[20px] bg-card p-3" style={{ width: cardWidth }}>
            <SkeletonCard />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      className="flex-row flex-wrap"
      // `flex-start` matters: each card now sits inside a Reveal wrapper, and a
      // wrap container stretches its items by default — the same coupling that
      // once made every card grow to the tallest in its row.
      style={{ paddingHorizontal: GRID_PADDING, gap: GRID_GUTTER, alignItems: 'flex-start' }}
    >
      {products.map((product, index) => (
        <Reveal key={product.id} index={index} style={{ width: cardWidth }}>
          <ProductCard
            product={product}
            width={cardWidth}
            categoryIcon={iconByCategory[product.categoryId]}
            onPress={() => onPressProduct?.(product)}
            onAdd={() => onAddProduct?.(product)}
          />
        </Reveal>
      ))}
    </View>
  );
}
