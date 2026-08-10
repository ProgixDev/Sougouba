import { router, useLocalSearchParams } from 'expo-router';
import { MapPin, ReceiptText, Store } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OrderStatusTimeline } from '@/components/customer';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Badge, BackHeader, EmptyState, Skeleton, Text } from '@/components/ui';
import { ordersApi, vendorsApi } from '@/data/api';
import type { Order, Vendor } from '@/data/types';
import { formatCad, formatDate, formatTime } from '@/lib/format';
import { orderStatusMeta } from '@/lib/orderStatus';
import { routes } from '@/lib/routes';
import { orderReference } from '@/lib/orderRef';

export default function OrderDetailScreen() {
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    ordersApi
      .getOrderById(id)
      .then(async (found) => {
        if (!active) return;
        setOrder(found ?? null);
        if (!found) return;
        const v = await vendorsApi.getVendorById(found.vendorId);
        if (active) setVendor(v ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (!loading && !order) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader />
        <EmptyState
          icon={ReceiptText}
          title="Commande introuvable"
          description="Cette commande n’existe plus ou le lien est expiré."
          actionLabel="Voir mes commandes"
          onAction={() => router.replace(routes.customerOrders)}
        />
      </SafeAreaView>
    );
  }

  const meta = order ? orderStatusMeta[order.status] : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={order ? `Commande ${orderReference(order)}` : 'Commande'} />

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
                  Passée le {formatDate(order.createdAt)} à {formatTime(order.createdAt)}
                </Text>
                <Text variant="title" weight="bold" className="text-[24px]">
                  {formatCad(order.totalCad)}
                </Text>
              </View>
              {meta ? <Badge label={meta.label} tone={meta.tone} /> : null}
            </View>

            <Section title="Suivi">
              <OrderStatusTimeline order={order} />
            </Section>

            {vendor ? (
              <Section title="Commerce">
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

            <Section title="Livraison">
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

            <Section title={`Articles (${order.items.length})`}>
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
                <Row label="Sous-total" value={formatCad(order.subtotalCad)} />
                <Row label="Livraison" value={formatCad(order.deliveryFeeCad)} />
                <Row label="Total" value={formatCad(order.totalCad)} emphasis />
              </View>
            </Section>
          </View>
        )}
      </ScrollView>
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
