import { router } from 'expo-router';
import { CreditCard, MapPin, Store, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Button, PriceSummary, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { ordersApi } from '@/data/api';
import { defaultDeliveryAddress } from '@/data/seed/addresses';
import type { OrderItem } from '@/data/types';
import { useCartDetails } from '@/hooks/useCartDetails';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { usePreferencesStore, type PaymentBrand } from '@/store/usePreferencesStore';
import { useSessionStore } from '@/store/useSessionStore';
import { forest, neutral } from '@/theme/tokens';

type PaymentMethod = 'card' | 'cash';

const cardBrandLabels: Record<PaymentBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  interac: 'Interac',
};

export default function CheckoutScreen() {
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const clearCart = useCartStore((s) => s.clear);
  const { lines, vendor, subtotalCad, gstCad, qstCad, deliveryFeeCad, totalCad } = useCartDetails();

  const cards = usePreferencesStore((s) => s.paymentMethods);
  const card = cards.find((c) => c.isDefault) ?? cards[0];

  const [payment, setPayment] = useState<PaymentMethod>(card ? 'card' : 'cash');

  // Removing the last card from Moyens de paiement and coming straight back
  // would otherwise leave "carte" selected with no card row to show it on.
  useEffect(() => {
    if (!card && payment === 'card') setPayment('cash');
  }, [card, payment]);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Honour the address marked default in Adresses de livraison; fall back to the
  // first one, then to the seeded address for an account that has none.
  const address =
    user?.addresses.find((a) => a.isDefault) ?? user?.addresses[0] ?? defaultDeliveryAddress;

  async function placeOrder() {
    if (!user || !vendor || lines.length === 0) return;
    setError(null);
    setPlacing(true);
    try {
      // Snapshot names and prices into the order: the catalogue is mutable at
      // runtime (business catalogue edits), and an order must not change after
      // it is placed.
      const items: OrderItem[] = lines.map(({ item, product }) => ({
        productId: product.id,
        name: product.name,
        qty: item.qty,
        unitPriceCad: item.unitPriceCad,
      }));

      const order = await ordersApi.createOrder({
        customerId: user.id,
        // The shop only knows the four seeded customers by id; anyone who signed
        // up in-app has to carry their own name onto the order.
        customerName: user.fullName,
        vendorId: vendor.id,
        items,
        deliveryFeeCad,
        deliveryAddress: address,
        createdAt: new Date().toISOString(),
      });

      clearCart();
      // `replace`, not `push`: backing into a checkout for an order that has
      // already been placed would let it be submitted twice.
      router.replace({ pathname: dynamicRoutes.orderConfirmed, params: { id: order.id } });
    } catch {
      setError('La commande n’a pas pu être enregistrée. Veuillez réessayer.');
      setPlacing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Commande" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <View className="px-5 pt-2 gap-5">
          <Section
            title="Livraison"
            actionLabel="Modifier"
            onAction={() => router.push(routes.accountAddresses)}
          >
            <View className="flex-row items-start gap-3">
              <View className="w-10 h-10 items-center justify-center rounded-full bg-primary/10">
                <MapPin size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="caption" weight="bold">
                  {address.label}
                </Text>
                <Text variant="caption" tone="muted">
                  {address.street}
                </Text>
                <Text variant="caption" tone="muted">
                  {address.city}, {address.postalCode}
                </Text>
              </View>
            </View>
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
                  <Text variant="caption" tone="muted">
                    Livraison estimée en {vendor.deliveryEtaMin} min
                  </Text>
                </View>
              </View>
            </Section>
          ) : null}

          <Section
            title="Paiement"
            actionLabel={card ? 'Gérer' : 'Ajouter une carte'}
            onAction={() => router.push(routes.accountPayment)}
          >
            <View className="gap-2">
              {/* The card shown is the one marked default in Moyens de paiement,
                  not a fixed string — removing every card leaves cash as the
                  only honest option. */}
              {card ? (
                <PaymentOption
                  icon={CreditCard}
                  label={`${cardBrandLabels[card.brand]} •••• ${card.last4}`}
                  caption={`${card.holder} — expire ${card.expiry}`}
                  selected={payment === 'card'}
                  onPress={() => setPayment('card')}
                />
              ) : null}
              <PaymentOption
                icon={Wallet}
                label="Argent comptant"
                caption="À la livraison"
                selected={payment === 'cash'}
                onPress={() => setPayment('cash')}
              />
            </View>
          </Section>

          <Section title={`Articles (${lines.length})`}>
            <View className="gap-2">
              {lines.map(({ item, product }) => (
                <View key={item.productId} className="flex-row items-center justify-between gap-3">
                  <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                    {item.qty} × {product.name}
                  </Text>
                  <Text variant="caption" weight="semibold">
                    {formatCad(item.unitPriceCad * item.qty)}
                  </Text>
                </View>
              ))}
            </View>
          </Section>

          <View className="rounded-2xl bg-card p-4">
            <PriceSummary
              subtotalCad={subtotalCad}
              gstCad={gstCad}
              qstCad={qstCad}
              deliveryFeeCad={deliveryFeeCad}
              totalCad={totalCad}
            />
          </View>

          {error ? (
            <Text variant="caption" tone="destructive">
              {error}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View className="px-5 pt-3 border-t border-border bg-card">
        <Button
          label={`Confirmer — ${formatCad(totalCad)}`}
          variant="cta"
          size="lg"
          fullWidth
          loading={placing}
          disabled={lines.length === 0 || !vendor}
          onPress={placeOrder}
        />
        <Text variant="caption" tone="muted" className="text-center mt-2 mb-1 text-[11px]">
          Paiement simulé — aucune transaction réelle n’est effectuée.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="label" tone="muted">
          {title}
        </Text>
        {actionLabel && onAction ? (
          <Pressable hitSlop={8} accessibilityRole="button" onPress={onAction}>
            <Text variant="caption" weight="semibold" tone="primary" className="text-[13px]">
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View className="rounded-2xl bg-card p-4">{children}</View>
    </View>
  );
}

function PaymentOption({
  icon: Icon,
  label,
  caption,
  selected,
  onPress,
}: {
  icon: typeof CreditCard;
  label: string;
  caption: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-xl border-[1.5px] p-3 ${
        selected ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <Icon size={19} color={selected ? forest[600] : neutral[500]} strokeWidth={2} />
      <View className="flex-1">
        <Text variant="caption" weight="semibold">
          {label}
        </Text>
        <Text variant="caption" tone="muted" className="text-[12px]">
          {caption}
        </Text>
      </View>
      <View
        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
          selected ? 'border-primary' : 'border-border'
        }`}
      >
        {selected ? <View className="w-2.5 h-2.5 rounded-full bg-primary" /> : null}
      </View>
    </Pressable>
  );
}
