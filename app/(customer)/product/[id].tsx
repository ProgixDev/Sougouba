import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Heart, MapPin, PackageX } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NutritionRow } from '@/components/customer';
import { Badge, Button, CatalogImage, EmptyState, Skeleton, Text } from '@/components/ui';
import { categoriesApi, productsApi, vendorsApi } from '@/data/api';
import type { Category, Product, Vendor } from '@/data/types';
import { categoryIcons } from '@/lib/categoryIcons';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { darkColors, lightColors } from '@/theme/colors';
import { forest, neutral, terracotta } from '@/theme/tokens';

const HERO_HEIGHT = 330;

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const addItem = useCartStore((s) => s.addItem);
  const isFavorite = useFavoritesStore((s) => (id ? s.productIds.includes(id) : false));
  const toggleProduct = useFavoritesStore((s) => s.toggleProduct);

  const [product, setProduct] = useState<Product | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    productsApi
      .getProductById(id)
      .then(async (found) => {
        if (!active) return;
        setProduct(found ?? null);
        if (!found) return;
        const [v, c] = await Promise.all([
          vendorsApi.getVendorById(found.vendorId),
          categoriesApi.getCategoryById(found.categoryId),
        ]);
        if (!active) return;
        setVendor(v ?? null);
        setCategory(c ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(routes.customerHome);
  }

  if (!loading && !product) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <EmptyState
          icon={PackageX}
          title="Produit introuvable"
          description="Ce produit n’est plus disponible ou le lien est expiré."
          actionLabel="Retour à l’accueil"
          onAction={() => router.replace(routes.customerHome)}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Hero sits on its own soft field; the sheet below overlaps it by design. */}
      <LinearGradient
        colors={colorScheme === 'dark' ? [forest[950], colors.background] : [forest[50], colors.background]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HERO_HEIGHT + 80 }}
      />

      <View
        className="flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 6, paddingBottom: 4 }}
      >
        <CircleButton label="Retour" onPress={goBack}>
          <ChevronLeft size={22} color={colors.foreground} strokeWidth={2.2} />
        </CircleButton>

        <Text variant="subtitle" weight="bold" className="text-[17px]">
          Détails
        </Text>

        <CircleButton
          label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onPress={() => {
            if (!id) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleProduct(id);
          }}
        >
          <Heart
            size={19}
            color={isFavorite ? terracotta[600] : colors.foreground}
            fill={isFavorite ? terracotta[600] : 'transparent'}
            strokeWidth={2}
          />
        </CircleButton>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="items-center justify-center px-8" style={{ height: HERO_HEIGHT }}>
          {loading || !product ? (
            <Skeleton width={240} height={240} radius={28} />
          ) : (
            <MotiView
              from={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'timing', duration: 420 }}
            >
              <CatalogImage
                id={product.id}
                kind="product"
                icon={category ? categoryIcons[category.icon] : undefined}
                radius={28}
                height={260}
                width={260}
              />
            </MotiView>
          )}
        </View>

        <View className="rounded-t-[30px] bg-card px-6 pt-7 gap-5" style={{ minHeight: 360 }}>
          {loading || !product ? (
            <View className="gap-4">
              <Skeleton height={30} width="70%" />
              <Skeleton height={18} width="45%" />
              <Skeleton height={72} radius={16} />
            </View>
          ) : (
            <>
              <View className="gap-3">
                <View className="flex-row items-start justify-between gap-4">
                  <Text variant="title" weight="bold" className="flex-1 text-[27px] leading-[33px]">
                    {product.name}
                  </Text>
                  {!product.isAvailable ? <Badge label="Épuisé" tone="neutral" /> : null}
                </View>

                <View className="flex-row items-center justify-between gap-4">
                  <Pressable
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir ${vendor?.name ?? 'le commerce'}`}
                    onPress={() =>
                      vendor &&
                      router.push({
                        pathname: dynamicRoutes.vendorDetail,
                        params: { id: vendor.id },
                      })
                    }
                    className="flex-1 flex-row items-center gap-1.5"
                  >
                    <MapPin size={15} color={colors.mutedForeground} strokeWidth={2} />
                    <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                      {vendor ? `${vendor.name} · ${vendor.neighborhood}` : '—'}
                    </Text>
                  </Pressable>

                  <View className="items-end">
                    <Text variant="title" weight="bold" className="text-[23px] leading-[27px]">
                      {formatCad(product.priceCad)}
                    </Text>
                    {product.compareAtPriceCad ? (
                      <Text variant="caption" tone="muted" className="line-through text-[12px]">
                        {formatCad(product.compareAtPriceCad)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <View className="gap-2">
                <Text variant="subtitle" weight="semibold" className="text-[17px]">
                  Description
                </Text>
                <Text variant="body" tone="muted">
                  {product.description}
                </Text>
              </View>

              <NutritionRow nutrition={product.nutrition} />

              {product.tags.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <Badge key={tag} label={tag} tone="primary" size="sm" />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {/* Pinned CTA: the price is on the button so the decision needs no scroll-back. */}
      <View
        className="px-6 pt-3 bg-card border-t border-border"
        style={{ paddingBottom: insets.bottom + 10 }}
      >
        <Button
          label={
            product && product.isAvailable
              ? `Ajouter au panier — ${formatCad(product.priceCad)}`
              : 'Produit épuisé'
          }
          variant="cta"
          size="lg"
          fullWidth
          disabled={!product || !product.isAvailable}
          loading={loading}
          onPress={() => {
            if (!product) return;
            addItem({
              productId: product.id,
              vendorId: product.vendorId,
              unitPriceCad: product.priceCad,
            });
          }}
        />
      </View>
    </View>
  );
}

/** The floating circular controls in the hero — back and favourite. */
function CircleButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="w-11 h-11 items-center justify-center rounded-full bg-card"
      style={CIRCLE_SHADOW}
    >
      {children}
    </Pressable>
  );
}

const CIRCLE_SHADOW = {
  shadowColor: '#0A2018',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 7,
  elevation: 2,
};
