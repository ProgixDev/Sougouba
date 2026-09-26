import { View } from 'react-native';

import { CatalogImage, QuantityStepper, Text } from '@/components/ui';
import { useLocale } from '@/lib/i18n/useT';
import type { CartItem, Product } from '@/data/types';
import { categoryIcons } from '@/lib/categoryIcons';
import { formatCad } from '@/lib/format';

export interface CartItemRowProps {
  item: CartItem;
  product: Product;
  categoryIcon?: string;
  onChangeQty: (qty: number) => void;
}

/** One cart line: thumbnail, name, line total, and the quantity control. */
export function CartItemRow({ item, product, categoryIcon, onChangeQty }: CartItemRowProps) {
  // Formats money here but renders no translated string of its own; this is
  // the subscription that re-runs those formatters on a language switch.
  useLocale();
  return (
    <View className="flex-row items-center gap-3">
      <CatalogImage
        id={product.id}
        kind="product"
        icon={categoryIcon ? categoryIcons[categoryIcon] : undefined}
        radius={12}
        height={64}
        width={64}
      />

      <View className="flex-1 gap-1">
        <Text variant="caption" weight="semibold" numberOfLines={2}>
          {product.name}
        </Text>
        {/* Unit price only helps once there is more than one, so show it then. */}
        <Text variant="caption" tone="muted" className="text-[12px]">
          {item.qty > 1 ? `${item.qty} × ${formatCad(item.unitPriceCad)}` : formatCad(item.unitPriceCad)}
        </Text>
      </View>

      <View className="items-end gap-2">
        <Text weight="bold" className="text-[15px]">
          {formatCad(item.unitPriceCad * item.qty)}
        </Text>
        <QuantityStepper qty={item.qty} onChange={onChangeQty} />
      </View>
    </View>
  );
}
