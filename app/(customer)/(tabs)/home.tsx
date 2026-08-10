import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { HomeHeader, ProductGrid, VendorCard } from '@/components/customer';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { EmptyState, Reveal, SectionHeader, SkeletonCard, Text } from '@/components/ui';
import { categoriesApi, productsApi, vendorsApi } from '@/data/api';
import type { Category, ID, Product, Vendor } from '@/data/types';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { useSessionStore } from '@/store/useSessionStore';
import { PackageOpen } from 'lucide-react-native';

const FEATURED_LIMIT = 6;
const VENDOR_CARD_WIDTH = 232;

export default function CustomerHomeScreen() {
  const tabBarInset = useTabBarInset();
  const user = useSessionStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<ID | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [nextCategories, nextProducts, nextVendors] = await Promise.all([
      categoriesApi.getCategories(),
      productsApi.getProducts(),
      vendorsApi.getVendors(),
    ]);
    setCategories(nextCategories);
    setProducts(nextProducts);
    setVendors(nextVendors);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /** Lucide key per category id, so cards can pick the right placeholder glyph. */
  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  const featured = useMemo(() => {
    const pool = selectedCategoryId
      ? products.filter((p) => p.categoryId === selectedCategoryId)
      : // No filter: lead with genuine deals so the grid has something to say.
        [...products].sort(
          (a, b) => Number(Boolean(b.compareAtPriceCad)) - Number(Boolean(a.compareAtPriceCad))
        );
    return pool.slice(0, FEATURED_LIMIT);
  }, [products, selectedCategoryId]);

  const nearbyVendors = useMemo(() => {
    const pool = selectedCategoryId
      ? vendors.filter((v) => v.categoryIds.includes(selectedCategoryId))
      : vendors;
    return [...pool].sort((a, b) => a.deliveryEtaMin - b.deliveryEtaMin).slice(0, 6);
  }, [vendors, selectedCategoryId]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <HomeHeader
          fullName={user?.fullName ?? ''}
          city="Montréal, QC"
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          // Tapping the active category clears it — otherwise the only way back
          // to the full catalogue would be a separate "all" chip.
          onSelectCategory={(id) => setSelectedCategoryId((current) => (current === id ? null : id))}
          onSearchPress={() => router.push(routes.customerSearch)}
          onProfilePress={() => router.push(routes.customerProfile)}
        />

        <View className="mt-7 gap-4">
          <SectionHeader
            title={selectedCategory ? selectedCategory.nameFr : 'Populaires'}
            actionLabel="Tout voir"
            onAction={() => router.push(routes.customerSearch)}
          />

          {!loading && featured.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="Aucun produit ici"
              description="Cette catégorie est vide pour le moment. Essayez-en une autre."
            />
          ) : (
            <ProductGrid
              products={featured}
              iconByCategory={iconByCategory}
              loading={loading}
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
        </View>

        <View className="mt-8 gap-4">
          <SectionHeader title="Commerces près de vous" />
          {loading ? (
            <View className="px-5">
              <SkeletonCard />
            </View>
          ) : nearbyVendors.length === 0 ? (
            <View className="px-5">
              <Text variant="caption" tone="muted">
                Aucun commerce dans cette catégorie pour l’instant.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="px-5 gap-3.5"
            >
              {nearbyVendors.map((vendor, index) => (
                <Reveal key={vendor.id} index={index} from="right">
                  <VendorCard
                    vendor={vendor}
                    width={VENDOR_CARD_WIDTH}
                    onPress={() =>
                      router.push({ pathname: dynamicRoutes.vendorDetail, params: { id: vendor.id } })
                    }
                  />
                </Reveal>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
