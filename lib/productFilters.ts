import type { ID, Product } from '@/data/types';
import { formatCadCompact } from '@/lib/format';
import type { MessageKey, TFunction } from '@/lib/i18n';

export type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'name';
export type PriceBand = 'all' | 'under_10' | '10_to_20' | 'over_20';

export interface ProductFilters {
  sort: SortKey;
  priceBand: PriceBand;
  vendorId: ID | null;
  /** Only products carrying a struck-through original price. */
  onSale: boolean;
  inStockOnly: boolean;
}

export const emptyFilters: ProductFilters = {
  sort: 'relevance',
  priceBand: 'all',
  vendorId: null,
  onSale: false,
  inStockOnly: false,
};

/**
 * The sort options in the order they are offered.
 *
 * An explicit array rather than `Object.keys(sortLabels)`: the labels are no
 * longer a record here, and key order was never a contract worth relying on for
 * something the user sees.
 */
export const SORT_KEYS: SortKey[] = ['relevance', 'price_asc', 'price_desc', 'name'];
export const PRICE_BANDS: PriceBand[] = ['all', 'under_10', '10_to_20', 'over_20'];

export function sortKey(sort: SortKey): MessageKey {
  return `domain.sort.${sort}` as MessageKey;
}

/** Bounds in CAD; `null` means open-ended on that side. */
const priceBands: Record<PriceBand, [number | null, number | null]> = {
  all: [null, null],
  under_10: [null, 10],
  '10_to_20': [10, 20],
  over_20: [20, null],
};

/**
 * "Moins de 10 $" / "Under $10".
 *
 * The amounts are formatted, never spelled out. The old labels wrote the dollar
 * sign into the string — which is untranslatable, because `en-CA` puts it in
 * front of the number rather than after it.
 *
 * Deriving the numbers from `priceBands` also closes a latent drift: the bounds
 * and the label text were two independent sources of "10", and nothing stopped
 * one being edited without the other.
 */
export function priceBandLabel(t: TFunction, band: PriceBand): string {
  const [min, max] = priceBands[band];
  if (min === null && max === null) return t('domain.priceBand.all');
  if (min === null) return t('domain.priceBand.under', { amount: formatCadCompact(max!) });
  if (max === null) return t('domain.priceBand.over', { amount: formatCadCompact(min) });
  return t('domain.priceBand.between', {
    from: formatCadCompact(min),
    to: formatCadCompact(max),
  });
}

/**
 * How many filters the shopper has actually set.
 *
 * Drives the count on the filter button, so it deliberately ignores `sort`:
 * a sort order is always in effect and showing "1 filtre" for the default
 * ordering would be noise.
 */
export function activeFilterCount(filters: ProductFilters): number {
  let count = 0;
  if (filters.priceBand !== 'all') count++;
  if (filters.vendorId) count++;
  if (filters.onSale) count++;
  if (filters.inStockOnly) count++;
  return count;
}

export function hasActiveFilters(filters: ProductFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.sort !== 'relevance';
}

/**
 * Narrow and order a product list.
 *
 * `relevance` keeps the incoming order rather than imposing one — the list
 * arrives either as search results, which are already ranked, or as the
 * catalogue's own order, and both are more meaningful than an alphabetical
 * shuffle.
 */
export function applyFilters(products: Product[], filters: ProductFilters): Product[] {
  const [min, max] = priceBands[filters.priceBand];

  const filtered = products.filter((product) => {
    if (filters.vendorId && product.vendorId !== filters.vendorId) return false;
    if (filters.onSale && !product.compareAtPriceCad) return false;
    if (filters.inStockOnly && (!product.isAvailable || product.stockQty <= 0)) return false;
    if (min !== null && product.priceCad < min) return false;
    if (max !== null && product.priceCad >= max) return false;
    return true;
  });

  switch (filters.sort) {
    case 'price_asc':
      return [...filtered].sort((a, b) => a.priceCad - b.priceCad);
    case 'price_desc':
      return [...filtered].sort((a, b) => b.priceCad - a.priceCad);
    case 'name':
      // `'fr-CA'` on purpose, and not the app locale: product names are French
      // in both languages (see the scope note on `data/seed/products.ts`), so the
      // collator should keep sorting them by French rules — that is what puts
      // "épices" where a reader expects it. Do not "fix" this to the UI language.
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'fr-CA'));
    default:
      return filtered;
  }
}
