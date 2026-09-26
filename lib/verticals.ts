import { ShoppingBasket, UtensilsCrossed, type LucideIcon } from 'lucide-react-native';
import type { ImageSourcePropType } from 'react-native';

import { productImages, vendorImages } from '@/data/images.generated';
import type { VendorType } from '@/data/types';
import { forest, terracotta } from '@/theme/tokens';

export interface Vertical {
  /**
   * Also the catalogue key: the words live at `domain.vertical.<type>.*`.
   *
   * They used to be `labelFr` / `titleFr` / `pluralFr` fields right here. They
   * belong in the catalogue rather than in a `LocalizedText` because this is
   * *code*, not a row — each entry carries a `LucideIcon`, a hex accent and an
   * `ImageSourcePropType`, none of which crosses a JSON boundary, and
   * `VendorType` is a closed union a back-office cannot extend.
   *
   * Dropping `pluralFr` also deleted a `.toLowerCase()` at the one call site
   * that used it: a linguistic transformation applied to stored data, which is
   * wrong for English nouns. Casing is authored now, per form, per language.
   */
  type: VendorType;
  icon: LucideIcon;
  /** Distinguishes the two entry cards without tinting the photograph behind them. */
  accent: string;
  cover: ImageSourcePropType | undefined;
}

/**
 * The catalogue's two front doors (CDC addendum v1.1, §01).
 *
 * Ordered as the client listed them, and fixed rather than derived from the
 * vendor table: a vertical with no shops in it yet is still a door the shopper
 * should see, and deriving the list would make it vanish on an empty catalogue.
 *
 * Each takes its cover from real catalogue photography, the same way
 * `lib/categoryImages.ts` gives every category a real product: a spice souk and
 * a plate of thieboudienne say "épicerie" and "restaurant" faster than any
 * illustration would — and faster than the supermarket aisle and the close-up of
 * cutlery they replaced, both of which read as stock.
 */
export const verticals: Vertical[] = [
  {
    type: 'grocery',
    icon: ShoppingBasket,
    accent: forest[600],
    cover: vendorImages.vnd_souk_medina,
  },
  {
    type: 'restaurant',
    icon: UtensilsCrossed,
    accent: terracotta[600],
    cover: productImages.prd_thieboudienne,
  },
];

export function verticalFor(type: string | undefined): Vertical | undefined {
  return verticals.find((v) => v.type === type);
}
