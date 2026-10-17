import { router } from 'expo-router';
import { SearchX } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterSheet, ProductGrid, SearchField, useCartBarInset } from '@/components/customer';
import { Chip, EmptyState, Text } from '@/components/ui';
import { useCategories, useProductSearch, useProducts, useVendors } from '@/data/queries';
import type { Category, ID, Product, Vendor } from '@/data/types';
import { useDebounce } from '@/hooks/useDebounce';
import { useT } from '@/lib/i18n/useT';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import {
  activeFilterCount,
  applyFilters,
  emptyFilters,
  type ProductFilters,
} from '@/lib/productFilters';
import { dynamicRoutes } from '@/lib/routes';
import { useLocalized } from '@/lib/localized';
import { useCartStore } from '@/store/useCartStore';

/** Stable empty fallbacks — see the note in home.tsx. */
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_VENDORS: Vendor[] = [];

const BROWSE_LIMIT = 24;

export default function SearchScreen() {
  const cartBarInset = useCartBarInset();
  const t = useT();
  const L = useLocalized();
  const tabBarInset = useTabBarInset();
  const addItem = useCartStore((s) => s.addItem);

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<ID | null>(null);

  const [filters, setFilters] = useState<ProductFilters>(emptyFilters);
  const [sheetOpen, setSheetOpen] = useState(false);
  // What the sheet's button counts. Tracked separately from `filters` so the
  // count updates as the draft changes, without applying anything.
  const [draftFilters, setDraftFilters] = useState<ProductFilters>(emptyFilters);

  const debouncedQuery = useDebounce(query, 250);

  // Shared with home and the rest of the catalogue screens, so arriving here
  // usually paints from cache with no request at all.
  const categoriesQuery = useCategories();
  const allProductsQuery = useProducts();
  const vendorsQuery = useVendors();

  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;
  const allProducts = allProductsQuery.data ?? EMPTY_PRODUCTS;
  const vendors = vendorsQuery.data ?? EMPTY_VENDORS;

  // Disabled on a blank term, so `data` is `undefined` when not searching —
  // which is exactly the `null` the browse path below looks for. An empty
  // array would read as "no results" rather than "no query".
  const searchQuery = useProductSearch(debouncedQuery);
  const results = debouncedQuery.trim() ? searchQuery.data ?? null : null;
  const searching = !!debouncedQuery.trim() && searchQuery.isPending;

  /** The full narrowing pipeline for a given filter set: query → category → filters. */
  const narrow = useCallback(
    (active: ProductFilters) => {
      const pool = results ?? allProducts;
      const byCategory = categoryId ? pool.filter((p) => p.categoryId === categoryId) : pool;
      return applyFilters(byCategory, active);
    },
    [results, allProducts, categoryId]
  );

  const filterCount = activeFilterCount(filters);

  const { visible, browseTruncated } = useMemo(() => {
    const narrowed = narrow(filters);
    // Idle browse would otherwise mount all 78 cards at once — each with its own
    // Reanimated value and pressable — which stutters on first paint. A query, a
    // category or a filter narrows things enough to show every match.
    const browsing = !results && !categoryId && filterCount === 0;
    return {
      visible: browsing ? narrowed.slice(0, BROWSE_LIMIT) : narrowed,
      browseTruncated: browsing && narrowed.length > BROWSE_LIMIT,
    };
  }, [narrow, filters, results, categoryId, filterCount]);

  /** Live count behind the sheet's button, computed from the draft, not what is applied. */
  const draftResultCount = useMemo(() => narrow(draftFilters).length, [narrow, draftFilters]);

  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  const hasQuery = debouncedQuery.trim().length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2 pb-4 gap-4">
        <Text variant="title" weight="bold" className="text-[26px]">
          {t('customer.search.title')}
        </Text>
        <SearchField
          value={query}
          onChangeText={setQuery}
          activeFilterCount={filterCount}
          onFilterPress={() => {
            Keyboard.dismiss();
            setSheetOpen(true);
          }}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-5 gap-2 pb-4"
        // Filters stay reachable while a keyboard is up.
        keyboardShouldPersistTaps="handled"
      >
        {categories.map((category) => (
          <Chip
            key={category.id}
            label={L(category.shortName)}
            selected={categoryId === category.id}
            onPress={() => setCategoryId((current) => (current === category.id ? null : category.id))}
          />
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + cartBarInset + 24 }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <View className="px-5 pb-3 flex-row items-center gap-3">
          <Text variant="caption" tone="muted" className="flex-1">
            {searching
              ? t('customer.search.searching')
              : browseTruncated
                ? t('customer.browseTruncated', { count: visible.length })
                : hasQuery
                  ? t('customer.search.resultsForQuery', {
                      count: visible.length,
                      query: debouncedQuery.trim(),
                    })
                  : t('customer.search.results', { count: visible.length })}
          </Text>
          {filterCount > 0 ? (
            <Text
              variant="caption"
              weight="semibold"
              tone="secondary"
              accessibilityRole="button"
              accessibilityLabel={t('customer.filters.clear')}
              onPress={() => setFilters(emptyFilters)}
            >
              {t('customer.filters.clear')}
            </Text>
          ) : null}
        </View>

        {!searching && visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t('customer.filters.noResults')}
            description={
              filterCount > 0
                ? t('customer.emptyStates.searchNoFilterMatch')
                : categoryId && hasQuery
                  ? t('customer.emptyStates.searchTryAnotherWithCategory')
                  : t('customer.emptyStates.searchTryAnother')
            }
            actionLabel={filterCount > 0 ? t('customer.filters.clear') : undefined}
            onAction={filterCount > 0 ? () => setFilters(emptyFilters) : undefined}
          />
        ) : (
          <ProductGrid
                vendors={vendors}
            products={visible}
            iconByCategory={iconByCategory}
            loading={searching}
            skeletonCount={6}
            onPressProduct={(product) =>
              router.push({ pathname: dynamicRoutes.productDetail, params: { id: product.id } })
            }
            onAddProduct={(product) =>
              addItem({
                productId: product.id,
                vendorId: product.vendorId,
                unitPriceCad: product.priceCad,
              })
            }
          />
        )}
      </ScrollView>

      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        vendors={vendors}
        resultCount={draftResultCount}
        onDraftChange={setDraftFilters}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}
