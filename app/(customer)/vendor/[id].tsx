import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Clock, Heart, MapPin, Star, StoreIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductGrid } from '@/components/customer';
import { Badge, CatalogImage, EmptyState, SectionHeader, Skeleton, Text } from '@/components/ui';
import { categoriesApi, productsApi, vendorsApi } from '@/data/api';
import type { Category, Product, Vendor } from '@/data/types';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { darkColors, lightColors } from '@/theme/colors';
import { mustard, terracotta } from '@/theme/tokens';

export default function VendorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const addItem = useCartStore((s) => s.addItem);
  const isFavorite = useFavoritesStore((s) => (id ? s.vendorIds.includes(id) : false));
  const toggleVendor = useFavoritesStore((s) => s.toggleVendor);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    Promise.all([
      vendorsApi.getVendorById(id),
      productsApi.getProductsByVendor(id),
      categoriesApi.getCategories(),
    ])
      .then(([v, p, c]) => {
        if (!active) return;
        setVendor(v ?? null);
        setProducts(p);
        setCategories(c);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  if (!loading && !vendor) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <EmptyState
          icon={StoreIcon}
          title="Commerce introuvable"
          description="Ce commerce n’est plus référencé ou le lien est expiré."
          actionLabel="Retour à l’accueil"
          onAction={() => router.replace(routes.customerHome)}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        <View>
          {loading || !vendor ? (
            <Skeleton height={200} radius={0} />
          ) : (
            <CatalogImage id={vendor.id} kind="vendor" radius={0} height={200} />
          )}

          {/* Controls float over the cover rather than sitting in a bar, so the
              image reads full-bleed on scroll. */}
          <View
            className="absolute left-5 right-5 flex-row items-center justify-between"
            style={{ top: insets.top + 6 }}
          >
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retour"
              onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.customerHome))}
              className="w-11 h-11 items-center justify-center rounded-full bg-card"
            >
              <ChevronLeft size={22} color={colors.foreground} strokeWidth={2.2} />
            </Pressable>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onPress={() => {
                if (!id) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleVendor(id);
              }}
              className="w-11 h-11 items-center justify-center rounded-full bg-card"
            >
              <Heart
                size={19}
                color={isFavorite ? terracotta[600] : colors.foreground}
                fill={isFavorite ? terracotta[600] : 'transparent'}
                strokeWidth={2}
              />
            </Pressable>
          </View>
        </View>

        <View className="-mt-6 rounded-t-[28px] bg-background px-5 pt-6 gap-5">
          {loading || !vendor ? (
            <View className="gap-3">
              <Skeleton height={28} width="60%" />
              <Skeleton height={16} width="40%" />
            </View>
          ) : (
            <View className="gap-3">
              <View className="flex-row items-start justify-between gap-3">
                <Text variant="title" weight="bold" className="flex-1 text-[25px] leading-[31px]">
                  {vendor.name}
                </Text>
                {vendor.isHalalCertified ? <Badge label="Halal" tone="success" /> : null}
              </View>

              <View className="flex-row items-center gap-1.5">
                <MapPin size={15} color={colors.mutedForeground} strokeWidth={2} />
                <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
                  {vendor.address.street}, {vendor.city}
                </Text>
              </View>

              <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-1.5">
                  <Star size={15} color={mustard[500]} fill={mustard[500]} strokeWidth={0} />
                  <Text variant="caption" weight="semibold">
                    {vendor.rating.toFixed(1)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    ({vendor.reviewCount})
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Clock size={15} color={colors.mutedForeground} strokeWidth={2} />
                  <Text variant="caption" tone="muted">
                    {vendor.deliveryEtaMin} min
                  </Text>
                </View>
                <Text variant="caption" tone="muted">
                  Livraison {formatCad(vendor.deliveryFeeCad)}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View className="mt-7 gap-4">
          <SectionHeader title={`Catalogue${products.length ? ` (${products.length})` : ''}`} />

          {!loading && products.length === 0 ? (
            <EmptyState
              icon={StoreIcon}
              title="Catalogue vide"
              description="Ce commerce n’a pas encore ajouté de produits."
            />
          ) : (
            <ProductGrid
              products={products}
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
      </ScrollView>
    </View>
  );
}
