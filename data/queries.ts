import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { DEFAULT_PLAN, type PlatformPlan } from '../lib/monetization';

import { categoriesApi, ordersApi, productsApi, vendorsApi } from './api';
import type { Category, ID, Product, Vendor } from './types';

/**
 * Query keys for the catalogue, in one place.
 *
 * Written as a factory rather than inline strings so that invalidating "all
 * product queries" is `queryClient.invalidateQueries({ queryKey: keys.products })`
 * and actually catches the category, vendor, id-batch and search variants —
 * which it only does because they all start with `'products'`.
 */
export const keys = {
  categories: ['categories'] as const,
  vendors: ['vendors'] as const,
  vendor: (id: ID) => ['vendors', id] as const,
  products: ['products'] as const,
  productsByCategory: (categoryId: ID) => ['products', 'category', categoryId] as const,
  productsByVendor: (vendorId: ID) => ['products', 'vendor', vendorId] as const,
  /** Sorted and joined: the same set of ids in a different order is the same query. */
  productsByIds: (ids: readonly ID[]) => ['products', 'ids', [...ids].sort().join(',')] as const,
  productSearch: (term: string) => ['products', 'search', term] as const,
  topProducts: (limit: number) => ['products', 'top', limit] as const,
  platformPlan: ['platformPlan'] as const,
};

export function useCategories(): UseQueryResult<Category[]> {
  return useQuery({ queryKey: keys.categories, queryFn: categoriesApi.getCategories });
}

export function useVendors(): UseQueryResult<Vendor[]> {
  return useQuery({ queryKey: keys.vendors, queryFn: vendorsApi.getVendors });
}

/** A page of the catalogue, platform-wide — one request, whatever the shop count. */
export function useProducts(): UseQueryResult<Product[]> {
  return useQuery({ queryKey: keys.products, queryFn: productsApi.getProducts });
}

export function useProductsByCategory(categoryId: ID | undefined): UseQueryResult<Product[]> {
  return useQuery({
    queryKey: keys.productsByCategory(categoryId ?? ''),
    queryFn: () => productsApi.getProductsByCategory(categoryId as ID),
    enabled: !!categoryId,
  });
}

/**
 * Specific products by id — the favourites list and anything else holding ids.
 *
 * ⚠️ Ids that no longer resolve come back absent rather than as an error, so
 * callers must not assume the result lines up with what they asked for. An
 * empty `ids` skips the request entirely instead of asking for nothing.
 */
export function useProductsByIds(ids: readonly ID[]): UseQueryResult<Product[]> {
  return useQuery({
    queryKey: keys.productsByIds(ids),
    queryFn: () => productsApi.getProductsByIds([...ids]),
    enabled: ids.length > 0,
  });
}

/**
 * Name-or-tag search, run in the database.
 *
 * Disabled on a blank term: `searchProducts('')` answers `[]` by design, and
 * caching that under its own key would read as "no results" rather than "no
 * query". Callers should treat `undefined` data as "not searching".
 */
export function useProductSearch(term: string): UseQueryResult<Product[]> {
  const trimmed = term.trim();
  return useQuery({
    queryKey: keys.productSearch(trimmed),
    queryFn: () => productsApi.searchProducts(trimmed),
    enabled: trimmed.length > 0,
  });
}

/**
 * The best-seller ranking — the platform's last 30 days, ids only. An empty
 * list (no sales yet) leaves the home screen to fill the rail with deals.
 */
export function useTopProductIds(limit: number): UseQueryResult<ID[]> {
  return useQuery({
    queryKey: keys.topProducts(limit),
    queryFn: () => ordersApi.getTopProductIds(limit),
  });
}

/**
 * The commission rate and monthly subscription an administrator has set.
 *
 * Never undefined: until the request answers — or if it fails — this is
 * `DEFAULT_PLAN`, so a merchant screen always has a rate to show and to
 * compute with. Cached for the session; a rate changing mid-session is rare
 * enough that the next launch picking it up is fine.
 */
export function usePlatformPlan(): PlatformPlan {
  const { data } = useQuery({
    queryKey: keys.platformPlan,
    queryFn: vendorsApi.getMyPlan,
    staleTime: Infinity,
  });
  return data ?? DEFAULT_PLAN;
}
