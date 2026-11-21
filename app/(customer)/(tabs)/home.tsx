import { router } from 'expo-router';
import { PackageOpen } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { AddressPickerSheet, HomeHeader, ProductGrid, VendorCard, VerticalCard, useCartBarInset } from '@/components/customer';
import { useT } from '@/lib/i18n/useT';
import { EmptyState, Reveal, SectionHeader, SkeletonCard, Text } from '@/components/ui';
import { useQuery } from '@tanstack/react-query';

import { vendorsApi } from '@/data/api';
import { useCategories, useProducts, useProductsByIds, useTopProductIds, useVendors } from '@/data/queries';
import type { Category, ID, Product, Vendor, VendorType } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { deliveryAddressFor } from '@/lib/deliveryAddress';
import { dynamicRoutes, routes } from '@/lib/routes';
import { verticals } from '@/lib/verticals';
import { useCartStore } from '@/store/useCartStore';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Stable empty fallbacks.
 *
 * A fresh `[]` on every render while a query is pending is a new reference, so
 * every `useMemo` keyed on these lists would recompute each frame and the
 * memoised card lists below would be pointless.
 */
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_VENDORS: Vendor[] = [];
const EMPTY_IDS: ID[] = [];

const BEST_SELLER_LIMIT = 6;
const NEARBY_LIMIT = 6;
const VENDOR_CARD_WIDTH = 232;

export default function CustomerHomeScreen() {
  const cartBarInset = useCartBarInset();
  const t = useT();
  const tabBarInset = useTabBarInset();
  const user = useSessionStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);

  // Four cached queries, fetched in parallel. Each is shared with every other
  // screen asking the same question, so arriving here from the cart or search
  // paints from cache and revalidates behind it instead of refetching.
  const categoriesQuery = useCategories();
  const productsQuery = useProducts();
  const vendorsQuery = useVendors();
  const bestSellersQuery = useTopProductIds(BEST_SELLER_LIMIT);

  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;
  const products = productsQuery.data ?? EMPTY_PRODUCTS;
  const vendors = vendorsQuery.data ?? EMPTY_VENDORS;
  const bestSellerIds = bestSellersQuery.data ?? EMPTY_IDS;
  // The ranked products themselves, by id — not looked up in the first page of
  // the catalogue, where a best seller past the 100th product went missing.
  const rankedQuery = useProductsByIds(bestSellerIds);

  /** Where the shopper takes delivery — the distances below are theirs, not the city's. */
  const origin = useMemo(() => deliveryAddressFor(user), [user]);

  // How many shops each front door leads to, counted by the API over every
  // approved shop (one row asked for, for its total).
  const verticalTotals = useQuery({
    queryKey: ['vendors', 'totals'],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          verticals.map(async ({ type }) => [type, (await vendorsApi.getVendorsPage({ type }, 0, 1)).total] as const)
        )
      ) as Record<VendorType, number>,
  });

  // The nearest restaurants, picked by the API from every approved shop.
  const nearbyQuery = useQuery({
    queryKey: ['vendors', 'nearby', origin.lat, origin.lng],
    queryFn: () =>
      vendorsApi.getVendorsPage({ type: 'restaurant', near: { lat: origin.lat, lng: origin.lng } }, 0, NEARBY_LIMIT),
  });

  // Only the first load shows skeletons. A background revalidation must not
  // blank a screen that already has content on it.
  const loading =
    categoriesQuery.isPending || productsQuery.isPending || vendorsQuery.isPending;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      categoriesQuery.refetch(),
      productsQuery.refetch(),
      vendorsQuery.refetch(),
      bestSellersQuery.refetch(),
      verticalTotals.refetch(),
      nearbyQuery.refetch(),
    ]);
    setRefreshing(false);
    // Deliberately no deps: the query objects are recreated every render, so
    // depending on them would rebuild this callback — and the RefreshControl
    // under it — on every frame. `refetch` is stable per query.
  }, []);

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
        count: verticalTotals.data?.[type] ?? shops.length,
        fastestEtaMin: shops.length
          ? Math.min(...shops.map((v) => v.deliveryEtaMin))
          : undefined,
      };
    }
    return byType;
  }, [vendors, verticalTotals.data]);

  /**
   * Actually the best sellers, counted over the platform's last 30 days of
   * orders (`ordersApi.getTopProductIds`) — the section used to be headed "Populaires"
   * over a list sorted by whether an item carried a struck-through price.
   *
   * A brand-new catalogue has no sales to rank, and an empty rail under
   * "Articles les + vendus" reads as a broken screen rather than as an honest
   * one, so the deals-first order is kept as the tail-filler it always was.
   */
  const bestSellers = useMemo(() => {
    const byId = new Map([...products, ...(rankedQuery.data ?? [])].map((p) => [p.id, p]));
    const ranked = bestSellerIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => p !== undefined);
    if (ranked.length >= BEST_SELLER_LIMIT) return ranked.slice(0, BEST_SELLER_LIMIT);

    const seen = new Set(ranked.map((p) => p.id));
    const filler = [...products]
      .filter((p) => !seen.has(p.id))
      .sort((a, b) => Number(Boolean(b.compareAtPriceCad)) - Number(Boolean(a.compareAtPriceCad)));
    return [...ranked, ...filler].slice(0, BEST_SELLER_LIMIT);
  }, [products, bestSellerIds, rankedQuery.data]);

  /**
   * What the header names: the same address `origin` measures from, or nothing.
   * `deliveryAddressFor` falls back to a seeded downtown address for accounts
   * with none, and printing that would tell a shopper in Laval they live on
   * Sainte-Catherine — the header asks them to choose instead.
   */
  const location = useMemo(() => {
    const saved = user?.addresses.find((a) => a.isDefault) ?? user?.addresses[0];
    return saved ? `${saved.label} · ${saved.city}` : null;
  }, [user]);
  const [pickingAddress, setPickingAddress] = useState(false);

  /**
   * Restaurants only, nearest first (client, août 2026) — open ones ahead of
   * closed ones, the same order `vertical/[type]` lists them in, so a
   * restaurant does not change place between the two screens.
   *
   * It listed every shop sorted by announced ETA, under a heading that said
   * "près de vous" — neither the vertical nor the proximity was true.
   */
  const nearbyRestaurants = useMemo(
    () => (nearbyQuery.data?.items ?? []).map((vendor) => ({ vendor, km: distanceKm(origin, vendor.address) })),
    [nearbyQuery.data, origin]
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + cartBarInset + 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <HomeHeader
          fullName={user?.fullName ?? ''}
          location={location}
          onLocationPress={() => setPickingAddress(true)}
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
                vendors={vendors}
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
      <AddressPickerSheet visible={pickingAddress} onClose={() => setPickingAddress(false)} />
    </View>
  );
}
