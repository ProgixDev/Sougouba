import { router, useFocusEffect } from 'expo-router';
import { Power } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { CourierGate, CourierHeader, MissionSheet, OfferCard } from '@/components/courier';
import { useT } from '@/lib/i18n/useT';
import { DeliveryMap } from '@/components/map';
import { Text } from '@/components/ui';
import { couriersApi, ordersApi, vendorsApi } from '@/data/api';
import type { Order, Vendor } from '@/data/types';
import { useCourierEarnings } from '@/hooks/useCourierEarnings';
import { useCourierProfile } from '@/hooks/useCourierProfile';
import { useDeliveryProgress } from '@/hooks/useDeliveryProgress';
import { useDispatchEngine } from '@/hooks/useDispatchEngine';
import { useOwnPosition } from '@/hooks/useOwnPosition';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { nextStatusFor } from '@/lib/orderStatus';
import { dynamicRoutes } from '@/lib/routes';
import { useDispatchStore } from '@/store/useDispatchStore';

/**
 * The courier's home: a map, and whatever is being asked of them right now.
 *
 * Map-first, unlike the other two roles. A shopper browses and a merchant reads
 * a counter, but a courier is somewhere, and everything they decide depends on
 * where. So the map is the screen and the UI floats over it — glass header at
 * the top, one card at the bottom, nothing in the middle.
 *
 * Exactly one of three things is docked at the bottom at any moment: an offer,
 * the run in progress, or a line explaining why neither. Two would be a
 * decision the courier has to make while driving.
 */
export default function MissionsScreen() {
  const t = useT();
  const tabBarInset = useTabBarInset();
  const { courier, loading, missing, pending, reload } = useCourierProfile();

  const online = useDispatchStore((s) => s.online);
  const offer = useDispatchStore((s) => s.offer);
  const activeOrderId = useDispatchStore((s) => s.activeOrderId);
  const goOnline = useDispatchStore((s) => s.goOnline);
  const goOffline = useDispatchStore((s) => s.goOffline);
  const clearOffer = useDispatchStore((s) => s.clearOffer);
  const setActiveOrder = useDispatchStore((s) => s.setActiveOrder);

  // Mounted once for the group, from here rather than the layout so it starts
  // only when a courier is actually looking at the dispatch surface.
  useDispatchEngine(courier);

  const { todayCad, runsToday, reload: reloadEarnings } = useCourierEarnings(courier?.id);

  const [order, setOrder] = useState<Order | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [offerVendor, setOfferVendor] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);
  // Measured rather than guessed: the dock is an offer card, a mission sheet or
  // a one-line idle card, and they are nowhere near the same height.
  const [dockHeight, setDockHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  // The courier's real position while they are working — online and waiting,
  // or carrying a run. Off shift the GPS is left alone.
  const own = useOwnPosition(online || Boolean(activeOrderId));
  const progress = useDeliveryProgress(order, vendor, courier, own);

  // The offer names a shop; the card needs the shop's name.
  useEffect(() => {
    if (!offer) return setOfferVendor(null);
    let active = true;
    vendorsApi.getVendorById(offer.vendorId).then((v) => {
      if (active) setOfferVendor(v ?? null);
    });
    return () => {
      active = false;
    };
  }, [offer]);

  // Primitives, not `courier`: the profile re-reads on focus and returns a new
  // object, and a callback keyed on it re-ran the focus effect that re-reads the
  // profile — a loop that hit the API three times a second until it was rate-limited.
  const courierId = courier?.id;
  const courierApproved = courier?.status === 'approved';

  const loadRun = useCallback(async () => {
    if (!activeOrderId) {
      setOrder(null);
      setVendor(null);
      // The run in progress is the server's record, not this phone's: after a
      // reinstall, a new phone or a cleared store, `activeOrderId` is empty
      // while the courier is still carrying a bag. Pick it back up.
      if (courierId && courierApproved) {
        const runs = await ordersApi.getOrdersForCourier(courierId).catch(() => []);
        const carrying = runs.find((o) => o.status === 'ready' || o.status === 'out_for_delivery');
        if (carrying) setActiveOrder(carrying.id);
      }
      return;
    }
    const found = await ordersApi.getOrderById(activeOrderId);
    setOrder(found ?? null);
    if (found) setVendor((await vendorsApi.getVendorById(found.vendorId)) ?? null);
    // A run that finished elsewhere in the stack (the proof screen) must not
    // stay docked here.
    if (found && (found.status === 'delivered' || found.status === 'cancelled')) {
      setActiveOrder(null);
    }
  }, [activeOrderId, courierId, courierApproved, setActiveOrder]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void loadRun();
      void reloadEarnings();
    }, [reload, loadRun, reloadEarnings])
  );

  async function accept() {
    if (!offer || !courier || busy) return;
    setBusy(true);
    try {
      const shop = await vendorsApi.getVendorById(offer.vendorId);
      if (!shop) return;
      // The distances, the ETAs and the pay were computed when the offer was
      // made and are stored on it — so accepting sends the offer id and nothing
      // else. Passing them from here would let a courier name their own
      // earnings, which is why the server stopped accepting them.
      const assigned = await ordersApi.assignCourier(offer.id);
      // `assignCourier` returns undefined when someone else got there first —
      // the courier is told, rather than handed a run they do not have.
      if (!assigned) {
        clearOffer('declined');
        return;
      }
      clearOffer('accepted');
      setOrder(assigned);
      setVendor(shop);
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    if (!offer) return;
    // Told to the server so the run goes to the next courier now, not in 30 s.
    couriersApi.declineOffer(offer.id).catch(() => undefined);
    clearOffer('declined');
  }

  async function advance() {
    if (!order || busy) return;
    const next = nextStatusFor(order.status, 'courier');
    if (!next) return;

    // Delivering is not a status flip — it needs evidence, so it routes to the
    // proof screen instead of writing here.
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

  if (loading) return null;
  if (missing || pending) {
    return <CourierGate state={missing ? 'missing' : 'pending'} />;
  }

  // Something is always on the map: mid-run it is the run, otherwise where the
  // courier actually is — or, before a GPS fix, the area they registered in.
  const here = own ?? courier?.base ?? { lat: 45.5019, lng: -73.5674 };
  const pickup = progress?.pickup ?? here;
  const dropoff = progress?.dropoff ?? here;

  return (
    <View className="flex-1 bg-background">
      {/* `StyleSheet.absoluteFill`, not an `absolute inset-0` class: the map has
          to be measured non-zero on its first layout pass or Mapbox's core pins
          it to a 64x64 fallback and never recovers. */}
      <View style={StyleSheet.absoluteFill}>
        <DeliveryMap
          pickup={pickup}
          dropoff={dropoff}
          courier={progress?.position ?? own}
          bearing={progress?.bearing ?? own?.heading ?? 0}
          route={progress?.leg?.points}
          progress={progress?.progress ?? 0}
          padding={{
            top: headerHeight + 24,
            bottom: dockHeight + tabBarInset + 24,
            left: 40,
            right: 40,
          }}
        />
      </View>

      <View className="flex-1" pointerEvents="box-none">
        <View
          onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <CourierHeader
            online={online}
          onToggle={online ? goOffline : goOnline}
            earningsTodayCad={todayCad}
            runsToday={runsToday}
          />
        </View>

        <View className="flex-1" pointerEvents="none" />

        <View
          className="px-4"
          style={{ paddingBottom: tabBarInset + 16 }}
          pointerEvents="box-none"
          onLayout={(e: LayoutChangeEvent) => setDockHeight(e.nativeEvent.layout.height)}
        >
          {/* The run outranks the offer. The dispatcher will not offer anything
              while one is active, so an offer sitting here alongside a run is
              by definition stale — the engine clears it within a tick, and
              this stops it flashing over the run in the meantime. */}
          {order ? (
            <MissionSheet
              order={order}
              vendor={vendor}
              progress={progress}
              onOpen={() =>
                router.push({ pathname: dynamicRoutes.courierDelivery, params: { id: order.id } })
              }
              onAdvance={advance}
              advancing={busy}
            />
          ) : offer && offerVendor ? (
            <OfferCard
              offer={offer}
              vendorName={offerVendor.name}
              dropoffLabel={offer.deliveryAddressCity ?? offerVendor.city}
              onAccept={accept}
              onDecline={decline}
              busy={busy}
            />
          ) : (
            <IdleCard online={online} />
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Why nothing is happening.
 *
 * Two different silences: offline is a choice the courier made and can undo,
 * waiting is the platform's turn. Saying "aucune course" for both would make
 * being offline look like a slow night.
 */
function IdleCard({ online }: { online: boolean }) {
  const t = useT();
  return (
    <View className="rounded-[24px] bg-card p-5 gap-2 items-center">
      {online ? null : <Power size={20} color="#8A8175" strokeWidth={2} />}
      <Text variant="caption" weight="bold" className="text-[15px]">
        {t(online ? 'courier.missions.waiting' : 'courier.missions.offline')}
      </Text>
      <Text variant="caption" tone="muted" className="text-center text-[12px] leading-[18px]">
        {online
          ? t('courier.missions.waitingBody')
          : t('courier.missions.offlineBody')}
      </Text>
    </View>
  );
}
