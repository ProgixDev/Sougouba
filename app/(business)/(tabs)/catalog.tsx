import { useFocusEffect, router } from 'expo-router';
import { PackagePlus, Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';

import { CounterHeader, PendingApproval, onSlab } from '@/components/business';
import { useT } from '@/lib/i18n/useT';
import { SearchField } from '@/components/customer';
import { Badge, CatalogImage, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { categoriesApi, productsApi } from '@/data/api';
import type { Category, Product } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
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

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!vendor) return;
    const [nextProducts, nextCategories] = await Promise.all([
      productsApi.getMyProducts(),
      categoriesApi.getCategories(),
    ]);
    setProducts(nextProducts);
    setCategories(nextCategories);
  }, [vendor]);

  // Creating or editing a product replaces back to this screen, so refetch on
  // focus rather than trying to thread the new record back through params.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Guarded on `vendor`: load() returns immediately while the shop is still
      // resolving, and clearing the flag then would drop the screen out of its
      // loading state with nothing fetched — a flash of a zeroed dashboard.
      load().finally(() => {
        if (active && vendor) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load, vendor])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [products, query]);

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

  const outOfStock = useMemo(
    () => products.filter((p) => p.isAvailable && p.stockQty <= LOW_STOCK_THRESHOLD).length,
    [products]
  );

  // A shop that is filed but not cleared is as unusable as no shop at all,
  // and for the merchant it is a different sentence — see `PendingApproval`.
  if (missing || pending) {
    return <PendingApproval state={missing ? 'missing' : 'pending'} onApproved={reload} />;
  }

  return (
    <View className="flex-1 bg-background">
      <CounterHeader
        title={t('business.tabs.catalog')}
        eyebrow={
          products.length > 0
            ? outOfStock > 0
              ? t('business.catalog.summary', {
                  products: t('business.catalog.productCount', { count: products.length }),
                  restock: t('business.catalog.toRestock', { count: outOfStock }),
                })
              : t('business.catalog.productCount', { count: products.length })
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
