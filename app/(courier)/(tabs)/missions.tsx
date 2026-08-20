import { router, useFocusEffect } from 'expo-router';
import { Power } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { CourierGate, CourierHeader, MissionSheet, OfferCard } from '@/components/courier';
import { DeliveryMap } from '@/components/map';
import { Text } from '@/components/ui';
import { ordersApi, vendorsApi } from '@/data/api';
import type { Order, Vendor } from '@/data/types';
import { useCourierDemoSeed } from '@/hooks/useCourierDemoSeed';
import { useCourierEarnings } from '@/hooks/useCourierEarnings';
import { useCourierProfile } from '@/hooks/useCourierProfile';
import { useDeliveryProgress } from '@/hooks/useDeliveryProgress';
import { useDispatchEngine } from '@/hooks/useDispatchEngine';
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

  // Mounted here rather than in the group layout because this is the anchor
  // route: it is the first courier screen to mount, and the layout has no
  // courier file to hand the seeder.
  useCourierDemoSeed(courier, () => {
    void reload();
    void reloadEarnings();
  });

  const [order, setOrder] = useState<Order | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [offerVendor, setOfferVendor] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);
  // Measured rather than guessed: the dock is an offer card, a mission sheet or
  // a one-line idle card, and they are nowhere near the same height.
  const [dockHeight, setDockHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  const progress = useDeliveryProgress(order, vendor, courier);

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

  const loadRun = useCallback(async () => {
    if (!activeOrderId) {
      setOrder(null);
      setVendor(null);
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
  }, [activeOrderId, setActiveOrder]);

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
      const target = await ordersApi.getOrderById(offer.orderId);
      const shop = await vendorsApi.getVendorById(offer.vendorId);
      if (!target || !shop) return;
      const assigned = await ordersApi.assignCourier(
        offer.orderId,
        courier.id,
        new Date().toISOString(),
        {
          from: courier.base,
          pickup: shop.address,
          dropoff: target.deliveryAddress,
          vehicle: courier.vehicle,
        }
      );
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
    return <CourierGate state={missing ? 'missing' : 'pending'} onApproved={reload} />;
  }

  // Something is always on the map: mid-run it is the run, otherwise the
  // courier's own patch, so the screen is never an empty grey rectangle.
  const pickup = progress?.pickup ?? courier?.base ?? { lat: 45.5019, lng: -73.5674 };
  const dropoff = progress?.dropoff ?? courier?.base ?? pickup;

  return (
    <View className="flex-1 bg-background">
      {/* `StyleSheet.absoluteFill`, not an `absolute inset-0` class: the map has
          to be measured non-zero on its first layout pass or Mapbox's core pins
          it to a 64x64 fallback and never recovers. */}
      <View style={StyleSheet.absoluteFill}>
        <DeliveryMap
          pickup={pickup}
          dropoff={dropoff}
          courier={progress?.position ?? courier?.base ?? null}
          bearing={progress?.bearing ?? 0}
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
              dropoffLabel={offerVendor.city}
              onAccept={accept}
              onDecline={() => clearOffer('declined')}
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
  return (
    <View className="rounded-[24px] bg-card p-5 gap-2 items-center">
      {online ? null : <Power size={20} color="#8A8175" strokeWidth={2} />}
      <Text variant="caption" weight="bold" className="text-[15px]">
        {online ? 'En attente d’une course' : 'Vous êtes hors ligne'}
      </Text>
      <Text variant="caption" tone="muted" className="text-center text-[12px] leading-[18px]">
        {online
          ? 'Nous vous proposons la prochaine commande prête près de vous.'
          : 'Passez en ligne pour recevoir des propositions de course.'}
      </Text>
    </View>
  );
}
