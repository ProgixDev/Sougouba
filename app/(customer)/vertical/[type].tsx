import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, SearchX, StoreIcon } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VendorCard, useCartBarInset } from '@/components/customer';
import { Chip, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { vendorsApi } from '@/data/api';
import type { Vendor, VendorType } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { deliveryAddressFor } from '@/lib/deliveryAddress';
import { useT } from '@/lib/i18n/useT';
import { distanceKm } from '@/lib/geo';
import { dynamicRoutes, routes } from '@/lib/routes';
import { shopDay } from '@/lib/shopHours';
import { verticalFor } from '@/lib/verticals';
import { useSessionStore } from '@/store/useSessionStore';

type FilterKey = 'open' | 'halal' | 'fast';

/** Keys, not sentences — module scope. Wording is `customer.vendorFilters.*`. */
const FILTERS: FilterKey[] = ['open', 'halal', 'fast'];

/** What "livraison rapide" means, in minutes. */
const FAST_ETA_MIN = 30;

/**
 * Level 1 of the two-level browse the CDC addendum specifies: every shop in one
 * vertical, before any product is shown.
 *
 * Reached by `push` rather than `replace` — the shopper is meant to come back
 * here from a shop, and popping onto a screen that had been torn down would lose
 * the filters and the scroll position they left behind.
 */
export default function VerticalScreen() {
  const cartBarInset = useCartBarInset();
  const t = useT();
  const { type } = useLocalSearchParams<{ type: string }>();
  const vertical = verticalFor(type);
  const colors = useThemeColors();
  const tabBarInset = useTabBarInset();
  const user = useSessionStore((s) => s.user);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<FilterKey[]>([]);

  useEffect(() => {
    if (!vertical) return;
    let alive = true;
    setLoading(true);
    vendorsApi
      .getVendorsByType(vertical.type as VendorType)
      .then((list) => {
        if (alive) setVendors(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [vertical]);

  // Where the shopper actually takes delivery, so the distances are theirs and
  // not the city's. Same helper the cart prices against — a shop listed at
  // 3,4 km must not quote its delivery from somewhere else.
  const origin = useMemo(() => deliveryAddressFor(user), [user]);

  const listed = useMemo(() => {
    const kept = vendors.filter((vendor) => {
      if (active.includes('halal') && !vendor.isHalalCertified) return false;
      if (active.includes('fast') && vendor.deliveryEtaMin > FAST_ETA_MIN) return false;
      if (active.includes('open') && !shopDay(vendor).isOpen) return false;
      return true;
    });

    return kept
      .map((vendor) => ({ vendor, km: distanceKm(origin, vendor.address) }))
      // Nearest first — the one question a shop list is asked that a shop cannot
      // answer for itself. Open shops still sort above closed ones, since a
      // closed shop is not somewhere an order can go right now.
      .sort((a, b) => {
        const openDelta = Number(shopDay(b.vendor).isOpen) - Number(shopDay(a.vendor).isOpen);
        return openDelta !== 0 ? openDelta : a.km - b.km;
      });
  }, [vendors, active, origin]);

  const toggle = useCallback((key: FilterKey) => {
    setActive((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  }, []);

  if (!vertical) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <EmptyState
          icon={StoreIcon}
          title={t('customer.verticalScreen.notFoundTitle')}
          description={t('customer.verticalScreen.notFoundBody')}
          actionLabel={t('customer.orderConfirmed.home')}
          onAction={() => router.replace(routes.customerHome)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center h-12 px-4">
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.ui.back')}
          // Not `BackHeader`: its no-history fallback is the auth welcome
          // screen, which is the wrong destination for a shopper who opened
          // this list from a link.
          onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.customerHome))}
          className="w-10 h-10 items-center justify-center rounded-full -ml-2"
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
      </View>

      <View className="px-5 pb-4 gap-1">
        <Text variant="title" weight="bold" className="text-[26px]">
          {t(`domain.vertical.${vertical.type}.title`)}
        </Text>
        {loading ? (
          <Skeleton height={16} width={140} radius={6} />
        ) : (
          <Text variant="caption" tone="muted">
            {t('customer.vertical.listSummary', {
              shops: t(`domain.vertical.${vertical.type}.count`, { count: listed.length }),
            })}
          </Text>
        )}
      </View>

      <View className="flex-row gap-2 px-5 pb-4">
        {FILTERS.map((filter) => (
          <Chip
            key={filter}
            label={t(`customer.vendorFilters.${filter}`)}
            selected={active.includes(filter)}
            onPress={() => toggle(filter)}
          />
        ))}
      </View>

      {loading ? (
        <View className="px-5 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={232} radius={20} />
          ))}
        </View>
      ) : (
        <FlatList
          data={listed}
          keyExtractor={({ vendor }) => vendor.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: tabBarInset + cartBarInset + 28,
            gap: 16,
          }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Reveal index={index}>
              <VendorCard
                vendor={item.vendor}
                layout="row"
                distanceKm={item.km}
                onPress={() =>
                  router.push({
                    pathname: dynamicRoutes.vendorDetail,
                    params: { id: item.vendor.id },
                  })
                }
              />
            </Reveal>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={SearchX}
              title={t('customer.verticalScreen.noMatchTitle')}
              description={t('customer.verticalScreen.noMatchBody')}
              actionLabel={t('customer.filters.clear')}
              onAction={() => setActive([])}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
