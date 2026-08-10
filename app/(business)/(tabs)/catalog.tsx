import { useFocusEffect, router } from 'expo-router';
import { PackagePlus, Plus, Store } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CounterHeader, onSlab } from '@/components/business';
import { SearchField } from '@/components/customer';
import { Badge, CatalogImage, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { categoriesApi, productsApi } from '@/data/api';
import type { Category, Product } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { categoryIcons } from '@/lib/categoryIcons';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';

const LOW_STOCK_THRESHOLD = 20;

export default function BusinessCatalogScreen() {
  const tabBarInset = useTabBarInset();
  const { vendor, loading: vendorLoading, missing } = useOwnerVendor();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!vendor) return;
    const [nextProducts, nextCategories] = await Promise.all([
      productsApi.getProductsByVendor(vendor.id),
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
      (p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [products, query]);

  const outOfStock = useMemo(
    () => products.filter((p) => p.isAvailable && p.stockQty <= LOW_STOCK_THRESHOLD).length,
    [products]
  );

  if (missing) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <EmptyState
          icon={Store}
          title="Aucune boutique associée"
          description="Ce compte commerçant n’est pas encore rattaché à une boutique."
        />
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <CounterHeader
        title="Catalogue"
        eyebrow={
          products.length > 0
            ? `${products.length} produits${outOfStock > 0 ? ` · ${outOfStock} à réapprovisionner` : ''}`
            : vendor?.name
        }
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter un produit"
            onPress={() => router.push(routes.businessProductNew)}
            className="flex-row items-center gap-1.5 rounded-full px-4 h-10 active:opacity-80"
            style={{ backgroundColor: onSlab.fill }}
          >
            <Plus size={16} color={onSlab.text} strokeWidth={2.5} />
            <Text variant="caption" weight="bold" style={{ color: onSlab.text }}>
              Ajouter
            </Text>
          </Pressable>
        }
      >
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher dans votre catalogue…"
        />
      </CounterHeader>

      {vendorLoading || loading ? (
        <View className="px-5 pt-5 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={84} radius={20} />
          ))}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(product) => product.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: tabBarInset + 24,
            gap: 12,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <EmptyState
              icon={PackagePlus}
              title={query ? 'Aucun résultat' : 'Catalogue vide'}
              description={
                query
                  ? 'Aucun produit ne correspond à cette recherche.'
                  : 'Ajoutez votre premier produit pour commencer à vendre.'
              }
              actionLabel={query ? undefined : 'Ajouter un produit'}
              onAction={query ? undefined : () => router.push(routes.businessProductNew)}
            />
          }
          renderItem={({ item: product, index }) => {
            const lowStock = product.isAvailable && product.stockQty <= LOW_STOCK_THRESHOLD;
            return (
              <Reveal index={index}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Modifier ${product.name}`}
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
                      {formatCad(product.priceCad)} · {product.stockQty} en stock
                    </Text>
                    <View className="flex-row gap-1.5 mt-0.5">
                      {!product.isAvailable ? (
                        <Badge label="Hors vente" tone="neutral" size="sm" />
                      ) : lowStock ? (
                        <Badge label="Stock faible" tone="warning" size="sm" />
                      ) : (
                        <Badge label="En vente" tone="success" size="sm" />
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
