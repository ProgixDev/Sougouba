import { useFocusEffect, router } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { ChevronRight, Lock, MapPin, Sparkles, Store, Tag } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Button, Input, PriceSummary, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useThemeColors } from '@/hooks/useColorScheme';
import { ordersApi, loyaltyApi } from '@/data/api';
import { maxRedeemablePoints, pointsToDiscountCad } from '@/data/loyalty';
import { roundCad } from '@/data/taxes';
import { useCartDetails } from '@/hooks/useCartDetails';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { useSessionStore } from '@/store/useSessionStore';
import { ApiError } from '@/data/http';

export default function CheckoutScreen() {
  const t = useT();
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const clearCart = useCartStore((s) => s.clear);
  const {
    lines,
    vendor,
    subtotalCad,
    gstCad,
    qstCad,
    deliveryFeeCad,
    deliveryDistanceKm,
    totalCad,
  } = useCartDetails();

  // Every order is paid in the app, through Stripe's payment sheet. Sougouba
  // never holds a card: the sheet collects it, Stripe keeps it, and this screen
  // only ever sees "paid" or "not paid".
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One of the shopper's own saved addresses — the API refuses anything else,
  // because it prices the delivery from the geocoded point it stored. An account
  // with none is sent to add one rather than paying for a delivery to nowhere.
  const address = user?.addresses.find((a) => a.isDefault) ?? user?.addresses[0] ?? null;

  // Points Sougouba. `redeemablePoints` is a preview only — the same 20 % cap
  // (`maxRedeemablePoints`) is recomputed and enforced for real inside
  // `ordersApi.createOrder`, against the balance the mock backend measures at
  // that moment, not the one this screen fetched a few seconds ago.
  const [pointsBalance, setPointsBalance] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      loyaltyApi
        .getBalance(user.id)
        .then((balance) => {
          if (active) setPointsBalance(balance);
        })
        // A balance that fails to load reads as zero points, not a crash.
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [user])
  );
  const redeemablePoints = maxRedeemablePoints(subtotalCad, pointsBalance);
  const pointsDiscountCad = usePoints ? pointsToDiscountCad(redeemablePoints) : 0;

  // A promo code. Nothing about it is decided here: the server says whether the
  // code exists, applies to this shop and is still live, and what it is worth —
  // this screen only asks (`quoteCart`) and shows the answer. The same code is
  // checked again, for real, when the PaymentIntent is priced and when the
  // order is written.
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [coupon, setCoupon] = useState<{ code: string; discountCad: number } | null>(null);

  // Points and coupon are each worth what they are worth against the original
  // subtotal, and together never more than it — the rule `priceOrder` applies
  // on the server. The coupon line gives way when the two would overlap, so
  // the lines still add up to the total shown.
  const couponDiscountCad = coupon ? roundCad(Math.min(coupon.discountCad, subtotalCad - pointsDiscountCad)) : 0;
  const discountedTotalCad = roundCad(totalCad - pointsDiscountCad - couponDiscountCad);

  function cartFor(couponCode = coupon?.code): ordersApi.Cart | null {
    if (!vendor || !address) return null;
    return {
      vendorId: vendor.id,
      addressId: address.id,
      items: lines.map(({ item }) => ({ productId: item.productId, qty: item.qty })),
      ...(usePoints && redeemablePoints > 0 ? { redeemPoints: redeemablePoints } : {}),
      ...(couponCode ? { couponCode } : {}),
    };
  }

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    const cart = cartFor(code);
    if (!code || !cart) return;
    setPromoError(null);
    setCheckingPromo(true);
    try {
      const quote = await ordersApi.quoteCart(cart);
      if (!quote.couponCode || quote.couponDiscountCad <= 0) {
        setPromoError(t('customer.checkout.promoFailed'));
        return;
      }
      setCoupon({ code: quote.couponCode, discountCad: quote.couponDiscountCad });
      setPromoOpen(false);
      setPromoInput('');
    } catch (caught) {
      // "Ce code promo a expiré" is the server's own sentence — more useful
      // than anything this screen could guess.
      setPromoError(caught instanceof ApiError && caught.isClientError ? caught.message : t('customer.checkout.promoFailed'));
    } finally {
      setCheckingPromo(false);
    }
  }

  async function placeOrder() {
    const cart = cartFor();
    if (!user || !vendor || !address || !cart || lines.length === 0) return;
    setError(null);
    setPlacing(true);
    try {
      // 1. The server prices the cart and opens a PaymentIntent for exactly that.
      const { clientSecret, paymentIntentId } = await ordersApi.createPaymentIntent(cart);

      // 2. Stripe's own sheet takes the card (and any 3-D Secure step).
      const init = await initPaymentSheet({
        merchantDisplayName: 'Sougouba',
        paymentIntentClientSecret: clientSecret,
        returnURL: 'sougouba://stripe-redirect',
        // Canada, not the phone's region: every Sougouba card is billed to a
        // Quebec delivery address, and the sheet otherwise opened on whatever
        // country the device was set to (a simulator in Algeria, a phone bought
        // abroad) and asked for the wrong postal-code format.
        defaultBillingDetails: {
          name: user.fullName,
          email: user.email,
          address: { country: 'CA', city: address.city, postalCode: address.postalCode, line1: address.street },
        },
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) throw new Error(init.error.message);
      const paid = await presentPaymentSheet();
      if (paid.error) {
        // Closing the sheet is a choice, not a failure — nothing was charged.
        if (paid.error.code !== 'Canceled') setError(paid.error.message);
        setPlacing(false);
        return;
      }

      // 3. Paid: the order is written. If that fails the API refunds in full.
      const order = await ordersApi.placeOrder({ ...cart, paymentIntentId });
      clearCart();
      // `replace`, not `push`: backing into a checkout for an order that has
      // already been placed would let it be submitted twice.
      router.replace({ pathname: dynamicRoutes.orderConfirmed, params: { id: order.id } });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.isClientError ? caught.message : t('customer.checkoutFailed')
      );
      setPlacing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.checkout.title')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <View className="px-5 pt-2 gap-5">
          <Section
            title={t('customer.checkout.delivery')}
            actionLabel={t('customer.checkout.edit')}
            onAction={() => router.push(routes.accountAddresses)}
          >
            <View className="flex-row items-start gap-3">
              <View className="w-10 h-10 items-center justify-center rounded-full bg-primary/10">
                <MapPin size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                {address ? (
                  <>
                    <Text variant="caption" weight="bold">
                      {address.label}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {address.street}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {address.city}, {address.postalCode}
                    </Text>
                  </>
                ) : (
                  <Text variant="caption" weight="bold">
                    {t('customer.checkout.noAddress')}
                  </Text>
                )}
              </View>
            </View>
          </Section>

          {vendor ? (
            <Section title={t('customer.checkout.shop')}>
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 items-center justify-center rounded-full bg-muted">
                  <Store size={18} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text variant="caption" weight="bold" numberOfLines={1}>
                    {vendor.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('customer.checkout.deliveryEta', { minutes: vendor.deliveryEtaMin })}
                  </Text>
                </View>
              </View>
            </Section>
          ) : null}

          <Section title={t('customer.checkout.payment')}>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 items-center justify-center rounded-full bg-primary/10">
                <Lock size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="caption" weight="bold">
                  {t('customer.checkout.stripeTitle')}
                </Text>
                <Text variant="caption" tone="muted" className="text-[12px] leading-[16px]">
                  {t('customer.checkout.stripeBody')}
                </Text>
              </View>
            </View>
          </Section>

          <Section title={t('customer.checkout.items', { count: lines.length })}>
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

          {pointsBalance > 0 ? (
            <Section title={t('customer.checkout.pointsSection')}>
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles size={18} color={colors.primary} strokeWidth={2} />
                </View>
                <View className="flex-1 gap-0.5 pr-2">
                  <Text variant="caption" weight="bold">
                    {t('customer.checkout.usePoints')}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[12px] leading-[16px]">
                    {redeemablePoints > 0
                      ? t('customer.checkout.pointsAvailable', {
                          points: pointsBalance,
                          amount: formatCad(pointsToDiscountCad(redeemablePoints)),
                        })
                      : t('customer.checkout.pointsTooFew', { points: pointsBalance })}
                  </Text>
                </View>
                <Switch
                  value={usePoints}
                  onValueChange={setUsePoints}
                  disabled={redeemablePoints <= 0}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  accessibilityLabel={t('customer.checkout.usePointsA11y')}
                />
              </View>
            </Section>
          ) : null}

          <Section title={t('customer.checkout.promoLabel')}>
            {coupon ? (
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 items-center justify-center rounded-full bg-primary/10">
                  <Tag size={18} color={colors.primary} strokeWidth={2} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="caption" weight="bold">
                    {coupon.code}
                  </Text>
                  <Text variant="caption" tone="primary" className="text-[12px] leading-[16px]">
                    {t('customer.checkout.promoApplied', { amount: formatCad(couponDiscountCad) })}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('customer.checkout.promoA11yRemove', { code: coupon.code })}
                  onPress={() => setCoupon(null)}
                  disabled={placing}
                >
                  <Text variant="caption" weight="semibold" tone="muted" className="text-[13px]">
                    {t('customer.checkout.promoRemove')}
                  </Text>
                </Pressable>
              </View>
            ) : promoOpen ? (
              <View className="gap-3">
                <Input
                  label={t('customer.checkout.promoLabel')}
                  icon={Tag}
                  value={promoInput}
                  onChangeText={(text) => {
                    setPromoInput(text);
                    if (promoError) setPromoError(null);
                  }}
                  error={promoError ?? undefined}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  autoFocus
                  maxLength={64}
                  returnKeyType="done"
                  onSubmitEditing={applyPromo}
                />
                <Button
                  label={t('customer.checkout.promoApply')}
                  variant="outline"
                  size="sm"
                  loading={checkingPromo}
                  disabled={!promoInput.trim() || !address}
                  onPress={applyPromo}
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPromoOpen(true)}
                className="flex-row items-center gap-3 active:opacity-70"
              >
                <View className="w-10 h-10 items-center justify-center rounded-full bg-muted">
                  <Tag size={18} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <Text variant="caption" weight="semibold" className="flex-1">
                  {t('customer.checkout.promoAdd')}
                </Text>
                <ChevronRight size={18} color={colors.mutedForeground} strokeWidth={2} />
              </Pressable>
            )}
          </Section>

          <View className="rounded-2xl bg-card p-4">
            <PriceSummary
              subtotalCad={subtotalCad}
              gstCad={gstCad}
              qstCad={qstCad}
              deliveryFeeCad={deliveryFeeCad}
              deliveryDistanceKm={deliveryDistanceKm}
              pointsDiscountCad={pointsDiscountCad}
              couponDiscountCad={couponDiscountCad}
              couponCode={coupon?.code}
              totalCad={discountedTotalCad}
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
          label={
            address
              ? t('customer.checkout.confirm', { total: formatCad(discountedTotalCad) })
              : t('customer.checkout.addAddress')
          }
          variant="cta"
          size="lg"
          fullWidth
          loading={placing}
          disabled={lines.length === 0 || !vendor}
          onPress={address ? placeOrder : () => router.push(routes.accountAddresses)}
        />
        <Text variant="caption" tone="muted" className="text-center mt-2 mb-1 text-[11px]">
          {t('customer.checkout.securedByStripe')}
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
