import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductGrid, VendorCard, useCartBarInset } from '@/components/customer';
import { useT } from '@/lib/i18n/useT';
import { BackHeader, EmptyState, SectionHeader, Skeleton } from '@/components/ui';
import { useCategories, useProductsByIds, useVendors } from '@/data/queries';
import type { Category, Product, Vendor } from '@/data/types';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';

/** Stable empty fallbacks — a fresh `[]` each render would defeat the `useMemo`s below. */
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_VENDORS: Vendor[] = [];
const EMPTY_CATEGORIES: Category[] = [];

export default function FavoritesScreen() {
  const cartBarInset = useCartBarInset();
  const t = useT();
  const productIds = useFavoritesStore((s) => s.productIds);
  const vendorIds = useFavoritesStore((s) => s.vendorIds);
  const addItem = useCartStore((s) => s.addItem);

  // Only the favourited products, by id. This screen used to pull the entire
  // catalogue and filter it on the device to show a handful of cards.
  const productsQuery = useProductsByIds(productIds);
  const vendorsQuery = useVendors();
  const categoriesQuery = useCategories();

  const products = productsQuery.data ?? EMPTY_PRODUCTS;
  const vendors = vendorsQuery.data ?? EMPTY_VENDORS;
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;

  // `useProductsByIds` is disabled on an empty list, so it stays `pending`
  // forever with nothing favourited — which would hold the skeletons up on a
  // screen whose real answer is the empty state.
  const loading =
    (productIds.length > 0 && productsQuery.isPending) || vendorsQuery.isPending;

  // Derived from the store, so un-favouriting removes the card immediately
  // without a refetch.
  const favoriteProducts = useMemo(
    () => products.filter((p) => productIds.includes(p.id)),
    [products, productIds]
  );
  const favoriteVendors = useMemo(
    () => vendors.filter((v) => vendorIds.includes(v.id)),
    [vendors, vendorIds]
  );

  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  const isEmpty = !loading && favoriteProducts.length === 0 && favoriteVendors.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.favorites.title')} />

      {loading ? (
        <View className="px-5 gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} height={120} radius={20} />
          ))}
        </View>
      ) : isEmpty ? (
        <EmptyState
          icon={Heart}
          title={t('customer.favorites.emptyTitle')}
          description={t('customer.favorites.emptyBody')}
          actionLabel={t('customer.favorites.emptyAction')}
          onAction={() => router.replace(routes.customerHome)}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: cartBarInset + 24, gap: 28 }}>
          {favoriteVendors.length > 0 ? (
            <View className="gap-4">
              <SectionHeader title={t('customer.favorites.shops')} />
              <View className="px-5 gap-3">
                {favoriteVendors.map((vendor) => (
                  <VendorCard
                    key={vendor.id}
                    vendor={vendor}
                    onPress={() =>
                      router.push({ pathname: dynamicRoutes.vendorDetail, params: { id: vendor.id } })
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          {favoriteProducts.length > 0 ? (
            <View className="gap-4">
              <SectionHeader title={t('customer.favorites.products')} />
              <ProductGrid
                vendors={vendors}
                products={favoriteProducts}
                iconByCategory={iconByCategory}
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
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
