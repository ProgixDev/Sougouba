import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, SearchX, StoreIcon } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VendorCard, useCartBarInset } from '@/components/customer';
import { Chip, EmptyState, ListFooter, Reveal, Skeleton, Text } from '@/components/ui';
import { vendorsApi } from '@/data/api';
import type { VendorType } from '@/data/types';
import { usePagedList } from '@/hooks/usePagedList';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { deliveryAddressFor } from '@/lib/deliveryAddress';
import { useT } from '@/lib/i18n/useT';
import { distanceKm } from '@/lib/geo';
import { dynamicRoutes, routes } from '@/lib/routes';
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

  const [active, setActive] = useState<FilterKey[]>([]);

  // Where the shopper actually takes delivery, so the distances are theirs and
  // not the city's. Same helper the cart prices against — a shop listed at
  // 3,4 km must not quote its delivery from somewhere else.
  const origin = useMemo(() => deliveryAddressFor(user), [user]);
  const near = origin.lat !== undefined && origin.lng !== undefined ? { lat: origin.lat, lng: origin.lng } : null;

  // Filtered and ordered by the API, a page at a time: open shops first, then
  // nearest the delivery point. Every shop in the vertical is reachable now,
  // not just the first 100.
  const list = usePagedList(
    ['vendors', 'vertical', vertical?.type, active.join(','), near?.lat, near?.lng],
    (offset, limit) =>
      vendorsApi.getVendorsPage(
        {
          type: vertical?.type as VendorType,
          halal: active.includes('halal'),
          maxEtaMin: active.includes('fast') ? FAST_ETA_MIN : undefined,
          openNow: active.includes('open'),
          near,
        },
        offset,
        limit
      ),
    { enabled: !!vertical }
  );
  const loading = list.loading;
  const listed = useMemo(
    () => list.items.map((vendor) => ({ vendor, km: distanceKm(origin, vendor.address) })),
    [list.items, origin]
  );

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
              shops: t(`domain.vertical.${vertical.type}.count`, { count: list.total }),
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
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={<ListFooter loading={list.loadingMore} />}
          renderItem={({ item, index }) => (
            <Reveal index={index % 20}>
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
