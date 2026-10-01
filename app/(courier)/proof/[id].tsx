import { router, useLocalSearchParams } from 'expo-router';
import { PackageCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProofCapture } from '@/components/courier';
import { useT } from '@/lib/i18n/useT';
import { BackHeader, EmptyState, Skeleton, Text } from '@/components/ui';
import { ordersApi } from '@/data/api';
import { ApiError } from '@/data/http';
import type { DeliveryProof, Order } from '@/data/types';
import { useDispatchStore } from '@/store/useDispatchStore';

/**
 * Closing the run.
 *
 * A screen of its own rather than a sheet on the map: this is the last
 * irreversible act of a delivery, and it deserves the courier's whole attention
 * for the fifteen seconds it takes.
 *
 * Proof and status are written in one call (`completeDelivery`) so an order can
 * never be marked delivered with no evidence behind it — that state is exactly
 * what a dispute turns on, and letting it exist would make it reachable by
 * backgrounding the app at the wrong moment.
 */
export default function CourierProofScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setActiveOrder = useDispatchStore((s) => s.setActiveOrder);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    ordersApi.getOrderById(id).then((found) => {
      if (!active) return;
      setOrder(found ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  async function complete(proof: Omit<DeliveryProof, 'at'>): Promise<string | void> {
    if (!order || busy) return;
    setBusy(true);
    try {
      // `at` is dropped: the delivery time is stamped inside the same
      // transaction that writes the proof, so the two cannot disagree.
      let updated: Awaited<ReturnType<typeof ordersApi.completeDelivery>>;
      try {
        updated = await ordersApi.completeDelivery(order.id, {
          method: proof.method,
          pin: proof.pin,
          note: proof.note,
        });
      } catch (error) {
        // "NIP incorrect", "Preuve requise"… — the server's reason, in French,
        // shown where the courier is looking.
        if (error instanceof ApiError && error.isClientError) {
          return proof.method === 'pin' && error.status === 400 ? t('courier.wrongCode') : error.message;
        }
        throw error;
      }
      if (!updated) return;
      // The run is over: clear it before leaving, or the missions screen docks a
      // finished delivery until its next focus.
      setActiveOrder(null);
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('courier.proof.title')} />

      {loading ? (
        <View className="px-5 gap-4">
          <Skeleton height={70} radius={16} />
          <Skeleton height={220} radius={20} />
        </View>
      ) : !order?.delivery ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon={PackageCheck}
            title={t('courier.reportState.notFoundTitle')}
            description={t('courier.delivery.notFound')}
          />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
        >
          <View className="gap-1">
            <Text variant="subtitle" weight="bold" className="text-[19px]">
              {order.deliveryAddress.street}
            </Text>
            <Text variant="caption" tone="muted">
              {order.deliveryAddress.city} {order.deliveryAddress.postalCode}
              {order.customerName ? ` · ${order.customerName}` : ''}
            </Text>
          </View>

          <ProofCapture
            onSubmit={complete}
            busy={busy}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
