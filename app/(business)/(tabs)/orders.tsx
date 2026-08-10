import { useFocusEffect, router } from 'expo-router';
import { Inbox, Store } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CounterHeader, OrderQueueCard } from '@/components/business';
import { Chip, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { ordersApi } from '@/data/api';
import type { ID, Order } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { customerLabel } from '@/lib/customerNames';
import { formatCad } from '@/lib/format';
import { isActiveStatus, nextStatus } from '@/lib/orderStatus';
import { dynamicRoutes } from '@/lib/routes';

type Filter = 'active' | 'delivered' | 'cancelled' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'À traiter' },
  { key: 'delivered', label: 'Livrées' },
  { key: 'cancelled', label: 'Annulées' },
  { key: 'all', label: 'Toutes' },
];

export default function BusinessOrdersScreen() {
  const tabBarInset = useTabBarInset();
  const { vendor, loading: vendorLoading, missing } = useOwnerVendor();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<ID | null>(null);

  const load = useCallback(async () => {
    if (!vendor) return;
    setOrders(await ordersApi.getOrdersByVendor(vendor.id));
  }, [vendor]);

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

  const advance = useCallback(
    async (order: Order) => {
      const next = nextStatus(order.status);
      if (!next) return;
      setAdvancingId(order.id);
      await ordersApi.updateOrderStatus(order.id, next, new Date().toISOString());
      await load();
      setAdvancingId(null);
    },
    [load]
  );

  const counts = useMemo(
    () => ({
      active: orders.filter((o) => isActiveStatus(o.status)).length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      all: orders.length,
    }),
    [orders]
  );

  const visible = useMemo(() => {
    switch (filter) {
      case 'active':
        // Oldest first while there is something to do about them; everywhere
        // else newest-first is what you want.
        return orders
          .filter((o) => isActiveStatus(o.status))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case 'delivered':
        return orders.filter((o) => o.status === 'delivered');
      case 'cancelled':
        return orders.filter((o) => o.status === 'cancelled');
      default:
        return orders;
    }
  }, [orders, filter]);

  const visibleTotal = useMemo(
    () => visible.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalCad, 0),
    [visible]
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
      <CounterHeader title="Commandes" eyebrow={vendor?.name} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-5 gap-2 py-4"
        // A row of chips inside a vertical list would scroll away; keeping it
        // pinned means the queue can always be re-filtered from where you are.
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map(({ key, label }) => (
          <Chip
            key={key}
            label={counts[key] > 0 ? `${label} (${counts[key]})` : label}
            selected={filter === key}
            onPress={() => setFilter(key)}
          />
        ))}
      </ScrollView>

      {vendorLoading || loading ? (
        <View className="px-5 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={132} radius={20} />
          ))}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(order) => order.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: tabBarInset + 24,
            gap: 12,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            visible.length > 0 ? (
              <Text variant="caption" tone="muted" className="text-[12px]">
                {visible.length} {visible.length === 1 ? 'commande' : 'commandes'}
                {filter !== 'cancelled' ? ` · ${formatCad(visibleTotal)}` : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={Inbox}
              title={filter === 'active' ? 'Rien en attente' : 'Aucune commande'}
              description={
                filter === 'active'
                  ? 'Les nouvelles commandes apparaîtront ici dès qu’un client passe commande.'
                  : 'Rien à afficher pour ce filtre.'
              }
            />
          }
          renderItem={({ item, index }) => (
            // The stagger caps at four rows, so a long history does not animate
            // in as a queue — see Reveal.
            <Reveal index={index}>
              <OrderQueueCard
                order={item}
                customerName={customerLabel(item)}
                advancing={advancingId === item.id}
                onAdvance={() => advance(item)}
                onPress={() =>
                  router.push({
                    pathname: dynamicRoutes.businessOrderDetail,
                    params: { id: item.id },
                  })
                }
              />
            </Reveal>
          )}
        />
      )}
    </View>
  );
}
