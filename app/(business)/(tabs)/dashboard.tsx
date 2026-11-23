import { useFocusEffect, router } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CounterHeader, DayStrip, OrderQueueCard, PendingApproval, SlabMetric, StatColumns } from '@/components/business';
import { Reveal, SectionHeader, Skeleton, Text } from '@/components/ui';
import { ordersApi, productsApi } from '@/data/api';
import { usePlatformPlan } from '@/data/queries';
import type { ID, Order, Product } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { useVendorRecentOrders } from '@/hooks/useVendorRecentOrders';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { comparePeriods } from '@/lib/analytics';
import { customerName } from '@/lib/customerNames';
import { useT } from '@/lib/i18n/useT';
import { formatCad } from '@/lib/format';
import { nextStatusFor } from '@/lib/orderStatus';
import { dynamicRoutes, routes } from '@/lib/routes';
import { shopDay, shopStatusLine } from '@/lib/shopHours';

const LOW_STOCK_THRESHOLD = 20;
/** Enough to see the shape of the queue; the Commandes tab is one tap away for the rest. */
const QUEUE_PREVIEW = 4;

export default function BusinessDashboardScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const colors = useThemeColors();
  const { vendor, loading: vendorLoading, missing, pending } = useOwnerVendor();
  const plan = usePlatformPlan();

  // Two weeks of orders: this week and the one before, for the comparison.
  const recent = useVendorRecentOrders(14);
  const orders = recent.orders;
  const { load: loadRecent } = recent;
  const [queue, setQueue] = useState<Order[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<ID | null>(null);

  const load = useCallback(async () => {
    if (!vendor) return;
    const [, active, low] = await Promise.all([
      loadRecent(),
      // The queue, oldest first: the ticket that has waited longest needs a
      // decision first. One page is plenty for a preview.
      ordersApi.getVendorOrdersPage('active', 0, 20),
      // The four lowest stocks across the whole shelf, picked by the database.
      productsApi.getMyProductsPage({ maxStock: LOW_STOCK_THRESHOLD, sort: 'stock_asc' }, 0, 4),
    ]);
    setQueue(active.items);
    setQueueTotal(active.total);
    setLowStock(low.items);
  }, [vendor, loadRecent]);

  // Advancing an order elsewhere in the stack has to be reflected on return.
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

  const day = useMemo(() => (vendor ? shopDay(vendor) : null), [vendor]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((o) => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  // Subtotals, matching `summariseOrders` — the same word must not mean the
  // order total here and the goods sold on Analytique. Neither the TPS/TVQ the
  // shop remits nor the delivery fee it never sees is a receipt.
  const todayRevenue = useMemo(
    () =>
      todayOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.subtotalCad, 0),
    [todayOrders]
  );

  const week = useMemo(() => comparePeriods(orders, 7, plan.commissionRate), [orders, plan.commissionRate]);

  const topProducts = useMemo(() => week.current.topProducts.slice(0, 3), [week]);

  const busy = vendorLoading || loading;

  // A shop that is filed but not cleared is as unusable as no shop at all,
  // and for the merchant it is a different sentence — see `PendingApproval`.
  if (missing || pending) {
    return <PendingApproval state={missing ? 'missing' : 'pending'} />;
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <CounterHeader
          title={vendor?.name ?? t('business.metrics.yourShop')}
          eyebrow={day ? t(shopStatusLine(day)) : undefined}
          tradingState={day?.isOpen ? 'open' : 'closed'}
        >
          {/* The slab sits outside the loading branch so the shop's name and
              hours are up immediately. Its figures are not known yet, though,
              and rendering them as 0,00 $ reads as "you sold nothing today". */}
          <View className="flex-row items-end justify-between gap-4">
            <SlabMetric label={t('business.dashboard.revenueToday')} value={busy ? '—' : formatCad(todayRevenue)} />
            <SlabMetric label={t('business.dashboard.toHandle')} value={busy ? '—' : String(queueTotal)} align="right" />
          </View>
          {day ? <DayStrip day={day} orders={todayOrders} loading={busy} /> : null}
        </CounterHeader>

        {busy ? (
          <View className="px-5 pt-6 gap-3">
            <Skeleton height={132} radius={20} />
            <Skeleton height={132} radius={20} />
          </View>
        ) : (
          <>
            <View className="mt-7 gap-3.5">
              <SectionHeader
                title={t('business.dashboard.toHandle')}
                count={queueTotal}
                actionLabel={queueTotal > QUEUE_PREVIEW ? t('common.seeAllShort') : undefined}
                onAction={
                  queueTotal > QUEUE_PREVIEW
                    ? () => router.push(routes.businessOrders)
                    : undefined
                }
              />
              {queue.length === 0 ? (
                <View className="mx-5 rounded-[20px] bg-card p-5 items-center gap-1">
                  <Text variant="caption" weight="semibold">
                    {t('business.dashboard.emptyQueueTitle')}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-center text-[12px]">
                    {t('business.dashboard.emptyQueueBody')}
                  </Text>
                </View>
              ) : (
                <View className="px-5 gap-3">
                  {queue.slice(0, QUEUE_PREVIEW).map((order, index) => (
                    <Reveal key={order.id} index={index}>
                      <OrderQueueCard
                        order={order}
                        customerName={customerName(order) ?? t('common.genericCustomer')}
                        advancing={advancingId === order.id}
                        onAdvance={() => advance(order)}
                        onPress={() =>
                          router.push({
                            pathname: dynamicRoutes.businessOrderDetail,
                            params: { id: order.id },
                          })
                        }
                      />
                    </Reveal>
                  ))}
                </View>
              )}
            </View>

            <View className="mt-7 px-5">
              <Reveal>
                <StatColumns
                  title={t('business.metrics.last7Days')}
                  columns={[
                    {
                      label: t('business.metrics.revenue'),
                      value: formatCad(week.current.revenueCad),
                      deltaPct: week.revenueDeltaPct,
                    },
                    {
                      label: t('business.metrics.orders'),
                      value: String(week.current.orderCount),
                      deltaPct: week.orderDeltaPct,
                    },
                    {
                      label: t('business.metrics.avgBasket'),
                      value: formatCad(week.current.avgBasketCad),
                      deltaPct: week.basketDeltaPct,
                    },
                  ]}
                />
              </Reveal>
            </View>

            {topProducts.length > 0 ? (
              <View className="mt-7 gap-3.5">
                <SectionHeader
                  title={t('business.dashboard.topSellers')}
                  actionLabel={t('business.metrics.analytics')}
                  onAction={() => router.push(routes.businessAnalytics)}
                />
                <Reveal className="mx-5 rounded-[20px] bg-card overflow-hidden">
                  {topProducts.map((product, index) => (
                    <View key={product.productId}>
                      {index > 0 ? <View className="h-px bg-border ml-4" /> : null}
                      <View className="flex-row items-center gap-3 p-4">
                        <Text variant="caption" weight="semibold" numberOfLines={1} className="flex-1">
                          {product.name}
                        </Text>
                        <Text variant="caption" weight="bold" tone="primary">
                          {product.qty} vendus
                        </Text>
                      </View>
                    </View>
                  ))}
                </Reveal>
              </View>
            ) : null}

            {lowStock.length > 0 ? (
              <View className="mt-7 gap-3.5">
                <SectionHeader
                  title="Stock faible"
                  count={lowStock.length}
                  actionLabel="Catalogue"
                  onAction={() => router.push(routes.businessCatalog)}
                />
                <Reveal className="mx-5 rounded-[20px] bg-card overflow-hidden">
                  {lowStock.map((product, index) => (
                    <View key={product.id}>
                      {index > 0 ? <View className="h-px bg-border ml-4" /> : null}
                      <View className="flex-row items-center gap-3 p-4">
                        <TriangleAlert size={16} color={colors.accent} strokeWidth={2} />
                        <Text variant="caption" weight="semibold" numberOfLines={1} className="flex-1">
                          {product.name}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {product.stockQty} restants
                        </Text>
                      </View>
                    </View>
                  ))}
                </Reveal>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
