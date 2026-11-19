import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { Store, TicketPercent } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Badge, Button, Chip, EmptyState, Input, Skeleton, Text } from '@/components/ui';
import { couponsApi } from '@/data/api';
import { ApiError } from '@/data/http';
import type { Coupon } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { formatCad, formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';

/** The durations on offer. `null` is "no end date" — the merchant ends it by hand. */
const DURATIONS: (number | null)[] = [7, 30, 90, null];

/**
 * The merchant's promo codes: one form, and the list it adds to.
 *
 * A single screen rather than a list and a separate editor, because there is
 * nothing to edit — a code is created and later ended, never changed (a flyer
 * already in someone's hand has to keep meaning what it says).
 *
 * The note above the form is not decoration. The merchant pays for the
 * discount while the commission is still taken on the full price, and that is
 * the one thing they must know *before* choosing "50 %".
 *
 * The API owns every rule (code format, bounds, uniqueness) and answers a
 * refusal with a sentence, so the checks here only stop the obviously empty
 * form — duplicating the bounds would be a second place for them to drift.
 */
export default function BusinessCouponsScreen() {
  const t = useT();
  const colors = useThemeColors();
  const { vendor, missing, approved, loading: vendorLoading } = useOwnerVendor();

  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<Coupon['discountType']>('percentage');
  const [value, setValue] = useState('');
  const [validDays, setValidDays] = useState<number | null>(30);
  const [usageLimit, setUsageLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCoupons(await couponsApi.getMyCoupons());
    } catch {
      // An empty list with a working form beats a spinner that never ends.
      setCoupons((current) => current ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (approved) void load();
    }, [approved, load])
  );

  // French keyboards type "7,50"; `Number` only reads a dot.
  const parsedValue = Number(value.replace(',', '.'));
  const parsedLimit = usageLimit.trim() === '' ? undefined : Number(usageLimit);
  const ready =
    code.trim().length >= 3 &&
    Number.isFinite(parsedValue) &&
    parsedValue > 0 &&
    (parsedLimit === undefined || (Number.isInteger(parsedLimit) && parsedLimit > 0));

  async function create() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const created = await couponsApi.createCoupon({
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: parsedValue,
        usageLimit: parsedLimit,
        validDays: validDays ?? undefined,
      });
      setCoupons((current) => [created, ...(current ?? [])]);
      setCode('');
      setValue('');
      setUsageLimit('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        t('business.coupons.errorTitle'),
        error instanceof ApiError ? error.message : t('common.genericError')
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDeactivate(coupon: Coupon) {
    Alert.alert(
      t('business.coupons.deactivateTitle'),
      t('business.coupons.deactivateBody', { code: coupon.code }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('business.coupons.deactivate'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(coupon.id);
            try {
              const updated = await couponsApi.deactivateCoupon(coupon.id);
              setCoupons((current) => (current ?? []).map((c) => (c.id === updated.id ? updated : c)));
            } catch (error) {
              Alert.alert(
                t('business.coupons.title'),
                error instanceof ApiError ? error.message : t('common.genericError')
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  if (vendorLoading && !vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader title={t('business.coupons.title')} />
        <View className="px-5 gap-3">
          <Skeleton height={58} radius={16} />
          <Skeleton height={220} radius={20} />
        </View>
      </SafeAreaView>
    );
  }

  // A shop that takes no orders yet has nothing a code could apply to — and
  // the API refuses the create for the same reason.
  if (missing || !approved) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader title={t('business.coupons.title')} />
        <EmptyState
          icon={Store}
          title={t('business.coupons.title')}
          description={t('business.coupons.notApprovedBody')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('business.coupons.title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pb-10 gap-6"
        >
          <View className="rounded-[20px] bg-card p-4 gap-4">
            <Text variant="subtitle" weight="bold">
              {t('business.coupons.newTitle')}
            </Text>
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('business.coupons.fundedNote')}
            </Text>

            <Input
              label={t('business.coupons.code')}
              value={code}
              // Shown as it will be stored, and stripped as it is typed: a
              // space or an accent is the usual reason a code "does not work".
              onChangeText={(next) => setCode(next.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              helperText={t('business.coupons.codeHint')}
            />

            <View className="gap-2.5">
              <Text variant="label" tone="muted">
                {t('business.coupons.type')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  label={t('business.coupons.percentage')}
                  selected={discountType === 'percentage'}
                  onPress={() => setDiscountType('percentage')}
                />
                <Chip
                  label={t('business.coupons.fixed')}
                  selected={discountType === 'fixed'}
                  onPress={() => setDiscountType('fixed')}
                />
              </View>
            </View>

            <Input
              label={discountType === 'percentage' ? t('business.coupons.valuePercent') : t('business.coupons.valueFixed')}
              value={value}
              onChangeText={setValue}
              keyboardType={discountType === 'percentage' ? 'number-pad' : 'decimal-pad'}
              maxLength={6}
            />

            <View className="gap-2.5">
              <Text variant="label" tone="muted">
                {t('business.coupons.duration')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {DURATIONS.map((days) => (
                  <Chip
                    key={days ?? 'none'}
                    label={days === null ? t('business.coupons.noExpiry') : t('business.coupons.days', { count: days })}
                    selected={validDays === days}
                    onPress={() => setValidDays(days)}
                  />
                ))}
              </View>
            </View>

            <Input
              label={t('business.coupons.usageLimit')}
              value={usageLimit}
              onChangeText={(next) => setUsageLimit(next.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
              helperText={t('business.coupons.usageLimitHint')}
            />

            <Button
              label={t('business.coupons.create')}
              variant="primary"
              size="lg"
              fullWidth
              disabled={!ready}
              loading={saving}
              onPress={create}
            />
          </View>

          <View className="gap-3">
            <Text variant="label" tone="muted">
              {t('business.coupons.listTitle')}
            </Text>

            {coupons === null ? (
              <Skeleton height={96} radius={20} />
            ) : coupons.length === 0 ? (
              <View className="rounded-[20px] bg-card p-6 items-center gap-2">
                <View className="w-12 h-12 items-center justify-center rounded-full bg-muted">
                  <TicketPercent size={22} color={colors.mutedForeground} strokeWidth={1.75} />
                </View>
                <Text variant="caption" weight="bold">
                  {t('business.coupons.emptyTitle')}
                </Text>
                <Text variant="caption" tone="muted" className="text-center">
                  {t('business.coupons.emptyBody')}
                </Text>
              </View>
            ) : (
              coupons.map((coupon) => (
                <View key={coupon.id} className="rounded-[20px] bg-card p-4 gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text variant="subtitle" weight="bold" numberOfLines={1} className="flex-1">
                      {coupon.code}
                    </Text>
                    <Badge
                      label={coupon.active ? t('business.coupons.active') : t('business.coupons.ended')}
                      tone={coupon.active ? 'success' : 'neutral'}
                      size="sm"
                    />
                  </View>
                  <Text variant="caption" weight="semibold">
                    {coupon.discountType === 'percentage'
                      ? t('business.coupons.percentOff', { value: coupon.discountValue })
                      : t('business.coupons.amountOff', { amount: formatCad(coupon.discountValue) })}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[12px]">
                    {coupon.usageLimit !== null
                      ? t('business.coupons.usedOf', { count: coupon.usedCount, limit: coupon.usageLimit })
                      : t('business.coupons.used', { count: coupon.usedCount })}
                    {coupon.endsAt
                      ? ` · ${t(coupon.active ? 'business.coupons.until' : 'business.coupons.endedOn', {
                          date: formatDate(coupon.endsAt),
                        })}`
                      : ''}
                  </Text>
                  {coupon.active ? (
                    <View className="items-start pt-1">
                      <Button
                        label={t('business.coupons.deactivate')}
                        variant="outline"
                        size="sm"
                        loading={busyId === coupon.id}
                        onPress={() => confirmDeactivate(coupon)}
                      />
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
