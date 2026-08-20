import { router, useLocalSearchParams } from 'expo-router';
import { Bike, Car, Clock3, MapPin, Receipt, Truck, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisputeCard } from '@/components/business';
import { OrderStatusTimeline } from '@/components/customer';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Badge, BackHeader, Button, EmptyState, PriceSummary, Skeleton, Text } from '@/components/ui';
import { couriersApi, ordersApi } from '@/data/api';
import type { Courier, Order } from '@/data/types';
import { customerLabel } from '@/lib/customerNames';
import { courierIssueLabel } from '@/lib/disputes';
import { formatCad, formatDate, formatTime } from '@/lib/format';
import {
  advanceActionLabel,
  isActiveStatus,
  nextStatusFor,
  orderStatusMeta,
} from '@/lib/orderStatus';
import { routes } from '@/lib/routes';
import { orderReference } from '@/lib/orderRef';

export default function BusinessOrderDetailScreen() {
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    ordersApi
      .getOrderById(id)
      .then(async (found) => {
        if (!active) return;
        setOrder(found ?? null);
        // Who is carrying it. The shop cannot act on the courier, but "en
        // attente d'un livreur" and "Moussa est en route" are different answers
        // to the customer standing at the counter asking where their order is.
        if (found?.delivery) {
          const c = await couriersApi.getCourierById(found.delivery.courierId);
          if (active) setCourier(c ?? null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function reply(message: string) {
    if (!order) return;
    const updated = await ordersApi.replyToDispute(order.id, {
      message,
      at: new Date().toISOString(),
    });
    if (updated) setOrder(updated);
  }

  async function advance() {
    if (!order) return;
    const next = nextStatusFor(order.status, 'merchant');
    if (!next) return;
    setUpdating(true);
    const updated = await ordersApi.updateOrderStatus(order.id, next, new Date().toISOString());
    setOrder(updated ?? order);
    setUpdating(false);
  }

  function confirmCancel() {
    if (!order) return;
    // Cancelling is irreversible in this model — there is no transition back
    // onto the happy path — so it gets a confirmation.
    Alert.alert(
      'Annuler la commande ?',
      'Le client sera informé. Cette action est définitive.',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Annuler la commande',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            const updated = await ordersApi.updateOrderStatus(
              order.id,
              'cancelled',
              new Date().toISOString()
            );
            setOrder(updated ?? order);
            setUpdating(false);
          },
        },
      ]
    );
  }

  if (!loading && !order) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader />
        <EmptyState
          icon={Receipt}
          title="Commande introuvable"
          description="Cette commande n’existe plus."
          actionLabel="Voir les commandes"
          onAction={() => router.replace(routes.businessOrders)}
        />
      </SafeAreaView>
    );
  }

  const meta = order ? orderStatusMeta[order.status] : null;
  // Null once the order is packed — see `STATUS_ACTOR` in lib/orderStatus.ts.
  const actionLabel =
    order && nextStatusFor(order.status, 'merchant') ? advanceActionLabel(order.status) : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={order ? `Commande ${orderReference(order)}` : 'Commande'} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        {loading || !order ? (
          <View className="px-5 gap-4">
            <Skeleton height={28} width="45%" />
            <Skeleton height={180} radius={20} />
          </View>
        ) : (
          <View className="px-5 gap-5">
            <View className="flex-row items-center justify-between gap-3">
              <View className="gap-1">
                <Text variant="caption" tone="muted">
                  {formatDate(order.createdAt)} à {formatTime(order.createdAt)}
                </Text>
                <Text variant="title" weight="bold" className="text-[24px]">
                  {formatCad(order.totalCad)}
                </Text>
              </View>
              {meta ? <Badge label={meta.label} tone={meta.tone} /> : null}
            </View>

            {order.dispute ? <DisputeCard dispute={order.dispute} onReply={reply} /> : null}

            <Section title="Client">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 items-center justify-center rounded-full bg-muted">
                  <User size={18} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <Text variant="caption" weight="bold" className="flex-1" numberOfLines={1}>
                  {customerLabel(order)}
                </Text>
              </View>
            </Section>

            <Section title="Adresse de livraison">
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

            <Section title="À préparer">
              <View className="gap-3">
                {order.items.map((item) => (
                  <View key={item.productId} className="flex-row items-center gap-3">
                    <View className="w-7 h-7 items-center justify-center rounded-md bg-primary/10">
                      <Text variant="caption" weight="bold" tone="primary" className="text-[12px]">
                        {item.qty}
                      </Text>
                    </View>
                    <Text variant="caption" weight="medium" numberOfLines={1} className="flex-1">
                      {item.name}
                    </Text>
                    <Text variant="caption" tone="muted">
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
                  totalCad={order.totalCad}
                />
              </View>
            </Section>

            {order.delivery && courier ? (
              <Section title="Livreur">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-secondary/10 items-center justify-center">
                    {courier.vehicle === 'bike' ? (
                      <Bike size={18} color={colors.secondary} strokeWidth={2} />
                    ) : courier.vehicle === 'car' ? (
                      <Car size={18} color={colors.secondary} strokeWidth={2} />
                    ) : (
                      <Truck size={18} color={colors.secondary} strokeWidth={2} />
                    )}
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text variant="caption" weight="bold" className="text-[15px]">
                      {courier.fullName}
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[12px]">
                      {order.delivery.pickedUpAt
                        ? 'Commande récupérée'
                        : `Arrive dans environ ${order.delivery.pickupEtaMin} min`}
                    </Text>
                  </View>
                  {courier.plate ? (
                    <Text variant="caption" tone="muted" className="text-[12px]">
                      {courier.plate}
                    </Text>
                  ) : null}
                </View>
              </Section>
            ) : null}

            {order.courierIssue ? (
              <Section title="Signalé par le livreur">
                <View className="gap-1.5">
                  <Text variant="caption" weight="bold" tone="destructive">
                    {courierIssueLabel(order.courierIssue.reason)}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
                    {order.courierIssue.message}
                  </Text>
                </View>
              </Section>
            ) : null}

            <Section title="Suivi">
              <OrderStatusTimeline order={order} courierName={courier?.fullName} />
            </Section>
          </View>
        )}
      </ScrollView>

      {order && isActiveStatus(order.status) ? (
        <View className="px-5 pt-3 border-t border-border bg-card gap-2">
          {actionLabel ? (
            <Button
              label={actionLabel}
              variant="primary"
              size="lg"
              fullWidth
              loading={updating}
              onPress={advance}
            />
          ) : (
            // No button once the bag is packed — the next two steps belong to
            // the courier. Saying what is being waited on keeps the footer from
            // reading as a screen that lost its primary action.
            <View className="flex-row items-center justify-center gap-2 h-14">
              {order.delivery ? (
                <Bike size={16} color={colors.mutedForeground} strokeWidth={2} />
              ) : (
                <Clock3 size={16} color={colors.mutedForeground} strokeWidth={2} />
              )}
              <Text variant="caption" tone="muted">
                {order.delivery ? 'Livraison en cours' : 'En attente d’un livreur'}
              </Text>
            </View>
          )}
          <Button
            label="Annuler la commande"
            variant="ghost"
            size="md"
            fullWidth
            disabled={updating}
            onPress={confirmCancel}
          />
        </View>
      ) : null}
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
