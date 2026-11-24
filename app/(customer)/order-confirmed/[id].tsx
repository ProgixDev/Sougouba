import { router, useLocalSearchParams } from 'expo-router';
import { Check, Clock, ReceiptText } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useOrderReceipt } from '@/hooks/useOrderReceipt';
import { ordersApi, vendorsApi } from '@/data/api';
import type { Order, Vendor } from '@/data/types';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';
import { orderReference } from '@/lib/orderRef';

export default function OrderConfirmedScreen() {
  const t = useT();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const receipt = useOrderReceipt(order?.id);

  useEffect(() => {
    if (!id) return;
    let active = true;
    ordersApi.getOrderById(id).then(async (found) => {
      if (!active || !found) return;
      setOrder(found);
      const v = await vendorsApi.getVendorById(found.vendorId);
      if (active) setVendor(v ?? null);
    });
    return () => {
      active = false;
    };
  }, [id]);

  // There is nothing to go "back" to — checkout replaced itself and the cart is
  // empty. Send the hardware back button home instead of unwinding into a
  // stale checkout.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace(routes.customerHome);
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8 gap-6">
        <MotiView
          from={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 13, stiffness: 160 }}
          className="w-24 h-24 items-center justify-center rounded-full bg-primary/10"
        >
          <View className="w-16 h-16 items-center justify-center rounded-full bg-primary">
            <Check size={32} color="#FFFFFF" strokeWidth={3} />
          </View>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400, delay: 180 }}
          className="items-center gap-3"
        >
          <Text variant="title" weight="bold" className="text-center">
            {t('customer.orderConfirmed.title')}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {vendor
              ? t('customer.orderConfirmed.bodyNamed', { vendor: vendor.name })
              : t('customer.orderConfirmed.bodyGeneric')}
          </Text>
        </MotiView>

        {order ? (
          <MotiView
            from={{ opacity: 0, translateY: 14 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 400, delay: 300 }}
            className="w-full rounded-2xl bg-card p-4 gap-3"
          >
            <View className="flex-row items-center justify-between">
              <Text variant="caption" tone="muted">
                {t('customer.orderConfirmed.orderNumber')}
              </Text>
              <Text variant="caption" weight="bold">
                {orderReference(order)}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text variant="caption" tone="muted">
                {t('customer.orderConfirmed.total')}
              </Text>
              <Text variant="caption" weight="bold">
                {formatCad(order.totalCad)}
              </Text>
            </View>
            {order.pointsDiscountCad ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption" tone="muted">
                  {t('customer.orderConfirmed.pointsUsed')}
                </Text>
                <Text variant="caption" weight="bold" tone="primary">
                  {order.pointsRedeemed} pts · -{formatCad(order.pointsDiscountCad)}
                </Text>
              </View>
            ) : null}
            {order.couponDiscountCad ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption" tone="muted">
                  {t('customer.orderConfirmed.couponUsed')}
                </Text>
                <Text variant="caption" weight="bold" tone="primary">
                  {order.couponCode} · -{formatCad(order.couponDiscountCad)}
                </Text>
              </View>
            ) : null}
            {vendor ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption" tone="muted">
                  {t('customer.orderConfirmed.estimatedDelivery')}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Clock size={13} color={colors.primary} strokeWidth={2} />
                  <Text variant="caption" weight="bold">
                    {vendor.deliveryEtaMin} min
                  </Text>
                </View>
              </View>
            ) : null}
            {/* The same document the API emails when the order is placed, one tap away. */}
            <View className="flex-row items-center justify-between">
              <Text variant="caption" tone="muted">
                {t('customer.receipt.label')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('customer.receipt.view')}
                accessibilityState={{ busy: receipt.opening }}
                disabled={receipt.opening}
                hitSlop={12}
                onPress={() => void receipt.open()}
                className={`flex-row items-center gap-1.5 ${receipt.opening ? 'opacity-50' : ''}`}
              >
                <ReceiptText size={13} color={colors.primary} strokeWidth={2} />
                <Text variant="caption" weight="bold" tone="primary">
                  {t('customer.receipt.view')}
                </Text>
              </Pressable>
            </View>
            {receipt.error ? (
              <Text variant="caption" tone="destructive">
                {receipt.error}
              </Text>
            ) : null}
          </MotiView>
        ) : null}
      </View>

      <View className="px-6 pb-4 gap-2">
        <Button
          label={t('customer.orderConfirmed.track')}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!order}
          onPress={() =>
            order &&
            router.replace({ pathname: dynamicRoutes.orderDetail, params: { id: order.id } })
          }
        />
        <Button
          label={t('customer.orderConfirmed.home')}
          variant="ghost"
          size="lg"
          fullWidth
          onPress={() => router.replace(routes.customerHome)}
        />
      </View>
    </SafeAreaView>
  );
}
