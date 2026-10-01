import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { MapPin, MessageSquareWarning, ReceiptText, Sparkles, Store } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourierTrackingCard, DisputeSheet, OrderStatusTimeline } from '@/components/customer';
import { DeliveryMap } from '@/components/map';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useDeliveryProgress } from '@/hooks/useDeliveryProgress';
import { Badge, BackHeader, Button, EmptyState, PriceSummary, Reveal, Skeleton, Text } from '@/components/ui';
import { loyaltyApi, ordersApi, vendorsApi } from '@/data/api';
import type { Courier, DisputeReason, Order, Vendor } from '@/data/types';
import { formatCad, formatDate, formatTime } from '@/lib/format';
import { canOpenDispute, disputeReasonKey } from '@/lib/disputes';
import { useT } from '@/lib/i18n/useT';
import { isActiveStatus, orderStatusKey, orderStatusTone } from '@/lib/orderStatus';
import { routes } from '@/lib/routes';
import { orderReference } from '@/lib/orderRef';
import { shadows } from '@/theme/shadows';

export default function OrderDetailScreen() {
  const t = useT();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);

  // The courier's position is interpolated locally, so it moves smoothly
  // between fetches; this only has to catch *status* changes — a pickup, a
  // delivery — which is why eight seconds is plenty.
  const progress = useDeliveryProgress(order, vendor, courier);
  const live = useLiveCourierPosition(order);

  // "Votre commande est livrée : vous avez gagné 45 points" (client brief) —
  // there is no push notification pipeline in this prototype (see
  // `account/notifications.tsx`), so this is the honest version of it: a
  // banner that appears the moment *this screen* observes the order cross into
  // `delivered`, not on every visit to an order that already was. `null` on
  // the first render of a freshly loaded order, on purpose — a shopper opening
  // an old, already-delivered order should not be told they just earned points
  // for it again.
  const previousStatusRef = useRef<Order['status'] | null>(null);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);

  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!id) return;
    const found = await ordersApi.getOrderById(id);
    if (!activeRef.current) return;
    setOrder(found ?? null);
    if (!found) return;
    const v = await vendorsApi.getVendorById(found.vendorId);
    if (activeRef.current) setVendor(v ?? null);
    // The order carries its courier's card; `/couriers/me` is the courier's own file.
    if (activeRef.current) setCourier((found.delivery?.courier as Courier | undefined) ?? null);
  }, [id]);

  useEffect(() => {
    activeRef.current = true;
    setLoading(true);
    load().finally(() => {
      if (activeRef.current) setLoading(false);
    });
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  // The one place this app polls. Everywhere else a screen owns the change it
  // is showing; here the change is happening on someone else's phone, and a
  // tracking screen that only updates when you leave and come back is not a
  // tracking screen. Stops the moment the order is finished.
  const polling = Boolean(order && isActiveStatus(order.status));
  useFocusEffect(
    useCallback(() => {
      if (!polling) return;
      const timer = setInterval(() => void load(), 8000);
      return () => clearInterval(timer);
    }, [polling, load])
  );

  useEffect(() => {
    if (!order) return;
    const justDelivered = previousStatusRef.current !== null && previousStatusRef.current !== 'delivered';
    previousStatusRef.current = order.status;
    if (!justDelivered || order.status !== 'delivered') return;
    loyaltyApi.getTransactionForOrder(order.id).then((tx) => {
      if (tx) setPointsEarned(tx.points);
    });
  }, [order]);

  if (!loading && !order) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader />
        <EmptyState
          icon={ReceiptText}
          title={t('customer.orderNotFound')}
          description={t('customer.orderDetail.notFoundBody')}
          actionLabel={t('customer.orderDetail.seeOrders')}
          onAction={() => router.replace(routes.customerOrders)}
        />
      </SafeAreaView>
    );
  }



  async function report(reason: DisputeReason, message: string) {
    if (!order) return;
    const updated = await ordersApi.openDispute(order.id, { reason, message });
    if (updated) setOrder(updated);
    setReporting(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={order ? t('common.orderRef', { reference: orderReference(order) }) : t('common.order')} />

      {pointsEarned !== null ? (
        <Reveal className="px-5 pb-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.a11y.pointsEarned', { count: pointsEarned })}
            onPress={() => {
              setPointsEarned(null);
              router.push(routes.accountPoints);
            }}
            className="flex-row items-center gap-3 rounded-2xl bg-card p-4 active:opacity-80"
            style={shadows.floating}
          >
            <View className="w-10 h-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles size={18} color={colors.primary} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text variant="caption" weight="bold">
                {t('customer.orderDetail.delivered')}
              </Text>
              <Text variant="caption" tone="muted" className="text-[12px]">
                {t('customer.orderDetail.pointsEarned', { count: pointsEarned })}
              </Text>
            </View>
          </Pressable>
        </Reveal>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {loading || !order ? (
          <View className="px-5 gap-4">
            <Skeleton height={28} width="45%" />
            <Skeleton height={180} radius={20} />
            <Skeleton height={120} radius={20} />
          </View>
        ) : (
          <View className="px-5 gap-5">
            <View className="flex-row items-center justify-between gap-3">
              <View className="gap-1">
                <Text variant="caption" tone="muted">
                  {t('customer.orderDetail.placedAt', {
                    date: formatDate(order.createdAt),
                    time: formatTime(order.createdAt),
                  })}
                </Text>
                <Text variant="title" weight="bold" className="text-[24px]">
                  {formatCad(order.totalCad)}
                </Text>
              </View>
              {order ? (
                <Badge label={t(orderStatusKey(order.status))} tone={orderStatusTone[order.status]} />
              ) : null}
            </View>

            {/* The map only earns its place once someone is actually driving:
                before a courier accepts there is nothing to watch, and after
                delivery the timeline is the better record. */}
            {progress && progress.phase !== 'delivered' && courier ? (
              <Section title={t('customer.orderDetail.yourCourier')}>
                <View className="gap-3">
                  <View className="h-[200px] rounded-[20px] overflow-hidden">
                    <DeliveryMap
                      pickup={progress.pickup}
                      dropoff={progress.dropoff}
                      courier={live ?? progress.position}
                      bearing={live?.heading ?? progress.bearing}
                      route={progress.leg?.points}
                      progress={progress.progress}
                      variant="card"
                      interactive={false}
                    />
                  </View>
                  <CourierTrackingCard
                    courier={courier}
                    phase={progress.phase}
                    etaMin={progress.etaMin}
                    pin={order.delivery!.pin}
                  />
                </View>
              </Section>
            ) : null}

            <Section title={t('common.tracking')}>
              <OrderStatusTimeline order={order} courierName={courier?.fullName} />
            </Section>

            {order.dispute ? (
              <Section title={t('customer.orderDetail.issueReported')}>
                <View className="gap-3">
                  <View className="flex-row items-center gap-2">
                    <MessageSquareWarning size={16} color={colors.destructive} strokeWidth={2} />
                    <Text variant="caption" weight="bold" className="flex-1">
                      {t(disputeReasonKey(order.dispute.reason))}
                    </Text>
                    <Badge
                      label={
                        order.dispute.status === 'resolved'
                          ? t('customer.resolved')
                          : order.dispute.status === 'answered'
                            ? t('customer.answered')
                            : t('customer.orderDetail.disputePending')
                      }
                      tone={order.dispute.status === 'open' ? 'warning' : 'success'}
                      size="sm"
                    />
                  </View>
                  <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
                    {order.dispute.message}
                  </Text>

                  {/* The merchant's answer, when there is one. Settling the
                      dispute is the platform's job, so nothing here closes it. */}
                  {order.dispute.merchantReply ? (
                    <View className="rounded-2xl bg-muted p-3 gap-1">
                      <Text variant="label" tone="muted" className="text-[10px]">
                        {t('customer.orderDetail.shopReply')}
                      </Text>
                      <Text variant="caption" className="text-[13px] leading-[19px]">
                        {order.dispute.merchantReply}
                      </Text>
                    </View>
                  ) : (
                    <Text variant="caption" tone="muted" className="text-[12px]">
                      {t('customer.orderDetail.replyPending')}
                    </Text>
                  )}
                </View>
              </Section>
            ) : null}

            {vendor ? (
              <Section title={t('customer.orderDetail.shop')}>
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 items-center justify-center rounded-full bg-muted">
                    <Store size={18} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text variant="caption" weight="bold" numberOfLines={1}>
                      {vendor.name}
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[12px]">
                      {vendor.neighborhood} · {vendor.city}
                    </Text>
                  </View>
                </View>
              </Section>
            ) : null}

            <Section title={t('common.delivery')}>
              <View className="flex-row items-start gap-3">
                <View className="w-10 h-10 items-center justify-center rounded-full bg-muted">
                  <MapPin size={18} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="caption" weight="bold">
                    {order.deliveryAddress.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {order.deliveryAddress.street}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {order.deliveryAddress.city}, {order.deliveryAddress.postalCode}
                  </Text>
                </View>
              </View>
            </Section>

            <Section title={t('customer.checkout.items', { count: order.items.length })}>
              <View className="gap-3">
                {order.items.map((item) => (
                  <View key={item.productId} className="flex-row items-center justify-between gap-3">
                    <Text variant="caption" numberOfLines={1} className="flex-1">
                      {item.qty} × {item.name}
                    </Text>
                    <Text variant="caption" weight="semibold">
                      {formatCad(item.unitPriceCad * item.qty)}
                    </Text>
                  </View>
                ))}
                <View className="h-px bg-border my-1" />
                <PriceSummary
                  subtotalCad={order.subtotalCad}
                  gstCad={order.gstCad}
                  qstCad={order.qstCad}
                  deliveryFeeCad={order.deliveryFeeCad}
                  pointsDiscountCad={order.pointsDiscountCad}
                  totalCad={order.totalCad}
                />
              </View>
            </Section>
            {canOpenDispute(order) ? (
              <Button
                label={t('customer.orderDetail.reportProblem')}
                variant="outline"
                size="md"
                fullWidth
                icon={<MessageSquareWarning size={17} color={colors.primary} strokeWidth={2.2} />}
                onPress={() => setReporting(true)}
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      <DisputeSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        onSubmit={report}
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        {title}
      </Text>
      <View className="rounded-2xl bg-card p-4">{children}</View>
    </View>
  );
}

/** A ping older than this is a courier whose app went quiet, not a courier standing still. */
const LIVE_MAX_AGE_MS = 2 * 60_000;
const LIVE_POLL_MS = 10_000;

/**
 * The courier's real position from their phone's GPS, while the order is on the
 * road. `null` until the first fresh ping — the map then keeps the estimated
 * position from `useDeliveryProgress`, so it never goes blank mid-run.
 */
function useLiveCourierPosition(order: Order | null) {
  const [live, setLive] = useState<{ lat: number; lng: number; heading?: number } | null>(null);
  const onTheRoad = order?.status === 'ready' || order?.status === 'out_for_delivery';
  const orderId = order?.id;

  useEffect(() => {
    if (!onTheRoad || !orderId) {
      setLive(null);
      return;
    }
    let active = true;
    const poll = async () => {
      const ping = await ordersApi.getCourierLocation(orderId).catch(() => null);
      if (!active) return;
      const fresh = ping && Date.now() - Date.parse(ping.recordedAt) < LIVE_MAX_AGE_MS;
      setLive(fresh ? { lat: ping.lat, lng: ping.lng, heading: ping.heading ?? undefined } : null);
    };
    void poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [onTheRoad, orderId]);

  return live;
}
