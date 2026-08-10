import type { ID, Product } from '@/data/types';

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

export const sortLabels: Record<SortKey, string> = {
  relevance: 'Pertinence',
  price_asc: 'Prix croissant',
  price_desc: 'Prix décroissant',
  name: 'Ordre alphabétique',
};

export const priceBandLabels: Record<PriceBand, string> = {
  all: 'Tous les prix',
  under_10: 'Moins de 10 $',
  '10_to_20': '10 $ à 20 $',
  over_20: 'Plus de 20 $',
};

/** Bounds in CAD; `null` means open-ended on that side. */
const priceBands: Record<PriceBand, [number | null, number | null]> = {
  all: [null, null],
  under_10: [null, 10],
  '10_to_20': [10, 20],
  over_20: [20, null],
};

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
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'fr-CA'));
    default:
      return filtered;
  }
}
