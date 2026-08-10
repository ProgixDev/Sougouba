import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductGrid, VendorCard } from '@/components/customer';
import { BackHeader, EmptyState, SectionHeader, Skeleton } from '@/components/ui';
import { categoriesApi, productsApi, vendorsApi } from '@/data/api';
import type { Category, Product, Vendor } from '@/data/types';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';

export default function FavoritesScreen() {
  const productIds = useFavoritesStore((s) => s.productIds);
  const vendorIds = useFavoritesStore((s) => s.vendorIds);
  const addItem = useCartStore((s) => s.addItem);

  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([productsApi.getProducts(), vendorsApi.getVendors(), categoriesApi.getCategories()])
      .then(([p, v, c]) => {
        if (!active) return;
        setProducts(p);
        setVendors(v);
        setCategories(c);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
      <BackHeader title="Favoris" />

      {loading ? (
        <View className="px-5 gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} height={120} radius={20} />
          ))}
        </View>
      ) : isEmpty ? (
        <EmptyState
          icon={Heart}
          title="Aucun favori"
          description="Touchez le cœur sur un produit ou un commerce pour le retrouver ici."
          actionLabel="Découvrir les commerces"
          onAction={() => router.replace(routes.customerHome)}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, gap: 28 }}>
          {favoriteVendors.length > 0 ? (
            <View className="gap-4">
              <SectionHeader title="Commerces" />
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
              <SectionHeader title="Produits" />
              <ProductGrid
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
