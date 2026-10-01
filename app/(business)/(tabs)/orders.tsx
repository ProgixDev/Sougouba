import { useFocusEffect, router } from 'expo-router';
import { Inbox, ShieldCheck } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CounterHeader, OrderQueueCard, PendingApproval } from '@/components/business';
import { Chip, EmptyState, Reveal, Skeleton, Text } from '@/components/ui';
import { ordersApi } from '@/data/api';
import type { ID, Order } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { customerName } from '@/lib/customerNames';
import { useT } from '@/lib/i18n/useT';
import { formatCad } from '@/lib/format';
import { isActiveStatus, nextStatusFor } from '@/lib/orderStatus';
import { dynamicRoutes } from '@/lib/routes';

type Filter = 'active' | 'disputes' | 'delivered' | 'cancelled' | 'all';

const FILTERS: Filter[] = [
  'active',
  // Second, not last: a complaint is the other thing in this queue that is
  // waiting on the merchant, and it does not appear under "À traiter" because a
  // disputed order has usually already been delivered.
  'disputes',
  'delivered',
  'cancelled',
  'all',
];

export default function BusinessOrdersScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const { vendor, loading: vendorLoading, missing, pending, reload } = useOwnerVendor();
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
      // Merchant-scoped: at `ready` this is null, because handing the bag over
      // is the courier's move, not a button the shop can press on their behalf.
      const next = nextStatusFor(order.status, 'merchant');
      if (!next) return;
      setAdvancingId(order.id);
      await ordersApi.updateOrderStatus(order.id, next, new Date().toISOString());
      await load();
      setAdvancingId(null);
    },
    [load]
  );

  const counts = useMemo<Record<Filter, number>>(
    () => ({
      active: orders.filter((o) => isActiveStatus(o.status)).length,
      // Counts what is waiting on the merchant, not the whole history — a chip
      // reading "Litiges (9)" beside nine already answered is a false alarm.
      disputes: orders.filter((o) => o.dispute && o.dispute.status === 'open').length,
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
      case 'disputes':
        // Unanswered first — the answered ones are here for the record.
        return orders
          .filter((o) => o.dispute)
          .sort((a, b) => {
            const pending = Number(a.dispute?.status !== 'open') - Number(b.dispute?.status !== 'open');
            return pending !== 0 ? pending : b.createdAt.localeCompare(a.createdAt);
          });
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

  // A shop that is filed but not cleared is as unusable as no shop at all,
  // and for the merchant it is a different sentence — see `PendingApproval`.
  if (missing || pending) {
    return <PendingApproval state={missing ? 'missing' : 'pending'} onApproved={reload} />;
  }

  return (
    <View className="flex-1 bg-background">
      <CounterHeader title={t('business.metrics.orders')} eyebrow={vendor?.name} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-5 gap-2 py-4"
        // A row of chips inside a vertical list would scroll away; keeping it
        // pinned means the queue can always be re-filtered from where you are.
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map((key) => {
          const label = t(`business.orderFilters.${key}`);
          return (
            <Chip
              key={key}
              label={counts[key] > 0 ? `${label} (${counts[key]})` : label}
              selected={filter === key}
              onPress={() => setFilter(key)}
            />
          );
        })}
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
                {filter === 'disputes'
                  ? t('business.counts.disputes', { count: visible.length })
                  : t('business.counts.orders', { count: visible.length })}
                {filter !== 'cancelled' && filter !== 'disputes'
                  ? ` · ${formatCad(visibleTotal)}`
                  : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={filter === 'disputes' ? ShieldCheck : Inbox}
              title={
                filter === 'active'
                  ? 'Rien en attente'
                  : filter === 'disputes'
                    ? t('business.queue.noDisputes')
                    : t('business.queue.noOrders')
              }
              description={
                filter === 'active'
                  ? t('business.ordersEmpty.none')
                  : filter === 'disputes'
                    ? t('business.ordersEmpty.noDisputes')
                    : t('business.ordersEmpty.noneForFilter')
              }
            />
          }
          renderItem={({ item, index }) => (
            // The stagger caps at four rows, so a long history does not animate
            // in as a queue — see Reveal.
            <Reveal index={index}>
              <OrderQueueCard
                order={item}
                customerName={customerName(item) ?? t('common.genericCustomer')}
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
