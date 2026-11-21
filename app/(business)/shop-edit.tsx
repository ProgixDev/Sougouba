import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Store } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoField, type PhotoValue } from '@/components/business/PhotoField';
import { BackHeader, Button, EmptyState, Input, Skeleton, Text } from '@/components/ui';
import { vendorsApi } from '@/data/api';
import { mediaImageType } from '@/data/api/media';
import { ApiError } from '@/data/http';
import type { Vendor, VendorHours } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { useT } from '@/lib/i18n/useT';
import { shopSettingsSchema, type ShopSettingsValues } from '@/lib/validation/merchant';
import { weekdayLongKey } from '@/lib/weekdays';

/** Monday first, which is how Quebec shops list their hours. `day` is 0 = Sunday. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONDAY = 1;

/** What a day the shop never listed defaults to: closed, with times ready if it opens. */
const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '21:00';

type DayRow = { day: number; open: string; close: string; closed: boolean };

function weekOf(vendor: Vendor): DayRow[] {
  return WEEK_ORDER.map((day) => {
    const listed = vendor.hours.find((h) => h.day === day);
    return listed
      ? { day, open: listed.open, close: listed.close, closed: Boolean(listed.closed) }
      : { day, open: DEFAULT_OPEN, close: DEFAULT_CLOSE, closed: true };
  });
}

/**
 * "0930" → "09:30" as it is typed. The number pad has no colon on iOS, and a
 * merchant should not have to find one.
 */
function typeClock(next: string): string {
  const digits = next.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

type Errors = Partial<Record<'name' | 'deliveryEtaMin' | `hours.${number}`, string>>;

/**
 * What a merchant may change about their own shop, on one screen: cover photo,
 * name, halal badge, quoted lead time, and the week's hours.
 *
 * Open to a pending shop too: hours and a cover are exactly what a merchant
 * sets up while waiting for approval.
 *
 * Saves only what changed, in up to three calls (photo upload, shop patch,
 * hours). They are not one transaction — a failure part-way leaves the earlier
 * steps applied, and saving again finishes the rest, since nothing is applied
 * twice in a harmful way.
 */
export default function ShopEditScreen() {
  const t = useT();
  const { vendor, missing, reload } = useOwnerVendor();

  if (!vendor && !missing) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader title={t('business.shopEdit.title')} />
        <View className="px-5 gap-3">
          <Skeleton height={150} radius={20} />
          <Skeleton height={58} radius={16} />
          <Skeleton height={260} radius={20} />
        </View>
      </SafeAreaView>
    );
  }

  if (!vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader />
        <EmptyState
          icon={Store}
          title={t('business.shopProfile.noShopTitle')}
          description={t('business.shopProfile.noShopBody')}
        />
      </SafeAreaView>
    );
  }

  return <ShopEditForm vendor={vendor} onSaved={reload} />;
}

function ShopEditForm({ vendor, onSaved }: { vendor: Vendor; onSaved: () => Promise<void> }) {
  const t = useT();
  const colors = useThemeColors();

  const [cover, setCover] = useState<PhotoValue>(vendor.coverUrl ?? '');
  const [name, setName] = useState(vendor.name);
  const [isHalalCertified, setHalal] = useState(vendor.isHalalCertified);
  const [eta, setEta] = useState(String(vendor.deliveryEtaMin));
  const [week, setWeek] = useState<DayRow[]>(() => weekOf(vendor));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setDay(day: number, patch: Partial<DayRow>) {
    setWeek((current) => current.map((row) => (row.day === day ? { ...row, ...patch } : row)));
  }

  function copyMonday() {
    const monday = week.find((row) => row.day === MONDAY)!;
    setWeek((current) => current.map((row) => ({ ...row, open: monday.open, close: monday.close, closed: monday.closed })));
    Haptics.selectionAsync();
  }

  function validate(): ShopSettingsValues | null {
    // A closed day's times are hidden, so a half-typed one is reset rather
    // than reported where the merchant cannot see it.
    const hours = week.map((row) =>
      row.closed && !(isClock(row.open) && isClock(row.close))
        ? { ...row, open: DEFAULT_OPEN, close: DEFAULT_CLOSE }
        : row
    );
    const parsed = shopSettingsSchema.safeParse({ name, isHalalCertified, deliveryEtaMin: eta, hours });
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    const next: Errors = {};
    for (const issue of parsed.error.issues) {
      const [field, index] = issue.path;
      const key = (field === 'hours' ? `hours.${String(index)}` : String(field)) as keyof Errors;
      next[key] ??= t(issue.message as never);
    }
    setErrors(next);
    return null;
  }

  async function save() {
    const values = validate();
    if (!values || saving) return;
    setSaving(true);
    try {
      const coverUrl =
        typeof cover === 'string' ? cover : await vendorsApi.uploadShopCover(cover, mediaImageType(cover)!);
      setCover(coverUrl);

      const patch: vendorsApi.ShopPatch = {};
      if (values.name !== vendor.name) patch.name = values.name;
      if (values.isHalalCertified !== vendor.isHalalCertified) patch.isHalalCertified = values.isHalalCertified;
      if (Number(values.deliveryEtaMin) !== vendor.deliveryEtaMin) patch.deliveryEtaMin = Number(values.deliveryEtaMin);
      if (coverUrl !== (vendor.coverUrl ?? '')) patch.coverUrl = coverUrl;
      if (Object.keys(patch).length > 0) await vendorsApi.updateMyShop(patch);

      const nextWeek: VendorHours[] = values.hours;
      if (hoursChanged(weekOf(vendor), nextWeek)) await vendorsApi.setMyHours(nextWeek);

      await onSaved();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) router.back();
    } catch (error) {
      // The API's refusals are sentences ("Entre 10 et 180 minutes").
      setFormError(error instanceof ApiError && error.isClientError ? error.message : t('business.saveFailed'));
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('business.shopEdit.title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pb-10 gap-6"
        >
          <PhotoField
            label={t('business.shopEdit.cover')}
            hint={t('business.shopEdit.coverHint')}
            shape="wide"
            value={cover}
            onChange={setCover}
            disabled={saving}
          />

          <View className="gap-4">
            <Text variant="label" tone="muted">
              {t('business.shopEdit.details')}
            </Text>
            <Input
              label={t('business.shopForm.name')}
              value={name}
              onChangeText={setName}
              error={errors.name}
              required
            />
            <Input
              label={t('business.shopForm.eta')}
              value={eta}
              onChangeText={(next) => setEta(next.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              error={errors.deliveryEtaMin}
              helperText={t('business.shopEdit.etaHint')}
              required
            />
            <View className="flex-row items-center justify-between rounded-2xl bg-card px-4 py-3">
              <View className="flex-1 pr-3">
                <Text variant="caption" weight="semibold">
                  {t('business.shopEdit.halal')}
                </Text>
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {t('business.shopEdit.halalHint')}
                </Text>
              </View>
              <Switch
                value={isHalalCertified}
                onValueChange={setHalal}
                trackColor={{ false: colors.border, true: colors.primary }}
                accessibilityLabel={t('business.shopEdit.halal')}
              />
            </View>
          </View>

          <View className="gap-3">
            <View className="gap-1">
              <Text variant="label" tone="muted">
                {t('business.shopEdit.hours')}
              </Text>
              <Text variant="caption" tone="muted" className="text-[12px]">
                {t('business.shopEdit.hoursHint')}
              </Text>
            </View>

            <View className="rounded-[20px] bg-card px-4">
              {week.map((row, index) => {
                const dayName = t(weekdayLongKey(row.day));
                const error = errors[`hours.${index}`];
                return (
                  <View key={row.day} className={`py-3 gap-2.5 ${index > 0 ? 'border-t border-border' : ''}`}>
                    <View className="flex-row items-center justify-between">
                      <Text variant="caption" weight="semibold">
                        {dayName}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <Text variant="caption" tone={row.closed ? 'destructive' : 'muted'}>
                          {row.closed ? t('business.closed') : ''}
                        </Text>
                        <Switch
                          value={!row.closed}
                          onValueChange={(open) => setDay(row.day, { closed: !open })}
                          trackColor={{ false: colors.border, true: colors.primary }}
                          accessibilityLabel={t('business.shopEdit.openA11y', { day: dayName })}
                        />
                      </View>
                    </View>
                    {row.closed ? null : (
                      <View className="flex-row gap-3">
                        <View className="flex-1">
                          <Input
                            label={t('business.shopEdit.opens')}
                            value={row.open}
                            onChangeText={(next) => setDay(row.day, { open: typeClock(next) })}
                            keyboardType="number-pad"
                            maxLength={5}
                          />
                        </View>
                        <View className="flex-1">
                          <Input
                            label={t('business.shopEdit.closes')}
                            value={row.close}
                            onChangeText={(next) => setDay(row.day, { close: typeClock(next) })}
                            keyboardType="number-pad"
                            maxLength={5}
                          />
                        </View>
                      </View>
                    )}
                    {error ? (
                      <Text variant="caption" tone="destructive" className="text-[12px]">
                        {error}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <Pressable accessibilityRole="button" onPress={copyMonday} hitSlop={6} className="self-start py-1">
              <Text variant="caption" weight="semibold" tone="primary">
                {t('business.shopEdit.copyMonday')}
              </Text>
            </Pressable>
          </View>

          {formError ? (
            <Text variant="caption" tone="destructive">
              {formError}
            </Text>
          ) : null}

          <Button
            label={t('business.shopEdit.save')}
            variant="primary"
            size="lg"
            fullWidth
            loading={saving}
            onPress={save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function hoursChanged(before: DayRow[], after: VendorHours[]): boolean {
  return after.some((h) => {
    const was = before.find((b) => b.day === h.day);
    return !was || was.closed !== Boolean(h.closed) || (!h.closed && (was.open !== h.open || was.close !== h.close));
  });
}
