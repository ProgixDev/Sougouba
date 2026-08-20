import { router } from 'expo-router';
import { PackageOpen } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { HomeHeader, ProductGrid, VendorCard, VerticalCard } from '@/components/customer';
import { EmptyState, Reveal, SectionHeader, SkeletonCard, Text } from '@/components/ui';
import { categoriesApi, productsApi, vendorsApi } from '@/data/api';
import type { Category, Product, Vendor, VendorType } from '@/data/types';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { dynamicRoutes, routes } from '@/lib/routes';
import { verticals } from '@/lib/verticals';
import { useCartStore } from '@/store/useCartStore';
import { useSessionStore } from '@/store/useSessionStore';

const FEATURED_LIMIT = 6;
const VENDOR_CARD_WIDTH = 232;

export default function CustomerHomeScreen() {
  const tabBarInset = useTabBarInset();
  const user = useSessionStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
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

  /**
   * What each front door actually leads to right now. A card that only said
   * "Restaurant" would be a label; saying how many shops are behind it, and how
   * fast the quickest one delivers, makes it a destination worth choosing.
   */
  const inventory = useMemo(() => {
    const byType = {} as Record<VendorType, { count: number; fastestEtaMin?: number }>;
    for (const { type } of verticals) {
      const shops = vendors.filter((v) => v.vendorType === type);
      byType[type] = {
        count: shops.length,
        fastestEtaMin: shops.length
          ? Math.min(...shops.map((v) => v.deliveryEtaMin))
          : undefined,
      };
    }
    return byType;
  }, [vendors]);

  // No category filter to honour any more, so the grid leads with genuine deals
  // rather than with whatever the catalogue happens to return first.
  const featured = useMemo(
    () =>
      [...products]
        .sort((a, b) => Number(Boolean(b.compareAtPriceCad)) - Number(Boolean(a.compareAtPriceCad)))
        .slice(0, FEATURED_LIMIT),
    [products]
  );

  const nearbyVendors = useMemo(
    () => [...vendors].sort((a, b) => a.deliveryEtaMin - b.deliveryEtaMin).slice(0, 6),
    [vendors]
  );

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
          onSearchPress={() => router.push(routes.customerSearch)}
          onProfilePress={() => router.push(routes.customerProfile)}
        />

        {/* The first decision the app asks for, above everything else on the
            screen (CDC addendum v1.1, §01). */}
        <View className="px-5 mt-6 gap-3.5">
          {verticals.map((vertical, index) => (
            <Reveal key={vertical.type} index={index}>
              <VerticalCard
                vertical={vertical}
                shopCount={loading ? undefined : inventory[vertical.type]?.count}
                fastestEtaMin={loading ? undefined : inventory[vertical.type]?.fastestEtaMin}
                onPress={() =>
                  router.push({
                    pathname: dynamicRoutes.vendorList,
                    params: { type: vertical.type },
                  })
                }
              />
            </Reveal>
          ))}
        </View>

        <View className="mt-8 gap-4">
          <SectionHeader
            title="Populaires"
            actionLabel="Tout voir"
            onAction={() => router.push(routes.customerSearch)}
          />

          {!loading && featured.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="Aucun produit ici"
              description="Le catalogue est vide pour le moment."
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
                Aucun commerce pour l’instant.
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
