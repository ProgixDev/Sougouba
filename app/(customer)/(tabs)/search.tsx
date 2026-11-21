import { router } from 'expo-router';
import { SearchX } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilterSheet, ProductGrid, SearchField, useCartBarInset } from '@/components/customer';
import { Chip, EmptyState, ListFooter, Text } from '@/components/ui';
import { productsApi } from '@/data/api';
import type { ProductPageFilters } from '@/data/api/products';
import { useCategories, useVendors } from '@/data/queries';
import type { Category, ID, Vendor } from '@/data/types';
import { isNearBottom, usePagedList } from '@/hooks/usePagedList';
import { useDebounce } from '@/hooks/useDebounce';
import { useT } from '@/lib/i18n/useT';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { activeFilterCount, emptyFilters, type ProductFilters } from '@/lib/productFilters';
import { dynamicRoutes } from '@/lib/routes';
import { useLocalized } from '@/lib/localized';
import { useCartStore } from '@/store/useCartStore';

/** Stable empty fallbacks — see the note in home.tsx. */
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_VENDORS: Vendor[] = [];

/** The API's filters for what the screen shows: search term, category chip and the sheet. */
function pageFilters(q: string, categoryId: ID | null, f: ProductFilters): ProductPageFilters {
  return {
    q,
    categoryId,
    vendorId: f.vendorId,
    sort: f.sort,
    priceBand: f.priceBand,
    onSale: f.onSale,
    inStockOnly: f.inStockOnly,
  };
}

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
  // usually paints from cache with no request at all. Shops feed the filter
  // sheet's shop picker and the shop name on each card.
  const categoriesQuery = useCategories();
  const vendorsQuery = useVendors();
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;
  const vendors = vendorsQuery.data ?? EMPTY_VENDORS;

  // Search term, category and filters all go to the API, which pages the
  // answer: every product is reachable by scrolling, not just the first 100.
  const term = debouncedQuery.trim();
  const applied = pageFilters(term, categoryId, filters);
  const list = usePagedList(['products', 'page', applied], (offset, limit) =>
    productsApi.getProductsPage(applied, offset, limit)
  );
  const visible = list.items;
  const searching = list.loading;

  // The sheet's button counts what its draft would show — one row asked for,
  // just for the total, and only while the sheet is open.
  const draft = pageFilters(term, categoryId, draftFilters);
  const draftCount = useQuery({
    queryKey: ['products', 'count', draft],
    queryFn: () => productsApi.getProductsPage(draft, 0, 1),
    enabled: sheetOpen,
  });
  const draftResultCount = draftCount.data?.total ?? list.total;

  const filterCount = activeFilterCount(filters);

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
        onScroll={({ nativeEvent }) => {
          if (isNearBottom(nativeEvent)) list.loadMore();
        }}
        scrollEventThrottle={200}
      >
        <View className="px-5 pb-3 flex-row items-center gap-3">
          <Text variant="caption" tone="muted" className="flex-1">
            {searching
              ? t('customer.search.searching')
              : hasQuery
                ? t('customer.search.resultsForQuery', {
                    count: list.total,
                    query: debouncedQuery.trim(),
                  })
                : t('customer.search.results', { count: list.total })}
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
        <ListFooter loading={list.loadingMore} />
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
