import { router } from 'expo-router';
import { PackageOpen } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { HomeHeader, ProductGrid, VendorCard, VerticalCard } from '@/components/customer';
import { useT } from '@/lib/i18n/useT';
import { EmptyState, Reveal, SectionHeader, SkeletonCard, Text } from '@/components/ui';
import { categoriesApi, ordersApi, productsApi, vendorsApi } from '@/data/api';
import type { Category, ID, Product, Vendor, VendorType } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { deliveryAddressFor } from '@/lib/deliveryAddress';
import { dynamicRoutes, routes } from '@/lib/routes';
import { verticals } from '@/lib/verticals';
import { useCartStore } from '@/store/useCartStore';
import { useSessionStore } from '@/store/useSessionStore';

const BEST_SELLER_LIMIT = 6;
const NEARBY_LIMIT = 6;
const VENDOR_CARD_WIDTH = 232;

export default function CustomerHomeScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const user = useSessionStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bestSellerIds, setBestSellerIds] = useState<ID[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [nextCategories, nextProducts, nextVendors, nextBestSellers] = await Promise.all([
      categoriesApi.getCategories(),
      productsApi.getProducts(),
      vendorsApi.getVendors(),
      ordersApi.getTopProductIds(BEST_SELLER_LIMIT),
    ]);
    setCategories(nextCategories);
    setProducts(nextProducts);
    setVendors(nextVendors);
    setBestSellerIds(nextBestSellers);
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

  /**
   * Actually the best sellers, counted over every order the platform has taken
   * (`ordersApi.getTopProductIds`) — the section used to be headed "Populaires"
   * over a list sorted by whether an item carried a struck-through price.
   *
   * A brand-new catalogue has no sales to rank, and an empty rail under
   * "Articles les + vendus" reads as a broken screen rather than as an honest
   * one, so the deals-first order is kept as the tail-filler it always was.
   */
  const bestSellers = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const ranked = bestSellerIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => p !== undefined);
    if (ranked.length >= BEST_SELLER_LIMIT) return ranked.slice(0, BEST_SELLER_LIMIT);

    const seen = new Set(ranked.map((p) => p.id));
    const filler = [...products]
      .filter((p) => !seen.has(p.id))
      .sort((a, b) => Number(Boolean(b.compareAtPriceCad)) - Number(Boolean(a.compareAtPriceCad)));
    return [...ranked, ...filler].slice(0, BEST_SELLER_LIMIT);
  }, [products, bestSellerIds]);

  /** Where the shopper takes delivery — the distances below are theirs, not the city's. */
  const origin = useMemo(() => deliveryAddressFor(user), [user]);

  /**
   * Restaurants only, nearest first (client, août 2026).
   *
   * It listed every shop sorted by announced ETA, under a heading that said
   * "près de vous" — neither the vertical nor the proximity was true. Distance
   * is measured the same way `vertical/[type]` measures it, so a restaurant does
   * not change place between the two screens.
   */
  const nearbyRestaurants = useMemo(
    () =>
      vendors
        .filter((v) => v.vendorType === 'restaurant')
        .map((vendor) => ({ vendor, km: distanceKm(origin, vendor.address) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEARBY_LIMIT),
    [vendors, origin]
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
          city={t('customer.defaultCity')}
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
            title={t('customer.home.bestSellers')}
            actionLabel={t('common.seeAll')}
            onAction={() => router.push(routes.customerSearch)}
          />

          {!loading && bestSellers.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title={t('customer.home.emptyProductsTitle')}
              description={t('customer.home.emptyProductsBody')}
            />
          ) : (
            <ProductGrid
              products={bestSellers}
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
          <SectionHeader
            title={t('customer.home.restaurantsNearby')}
            actionLabel={t('common.seeAll')}
            onAction={() =>
              router.push({ pathname: dynamicRoutes.vendorList, params: { type: 'restaurant' } })
            }
          />
          {loading ? (
            <View className="px-5">
              <SkeletonCard />
            </View>
          ) : nearbyRestaurants.length === 0 ? (
            <View className="px-5">
              <Text variant="caption" tone="muted">
                {t('customer.home.noRestaurants')}
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="px-5 gap-3.5"
            >
              {nearbyRestaurants.map(({ vendor, km }, index) => (
                <Reveal key={vendor.id} index={index} from="right">
                  <VendorCard
                    vendor={vendor}
                    width={VENDOR_CARD_WIDTH}
                    distanceKm={km}
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
