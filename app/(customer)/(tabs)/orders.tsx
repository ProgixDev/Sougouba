import { useFocusEffect, router } from 'expo-router';
import { ChevronRight, ReceiptText } from 'lucide-react-native';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, EmptyState, ListFooter, Reveal, Skeleton, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { ordersApi } from '@/data/api';
import { usePagedList } from '@/hooks/usePagedList';
import { formatCad, formatDate } from '@/lib/format';
import { orderStatusKey, orderStatusTone, orderSummaryLine } from '@/lib/orderStatus';
import { useT } from '@/lib/i18n/useT';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';
import { orderReference } from '@/lib/orderRef';

export default function CustomerOrdersScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  // A page at a time, newest first; each order carries its shop's name, so
  // there is no longer a list of every shop to fetch just to label the rows.
  const list = usePagedList(['orders', 'mine', user?.id], (offset, limit) => ordersApi.getMyOrdersPage(offset, limit), {
    enabled: !!user,
  });
  const orders = list.items;
  const loading = list.loading;

  // Refetch on focus: placing an order elsewhere in the stack must be reflected
  // when the shopper lands back here.
  const { reload } = list;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2 pb-5">
        <Text variant="title" weight="bold" className="text-[26px]">
          {t('customer.ordersScreen.title')}
        </Text>
      </View>

      {loading ? (
        <View className="px-5 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={92} radius={20} />
          ))}
        </View>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={t('customer.ordersScreen.emptyTitle')}
          description={t('customer.ordersScreen.emptyBody')}
          actionLabel={t('customer.ordersScreen.emptyAction')}
          onAction={() => router.replace(routes.customerHome)}
        />
      ) : (
        // A FlatList rather than a ScrollView: a shopper's history now runs to
        // dozens of orders, and mounting every row at once to show the four that
        // fit on screen is the whole reason this component exists.
        <FlatList
          data={orders}
          keyExtractor={(order) => order.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarInset + 24, gap: 12 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={<ListFooter loading={list.loadingMore} />}
          renderItem={({ item: order, index }) => {
            const statusLabel = t(orderStatusKey(order.status));
            return (
              <Reveal index={index % 20}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('customer.orders.rowA11y', {
                  reference: orderReference(order),
                  status: statusLabel,
                })}
                onPress={() =>
                  router.push({ pathname: dynamicRoutes.orderDetail, params: { id: order.id } })
                }
                className="flex-row items-center gap-3 rounded-[20px] bg-card p-4"
              >
                <View className="flex-1 gap-1.5">
                  <View className="flex-row items-center gap-2">
                    <Text variant="caption" weight="bold" numberOfLines={1} className="flex-1">
                      {order.vendorName ?? t('common.genericShop')}
                    </Text>
                    <Badge label={statusLabel} tone={orderStatusTone[order.status]} size="sm" />
                  </View>
                  <Text variant="caption" tone="muted" className="text-[12px]">
                    {t('customer.orders.summaryLine', {
                      date: formatDate(order.createdAt),
                      items: t(orderSummaryLine(order.items.length)),
                    })}
                  </Text>
                  <Text weight="bold" className="text-[15px]">
                    {formatCad(order.totalCad)}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
              </Reveal>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
