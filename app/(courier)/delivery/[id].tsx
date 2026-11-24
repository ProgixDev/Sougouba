import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { DoorOpen, Hand, KeyRound, MapPin, MessageSquare, Navigation, NotebookPen, Store, TriangleAlert, Undo2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeliveryMap } from '@/components/map';
import { BackHeader, Button, EmptyState, Skeleton, Text } from '@/components/ui';
import { couriersApi, ordersApi, vendorsApi } from '@/data/api';
import type { Courier, DeliveryInstructions, Order, Vendor } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useDeliveryProgress } from '@/hooks/useDeliveryProgress';
import { useOrderChatUnread } from '@/hooks/useOrderChatUnread';
import { useOwnPosition } from '@/hooks/useOwnPosition';
import { canReleaseRun } from '@/lib/cancellation';
import { formatCad } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { formatDistance } from '@/lib/geo';
import { courierActionKey, nextStatusFor } from '@/lib/orderStatus';
import { orderReference } from '@/lib/orderRef';
import { dynamicRoutes } from '@/lib/routes';
import { useDispatchStore } from '@/store/useDispatchStore';

/**
 * One run, in full.
 *
 * The map stays at the top because it is still the thing being acted on, but
 * this screen can afford what the driving surface cannot: the items to collect,
 * the exact addresses, the customer's code, and a way out if something is wrong.
 *
 * Navigation hands off to the phone's own maps app rather than trying to be a
 * turn-by-turn engine. Mapbox draws the picture; Apple and Google own the voice.
 */
export default function CourierDeliveryScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const setActiveOrder = useDispatchStore((s) => s.setActiveOrder);

  const [order, setOrder] = useState<Order | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const own = useOwnPosition(Boolean(order?.delivery) && order?.status !== 'delivered' && order?.status !== 'cancelled');
  const progress = useDeliveryProgress(order, vendor, courier, own);
  const running = Boolean(order?.delivery) && order?.status !== 'delivered' && order?.status !== 'cancelled';
  const chatUnread = useOrderChatUnread('courier', order?.id, running);

  const load = useCallback(async () => {
    const found = await ordersApi.getOrderById(id);
    setOrder(found ?? null);
    if (found) {
      setVendor((await vendorsApi.getVendorById(found.vendorId)) ?? null);
      if (found.delivery) {
        setCourier((await couriersApi.getCourierById(found.delivery.courierId)) ?? null);
      }
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function advance() {
    if (!order || busy) return;
    const next = nextStatusFor(order.status, 'courier');
    if (!next) return;
    if (next === 'delivered') {
      router.push({ pathname: dynamicRoutes.courierProof, params: { id: order.id } });
      return;
    }
    setBusy(true);
    try {
      const updated = await ordersApi.markPickedUp(order.id, new Date().toISOString());
      if (updated) setOrder(updated);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Opens the platform's maps app. `maps://` on iOS, `geo:` on Android — both
   * fall back to a Google Maps URL, which every device can open one way or
   * another.
   */
  function navigateTo(lat: number, lng: number, label: string) {
    const encoded = encodeURIComponent(label);
    const url =
      Platform.OS === 'ios'
        ? `maps://?daddr=${lat},${lng}&q=${encoded}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
    );
  }

  const actionKey = order ? courierActionKey(order.status) : null;
  const actionLabel = actionKey ? t(actionKey) : null;
  const towardsShop = progress?.phase === 'to_pickup' || progress?.phase === 'awaiting_pickup';
  const target = towardsShop ? vendor?.address : order?.deliveryAddress;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={order ? `Course ${orderReference(order)}` : 'Course'} />

      {loading ? (
        <View className="px-5 gap-4">
          <Skeleton height={200} radius={20} />
          <Skeleton height={120} radius={20} />
        </View>
      ) : !order || !order.delivery ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon={Navigation}
            title="Course introuvable"
            description={t('courier.delivery.notFound')}
          />
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 28, gap: 20 }}
          >
            <View className="h-[220px] mx-5 rounded-[20px] overflow-hidden">
              <DeliveryMap
                pickup={progress?.pickup ?? order.deliveryAddress}
                dropoff={progress?.dropoff ?? order.deliveryAddress}
                courier={progress?.position}
                bearing={progress?.bearing ?? 0}
                route={progress?.leg?.points}
                progress={progress?.progress ?? 0}
                variant="card"
                interactive={false}
              />
            </View>

            <View className="px-5 gap-5">
              <Stop
                icon={Store}
                tint={colors.primary}
                active={Boolean(towardsShop)}
                title={vendor?.name ?? t('common.genericShop')}
                lines={[vendor?.address.street ?? '', `${vendor?.address.city ?? ''}`]}
                etaMin={towardsShop ? (progress?.etaMin ?? undefined) : undefined}
                onNavigate={
                  vendor
                    ? () => navigateTo(vendor.address.lat, vendor.address.lng, vendor.name)
                    : undefined
                }
              />

              <Stop
                icon={MapPin}
                tint={colors.secondary}
                active={progress?.phase === 'to_dropoff'}
                title={order.deliveryAddress.street}
                lines={[
                  `${order.deliveryAddress.city} ${order.deliveryAddress.postalCode}`,
                  order.customerName ?? '',
                ]}
                etaMin={progress?.phase === 'to_dropoff' ? (progress.etaMin ?? undefined) : undefined}
                onNavigate={() =>
                  navigateTo(
                    order.deliveryAddress.lat,
                    order.deliveryAddress.lng,
                    order.deliveryAddress.street
                  )
                }
              />

              {order.deliveryInstructions ? <InstructionsCard instructions={order.deliveryInstructions} /> : null}

              <View className="rounded-[20px] bg-card p-4 gap-3">
                <Text variant="label" tone="muted" className="text-[10px]">
                  {t('courier.delivery.toPickUp')}
                </Text>
                {order.items.map((item) => (
                  <View key={item.productId} className="flex-row items-baseline gap-3">
                    <Text variant="caption" weight="bold" className="text-[13px] w-7">
                      ×{item.qty}
                    </Text>
                    <Text variant="caption" className="flex-1 text-[13px]" numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                ))}
              </View>

              <View className="rounded-[20px] bg-card p-4 gap-2">
                <View className="flex-row items-center justify-between">
                  <Text variant="caption" tone="muted" className="text-[13px]">
                    {t('courier.delivery.distance')}
                  </Text>
                  <Text variant="caption" weight="bold" className="text-[13px]">
                    {formatDistance(order.delivery.distanceKm)}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text variant="caption" tone="muted" className="text-[13px]">
                    Pourboire
                  </Text>
                  <Text variant="caption" weight="bold" className="text-[13px]">
                    {order.delivery.tipCad > 0 ? formatCad(order.delivery.tipCad) : '—'}
                  </Text>
                </View>
                <View className="h-px bg-border my-0.5" />
                <View className="flex-row items-center justify-between">
                  <Text variant="caption" weight="bold" className="text-[14px]">
                    {t('courier.delivery.yourEarnings')}
                  </Text>
                  <Text weight="bold" className="text-[17px]">
                    {formatCad(order.delivery.earningsCad)}
                  </Text>
                </View>
              </View>

              {running ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    chatUnread > 0
                      ? `${t('courier.delivery.messageCustomer')}, ${t('common.orderChat.unreadA11y', { count: chatUnread })}`
                      : t('courier.delivery.messageCustomer')
                  }
                  onPress={() => router.push({ pathname: dynamicRoutes.courierChat, params: { id: order.id } })}
                  className="flex-row items-center gap-2.5 rounded-2xl bg-card p-4 active:opacity-80"
                >
                  <MessageSquare size={16} color={colors.primary} strokeWidth={2} />
                  <Text variant="caption" weight="semibold" className="flex-1 text-[14px]">
                    {t('courier.delivery.messageCustomer')}
                  </Text>
                  {chatUnread > 0 ? (
                    <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-secondary items-center justify-center">
                      <Text weight="bold" tone="inverted" className="text-[11px]">
                        {chatUnread > 9 ? '9+' : chatUnread}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}

              {/* Before pickup only: nothing has left the shop, so the run can
                  still go to someone else. After that it is the report below. */}
              {canReleaseRun(order) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: dynamicRoutes.courierRelease, params: { id: order.id } })}
                  className="flex-row items-center gap-2.5 rounded-2xl border border-border p-4 active:bg-muted"
                >
                  <Undo2 size={16} color={colors.mutedForeground} strokeWidth={2} />
                  <Text variant="caption" tone="muted" className="flex-1 text-[13px]">
                    {t('courier.release.action')}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: dynamicRoutes.courierReport, params: { id: order.id } })
                }
                className="flex-row items-center gap-2.5 rounded-2xl border border-border p-4 active:bg-muted"
              >
                <TriangleAlert size={16} color={colors.mutedForeground} strokeWidth={2} />
                <Text variant="caption" tone="muted" className="flex-1 text-[13px]">
                  {t('courier.delivery.reportProblem')}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          {actionLabel ? (
            <View className="px-5 pt-3 border-t border-border bg-card">
              <Button
                label={actionLabel}
                variant="primary"
                size="lg"
                fullWidth
                loading={busy}
                onPress={advance}
              />
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

/**
 * One end of the run.
 *
 * The active stop is the one being driven to; the other is dimmed rather than
 * hidden, because knowing where you have been is part of knowing where you are.
 */
function Stop({
  icon: Icon,
  tint,
  active,
  title,
  lines,
  etaMin,
  onNavigate,
}: {
  icon: typeof Store;
  tint: string;
  active: boolean;
  title: string;
  lines: string[];
  etaMin?: number;
  onNavigate?: () => void;
}) {
  const t = useT();
  return (
    <View className="flex-row items-start gap-3" style={{ opacity: active ? 1 : 0.55 }}>
      <View
        className="w-10 h-10 rounded-full items-center justify-center mt-0.5"
        style={{ backgroundColor: `${tint}1A` }}
      >
        <Icon size={18} color={tint} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="caption" weight="bold" className="text-[15px]" numberOfLines={1}>
          {title}
        </Text>
        {lines
          .filter(Boolean)
          .map((line) => (
            <Text key={line} variant="caption" tone="muted" className="text-[12px]">
              {line}
            </Text>
          ))}
      </View>
      {etaMin !== undefined ? (
        <View className="items-end mr-1">
          <Text weight="bold" className="text-[17px]" style={{ fontVariant: ['tabular-nums'] }}>
            {etaMin}
          </Text>
          <Text variant="caption" tone="muted" className="text-[11px]">
            min
          </Text>
        </View>
      ) : null}
      {onNavigate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.a11y.navigateTo', { name: title })}
          onPress={onNavigate}
          className="w-10 h-10 rounded-full items-center justify-center bg-muted active:opacity-70"
        >
          <Navigation size={16} color={tint} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * How to get to the door, as the shopper wrote it at checkout. The hand-over
 * mode leads, in colour: leaving an order at a door is the one instruction a
 * courier must not miss, because it changes how the run is closed.
 */
function InstructionsCard({ instructions }: { instructions: DeliveryInstructions }) {
  const t = useT();
  const colors = useThemeColors();
  const atDoor = instructions.dropoff === 'door';
  const rows = [
    { icon: MapPin, label: t('common.deliveryInstructions.unitLabel'), value: instructions.unit },
    { icon: KeyRound, label: t('common.deliveryInstructions.doorCodeLabel'), value: instructions.doorCode, strong: true },
    { icon: NotebookPen, label: t('common.deliveryInstructions.notes'), value: instructions.notes },
  ].filter((r) => r.value);

  return (
    <View className="rounded-[20px] bg-card p-4 gap-3">
      <Text variant="label" tone="muted" className="text-[10px]">
        {t('common.deliveryInstructions.title')}
      </Text>
      <View
        className={`flex-row items-center gap-2.5 self-start rounded-full px-3.5 py-2 ${atDoor ? 'bg-secondary/15' : 'bg-primary/10'}`}
      >
        {atDoor ? (
          <DoorOpen size={16} color={colors.secondary} strokeWidth={2.2} />
        ) : (
          <Hand size={16} color={colors.primary} strokeWidth={2.2} />
        )}
        <Text variant="caption" weight="bold" tone={atDoor ? 'secondary' : 'primary'} className="text-[13px]">
          {atDoor ? t('common.deliveryInstructions.leaveAtDoor') : t('common.deliveryInstructions.handToCustomer')}
        </Text>
      </View>
      {rows.length === 0 ? (
        <Text variant="caption" tone="muted" className="text-[13px]">
          {t('common.deliveryInstructions.none')}
        </Text>
      ) : (
        rows.map((row) => (
          <View key={row.label} className="flex-row items-start gap-3">
            <row.icon size={15} color={colors.mutedForeground} strokeWidth={2} style={{ marginTop: 2 }} />
            <View className="flex-1 gap-0.5">
              <Text variant="caption" tone="muted" className="text-[11px]">
                {row.label}
              </Text>
              <Text
                variant="caption"
                weight={row.strong ? 'bold' : 'semibold'}
                className={row.strong ? 'text-[17px] tracking-[2px]' : 'text-[14px] leading-[20px]'}
                selectable
              >
                {row.value}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
