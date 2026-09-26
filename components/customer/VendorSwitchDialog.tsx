import { ShoppingBag } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { MotiView } from 'moti';

import { Button, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useThemeColors } from '@/hooks/useColorScheme';
import { vendorsApi } from '@/data/api';
import { useCartStore } from '@/store/useCartStore';

/**
 * Confirms wiping the cart when the shopper adds an item from a different shop.
 *
 * The cart is single-vendor by design: `useCartStore.addItem` refuses the add
 * and parks it in `pendingItem` instead of silently clearing anything. This
 * dialog is the other half of that contract — without it a cross-vendor tap
 * looks like a dead button. Mounted once in the (customer) layout so every
 * add-to-cart surface is covered.
 */
export function VendorSwitchDialog() {
  const t = useT();
  const colors = useThemeColors();
  const pendingItem = useCartStore((s) => s.pendingItem);
  const currentVendorId = useCartStore((s) => s.vendorId);
  const resolveVendorSwitch = useCartStore((s) => s.resolveVendorSwitch);

  const [names, setNames] = useState<{ current?: string; next?: string }>({});

  useEffect(() => {
    if (!pendingItem || !currentVendorId) return;
    let active = true;
    Promise.all([
      vendorsApi.getVendorById(currentVendorId),
      vendorsApi.getVendorById(pendingItem.vendorId),
    ]).then(([current, next]) => {
      if (active) setNames({ current: current?.name, next: next?.name });
    });
    return () => {
      active = false;
    };
  }, [pendingItem, currentVendorId]);

  const visible = Boolean(pendingItem);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => resolveVendorSwitch(false)}>
      <Pressable
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: 'rgba(10, 32, 24, 0.45)' }}
        // Tapping the scrim is the same as declining — never destructive.
        onPress={() => resolveVendorSwitch(false)}
      >
        <MotiView
          from={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 200 }}
          className="w-full rounded-3xl bg-card p-6 gap-4"
        >
          {/* Swallow taps so pressing inside the card does not dismiss it. */}
          <Pressable onPress={() => {}} className="gap-4">
            <View className="w-14 h-14 items-center justify-center rounded-full bg-primary/10 self-start">
              <ShoppingBag size={26} color={colors.primary} strokeWidth={1.75} />
            </View>

            <View className="gap-2">
              <Text variant="subtitle" weight="bold">
                {t('customer.misc.emptyCartTitle')}
              </Text>
              <Text variant="body" tone="muted">
                {names.current && names.next
                  ? t('customer.cart.switchVendor.bodyNamed', { current: names.current, next: names.next })
                  : t('customer.cart.switchVendor.bodyGeneric')}
              </Text>
            </View>

            <View className="gap-2 mt-1">
              <Button
                label={t('customer.misc.emptyAndContinue')}
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => resolveVendorSwitch(true)}
              />
              <Button
                label={t('customer.keepCart')}
                variant="ghost"
                size="lg"
                fullWidth
                onPress={() => resolveVendorSwitch(false)}
              />
            </View>
          </Pressable>
        </MotiView>
      </Pressable>
    </Modal>
  );
}
