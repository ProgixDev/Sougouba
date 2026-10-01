import { router } from 'expo-router';
import { Clock, ShoppingCart, Store } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CartItemRow } from '@/components/customer';
import { useT } from '@/lib/i18n/useT';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { Button, EmptyState, PriceSummary, Reveal, Skeleton, Text } from '@/components/ui';
import { categoriesApi } from '@/data/api';
import type { Category } from '@/data/types';
import { useCartDetails } from '@/hooks/useCartDetails';
import { formatCad } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';

export default function CartScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const colors = useThemeColors();
  const {
    lines,
    vendor,
    subtotalCad,
    gstCad,
    qstCad,
    deliveryFeeCad,
    deliveryDistanceKm,
    totalCad,
    loading,
  } = useCartDetails();
  const setQty = useCartStore((s) => s.setQty);
  const clear = useCartStore((s) => s.clear);

  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    categoriesApi.getCategories().then(setCategories);
  }, []);

  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  const isEmpty = lines.length === 0 && !loading;

  if (isEmpty) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <Header onClear={undefined} />
        <EmptyState
          icon={ShoppingCart}
          title={t('customer.cart.emptyTitle')}
          description={t('customer.cart.emptyBody')}
          actionLabel={t('customer.cart.emptyAction')}
          onAction={() => router.replace(routes.customerHome)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Header onClear={lines.length > 0 ? clear : undefined} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* One shop per cart, so the shop banner belongs at the top rather than
            repeated on every line. */}
        {vendor ? (
          <View className="mx-5 mb-5 flex-row items-center gap-3 rounded-2xl bg-muted px-4 py-3">
            <View className="w-9 h-9 items-center justify-center rounded-full bg-card">
              <Store size={17} color={colors.mutedForeground} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text variant="caption" weight="bold" numberOfLines={1}>
                {vendor.name}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Clock size={12} color={colors.mutedForeground} strokeWidth={2} />
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {t('customer.cart.deliveryEta', { minutes: vendor.deliveryEtaMin })}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {loading ? (
          <View className="px-5 gap-5">
            {[0, 1].map((i) => (
              <View key={i} className="flex-row items-center gap-3">
                <Skeleton width={64} height={64} radius={12} />
                <View className="flex-1 gap-2">
                  <Skeleton height={14} width="70%" />
                  <Skeleton height={12} width="40%" />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="px-5 gap-5">
            {lines.map(({ item, product }, index) => (
              <Reveal key={item.productId} index={index}>
                <CartItemRow
                  item={item}
                  product={product}
                  categoryIcon={iconByCategory[product.categoryId]}
                  onChangeQty={(qty) => setQty(item.productId, qty)}
                />
              </Reveal>
            ))}
          </View>
        )}

        <View className="mx-5 mt-7 rounded-2xl bg-card p-4">
          <PriceSummary
            subtotalCad={subtotalCad}
            gstCad={gstCad}
            qstCad={qstCad}
            deliveryFeeCad={deliveryFeeCad}
            deliveryDistanceKm={deliveryDistanceKm}
            totalCad={totalCad}
          />
        </View>
      </ScrollView>

      <View
        className="px-5 pt-3 bg-card border-t border-border"
        style={{ paddingBottom: tabBarInset + 12 }}
      >
        <Button
          label={t('customer.cartCta', { total: formatCad(totalCad) })}
          variant="cta"
          size="lg"
          fullWidth
          disabled={lines.length === 0}
          loading={loading}
          onPress={() => router.push(routes.checkout)}
        />
      </View>
    </SafeAreaView>
  );
}

function Header({ onClear }: { onClear?: () => void }) {
  const t = useT();
  return (
    <View className="flex-row items-center justify-between px-5 pt-2 pb-5">
      <Text variant="title" weight="bold" className="text-[26px]">
        {t('customer.cart.title')}
      </Text>
      {onClear ? (
        <Text
          variant="caption"
          weight="semibold"
          tone="destructive"
          accessibilityRole="button"
          onPress={onClear}
        >
          {t('customer.cart.clear')}
        </Text>
      ) : null}
    </View>
  );
}
