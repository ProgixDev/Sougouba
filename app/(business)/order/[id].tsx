import { router, useLocalSearchParams } from 'expo-router';
import { MapPin, Receipt, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrderStatusTimeline } from '@/components/customer';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Badge, BackHeader, Button, EmptyState, Skeleton, Text } from '@/components/ui';
import { ordersApi } from '@/data/api';
import type { Order } from '@/data/types';
import { customerLabel } from '@/lib/customerNames';
import { formatCad, formatDate, formatTime } from '@/lib/format';
import { advanceActionLabel, isActiveStatus, nextStatus, orderStatusMeta } from '@/lib/orderStatus';
import { routes } from '@/lib/routes';
import { orderReference } from '@/lib/orderRef';

export default function BusinessOrderDetailScreen() {
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    ordersApi
      .getOrderById(id)
      .then((found) => {
        if (active) setOrder(found ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function advance() {
    if (!order) return;
    const next = nextStatus(order.status);
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
  const actionLabel = order ? advanceActionLabel(order.status) : null;

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
                <Row label="Sous-total" value={formatCad(order.subtotalCad)} />
                <Row label="Livraison" value={formatCad(order.deliveryFeeCad)} />
                <Row label="Total" value={formatCad(order.totalCad)} emphasis />
              </View>
            </Section>

            <Section title="Suivi">
              <OrderStatusTimeline order={order} />
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
          ) : null}
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

function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="caption" tone={emphasis ? 'default' : 'muted'} weight={emphasis ? 'bold' : 'regular'}>
        {label}
      </Text>
      <Text weight="bold" className={emphasis ? 'text-[17px]' : 'text-[14px]'}>
        {value}
      </Text>
    </View>
  );
}
