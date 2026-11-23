import { useFocusEffect, router } from 'expo-router';
import { PackagePlus, Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';

import { CounterHeader, PendingApproval, onSlab } from '@/components/business';
import { useT } from '@/lib/i18n/useT';
import { SearchField } from '@/components/customer';
import { Badge, CatalogImage, EmptyState, ListFooter, Reveal, Skeleton, Text } from '@/components/ui';
import { categoriesApi, productsApi } from '@/data/api';
import type { Category, Product } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagedList } from '@/hooks/usePagedList';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { categoryIcons } from '@/lib/categoryIcons';
import { useLocalized } from '@/lib/localized';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';

const LOW_STOCK_THRESHOLD = 20;

interface CatalogSection {
  id: string;
  title: string;
  data: Product[];
}

/** Products whose shelf no longer exists. A merchant's own catalogue must never hide one of their products. */
const UNFILED_SECTION_ID = 'unfiled';

export default function BusinessCatalogScreen() {
  const t = useT();
  const L = useLocalized();
  const tabBarInset = useTabBarInset();
  const { vendor, loading: vendorLoading, missing, pending, reload } = useOwnerVendor();

  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const term = useDebounce(query, 250).trim();

  useEffect(() => {
    categoriesApi.getCategories().then(setCategories).catch(() => undefined);
  }, []);

  // The shelves, in the shop's section order, a page at a time; the search
  // runs in the database over every product, not over what has loaded.
  const shelves = usePagedList(
    ['products', 'mine', vendor?.id, term],
    (offset, limit) => productsApi.getMyProductsPage({ q: term, sort: 'section' }, offset, limit),
    { enabled: !!vendor, pageSize: 50 }
  );
  // The header's counts are the whole shop's: one row asked for, for the totals.
  const counts = useQuery({
    queryKey: ['products', 'mine', vendor?.id, 'counts'],
    queryFn: async () => {
      const [all, low] = await Promise.all([
        productsApi.getMyProductsPage({}, 0, 1),
        productsApi.getMyProductsPage({ maxStock: LOW_STOCK_THRESHOLD }, 0, 1),
      ]);
      return { products: all.total, restock: low.total };
    },
    enabled: !!vendor,
  });

  const loading = shelves.loading;
  const { reload: reloadShelves } = shelves;
  const { refetch: refetchCounts } = counts;
  // Creating or editing a product replaces back to this screen, so refetch on
  // focus rather than trying to thread the new record back through params.
  useFocusEffect(
    useCallback(() => {
      void reloadShelves();
      void refetchCounts();
    }, [reloadShelves, refetchCounts])
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([reloadShelves(), refetchCounts()]);
    setRefreshing(false);
  }, [reloadShelves, refetchCounts]);

  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  const visible: Product[] = shelves.items;

  /**
   * The catalogue, under the merchant's own headings.
   *
   * Shown grouped rather than as one list because these headings are what the
   * shopper sees on the shop page: filing a dish under "Desserts" and then
   * checking it landed there is a two-screen round trip if this screen only ever
   * shows a flat list. Ordered as the shop orders them, and searching narrows
   * within the grouping rather than flattening it.
   */
  const sections = useMemo<CatalogSection[]>(() => {
    if (!vendor) return [];
    const known = new Set(vendor.sections.map((s) => s.id));
    const grouped = vendor.sections
      .map((section) => ({
        id: section.id,
        title: L(section.name),
        data: visible.filter((p) => p.sectionId === section.id),
      }))
      .filter((section) => section.data.length > 0);

    const unfiled = visible.filter((p) => !known.has(p.sectionId));
    return unfiled.length > 0
      ? [...grouped, { id: UNFILED_SECTION_ID, title: t('business.catalogEmpty.uncategorised'), data: unfiled }]
      : grouped;
  }, [vendor, visible]);

  const productCount = counts.data?.products ?? 0;
  const outOfStock = counts.data?.restock ?? 0;

  // A shop that is filed but not cleared is as unusable as no shop at all,
  // and for the merchant it is a different sentence — see `PendingApproval`.
  if (missing || pending) {
    return <PendingApproval state={missing ? 'missing' : 'pending'} />;
  }

  return (
    <View className="flex-1 bg-background">
      <CounterHeader
        title={t('business.tabs.catalog')}
        eyebrow={
          productCount > 0
            ? outOfStock > 0
              ? t('business.catalog.summary', {
                  products: t('business.catalog.productCount', { count: productCount }),
                  restock: t('business.catalog.toRestock', { count: outOfStock }),
                })
              : t('business.catalog.productCount', { count: productCount })
            : vendor?.name
        }
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('business.catalog.addProduct')}
            onPress={() => router.push(routes.businessProductNew)}
            className="flex-row items-center gap-1.5 rounded-full px-4 h-10 active:opacity-80"
            style={{ backgroundColor: onSlab.fill }}
          >
            <Plus size={16} color={onSlab.text} strokeWidth={2.5} />
            <Text variant="caption" weight="bold" style={{ color: onSlab.text }}>
              {t('business.catalog.add')}
            </Text>
          </Pressable>
        }
      >
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t('business.catalog.searchPlaceholder')}
        />
      </CounterHeader>

      {vendorLoading || loading ? (
        <View className="px-5 pt-5 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={84} radius={20} />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(product) => product.id}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: tabBarInset + 24,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={shelves.loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={<ListFooter loading={shelves.loadingMore} />}
          renderSectionHeader={({ section }) => (
            <View className="flex-row items-baseline gap-2 bg-background pt-5 pb-2.5">
              <Text variant="caption" weight="bold" className="text-[15px]">
                {section.title}
              </Text>
              <Text variant="caption" tone="muted" className="text-[12px]">
                {section.data.length}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={PackagePlus}
              title={query ? t('business.catalogEmpty.noResults') : t('business.catalogEmpty.emptyTitle')}
              description={
                query
                  ? t('business.catalogEmpty.noMatch')
                  : t('business.catalogEmpty.addFirst')
              }
              actionLabel={query ? undefined : t('business.catalog.addProduct')}
              onAction={query ? undefined : () => router.push(routes.businessProductNew)}
            />
          }
          renderItem={({ item: product, index }) => {
            const lowStock = product.isAvailable && product.stockQty <= LOW_STOCK_THRESHOLD;
            return (
              <Reveal index={index} className="mb-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.a11y.edit', { name: product.name })}
                  onPress={() =>
                    router.push({
                      pathname: dynamicRoutes.businessProductEdit,
                      params: { id: product.id },
                    })
                  }
                  className="flex-row items-center gap-3 rounded-[20px] bg-card p-3 active:opacity-90"
                >
                  <CatalogImage
                    id={product.id}
          path={product.imageUrl}
                    kind="product"
                    icon={categoryIcons[iconByCategory[product.categoryId]]}
                    radius={12}
                    height={58}
                    width={58}
                  />
                  <View className="flex-1 gap-1">
                    <Text variant="caption" weight="semibold" numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[12px]">
                      {t('business.catalog.stockLine', {
                        price: formatCad(product.priceCad),
                        qty: product.stockQty,
                      })}
                    </Text>
                    <View className="flex-row gap-1.5 mt-0.5">
                      {product.hiddenByAdmin ? (
                        <Badge label={t('business.catalog.hiddenByAdmin')} tone="destructive" size="sm" />
                      ) : !product.isAvailable ? (
                        <Badge label={t('business.catalog.offSale')} tone="neutral" size="sm" />
                      ) : lowStock ? (
                        <Badge label={t('business.catalog.lowStock')} tone="warning" size="sm" />
                      ) : (
                        <Badge label={t('business.catalog.onSale')} tone="success" size="sm" />
                      )}
                    </View>
                  </View>
                </Pressable>
              </Reveal>
            );
          }}
        />
      )}
    </View>
  );
}
