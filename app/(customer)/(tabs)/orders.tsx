import { useFocusEffect, router } from 'expo-router';
import { ChevronRight, ReceiptText } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { ordersApi, vendorsApi } from '@/data/api';
import type { ID, Order } from '@/data/types';
import { formatCad, formatDate } from '@/lib/format';
import { orderStatusMeta, orderSummaryLine } from '@/lib/orderStatus';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';
import { orderReference } from '@/lib/orderRef';

export default function CustomerOrdersScreen() {
  const tabBarInset = useTabBarInset();
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vendorNames, setVendorNames] = useState<Record<ID, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [next, vendors] = await Promise.all([
      ordersApi.getOrdersByCustomer(user.id),
      vendorsApi.getVendors(),
    ]);
    setOrders(next);
    setVendorNames(Object.fromEntries(vendors.map((v) => [v.id, v.name])));
  }, [user]);

  // Refetch on focus: placing an order elsewhere in the stack must be reflected
  // when the shopper lands back here, and the mock store is mutated in place.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2 pb-5">
        <Text variant="title" weight="bold" className="text-[26px]">
          Commandes
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
          title="Aucune commande"
          description="Vos commandes passées apparaîtront ici avec leur suivi en direct."
          actionLabel="Découvrir les commerces"
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item: order, index }) => {
            const meta = orderStatusMeta[order.status];
            return (
              <Reveal index={index}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Commande ${orderReference(order)}, ${meta.label}`}
                onPress={() =>
                  router.push({ pathname: dynamicRoutes.orderDetail, params: { id: order.id } })
                }
                className="flex-row items-center gap-3 rounded-[20px] bg-card p-4"
              >
                <View className="flex-1 gap-1.5">
                  <View className="flex-row items-center gap-2">
                    <Text variant="caption" weight="bold" numberOfLines={1} className="flex-1">
                      {vendorNames[order.vendorId] ?? 'Commerce'}
                    </Text>
                    <Badge label={meta.label} tone={meta.tone} size="sm" />
                  </View>
                  <Text variant="caption" tone="muted" className="text-[12px]">
                    {formatDate(order.createdAt)} · {orderSummaryLine(order.items.length)}
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
