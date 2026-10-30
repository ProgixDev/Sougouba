import { useFocusEffect } from 'expo-router';
import {
  Bike,
  Car,
  ChevronRight,
  Landmark,
  LogOut,
  Moon,
  Motorbike,
  Phone,
  Route,
  ShieldCheck,
  Star,
  Sun,
} from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';

import { CourierGate, CourierSlabSurface, onCourierSlab } from '@/components/courier';
import { Avatar, LanguageToggle, Reveal, Text } from '@/components/ui';
import { BASE_FARE_CAD, PER_KM_CAD } from '@/data/courierPay';
import type { VehicleType } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useCourierEarnings } from '@/hooks/useCourierEarnings';
import { useCourierPayouts } from '@/hooks/useCourierPayouts';
import { useCourierProfile } from '@/hooks/useCourierProfile';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { summariseRuns } from '@/lib/courierAnalytics';
import { formatCad, formatMonthYear, formatRating } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { useT } from '@/lib/i18n/useT';
import { VEHICLE_KEYS } from '@/lib/validation/courier';
import { useSessionStore } from '@/store/useSessionStore';
import { useThemeStore } from '@/store/useThemeStore';
import { shadows } from '@/theme/shadows';
import { mustard } from '@/theme/tokens';

const VEHICLE_ICONS: Record<VehicleType, typeof Bike> = {
  bike: Bike,
  // `scooter` is the stored value; "Moto" is what it is called everywhere a
  // human reads it (see VEHICLE_KEYS), so the glyph follows the label.
  scooter: Motorbike,
  car: Car,
};

/**
 * The courier's own page.
 *
 * Built as an identity card rather than as a settings list: the merchant and
 * customer profiles are places you go to change something, but a courier's is
 * the record of what they have done — the platform's side of a relationship
 * where they are the one out in the weather. So the run count, the rating and
 * the kilometres are the page, and the switches are underneath it.
 *
 * A new courier has no rating, and the screen says "nouveau" rather than
 * printing "0,0 ★" — a zero here reads as a bad courier, not as an absent one.
 */
export default function CourierProfileScreen() {
  // `useT` also subscribes to the language, which the locale-formatted
  // earnings, distances and join date on this screen need.
  const t = useT();
  const tabBarInset = useTabBarInset();
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const signOut = useSessionStore((s) => s.signOut);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const isDark = preference === 'dark';

  const { courier, loading, missing, pending, reload } = useCourierProfile();
  const { runs } = useCourierEarnings(courier?.id);
  const allTime = useMemo(() => summariseRuns(runs, 3650), [runs]);
  const payouts = useCourierPayouts(courier?.status === 'approved');
  const reloadPayouts = payouts.reload;

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadPayouts();
    }, [reload, reloadPayouts])
  );

  if (loading) return null;
  if (missing || pending) {
    return <CourierGate state={missing ? 'missing' : 'pending'} onApproved={reload} />;
  }
  if (!courier) return null;

  const VehicleIcon = VEHICLE_ICONS[courier.vehicle];
  const rated = courier.deliveryCount > 0 && courier.rating > 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + 28 }}
      >
        {/* The slab, opened up: the same graphite-and-mustard surface the other
            two courier screens carry, tall enough to hold a portrait.
            The avatar sits *inside* it rather than straddling the bottom edge —
            centred on the seam it landed on top of the vehicle and status chips,
            which is the kind of collision that only shows up once there is a
            real name in it. The card below straddles the seam instead: it is a
            rectangle, so it can overlap without covering anything. */}
        <CourierSlabSurface topPadding={16} bottomPadding={56}>
          <View className="items-center gap-3 px-5">
            <View
              className="rounded-full"
              style={{ padding: 4, borderRadius: 999, backgroundColor: onCourierSlab.fill }}
            >
              <Avatar uri={courier.photoUrl} fullName={courier.fullName} size={82} />
            </View>

            <View className="items-center gap-2.5">
              <Text variant="label" style={{ color: onCourierSlab.accent }} className="text-[10px]">
                {t('courier.profile.roleLabel')}
              </Text>
              <Text
                variant="title"
                weight="bold"
                numberOfLines={1}
                style={{ color: onCourierSlab.text }}
                className="text-[24px] leading-[29px]"
              >
                {courier.fullName}
              </Text>
              <View className="flex-row items-center gap-2">
                <View
                  className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ backgroundColor: onCourierSlab.fill }}
                >
                  <VehicleIcon size={13} color={onCourierSlab.muted} strokeWidth={2} />
                  <Text
                    variant="caption"
                    weight="semibold"
                    className="text-[11px]"
                    style={{ color: onCourierSlab.muted }}
                  >
                    {t(VEHICLE_KEYS[courier.vehicle])}
                    {courier.plate ? ` · ${courier.plate}` : ''}
                  </Text>
                </View>
                <View
                  className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
                  style={{ backgroundColor: onCourierSlab.fill }}
                >
                  <ShieldCheck size={13} color={onCourierSlab.accent} strokeWidth={2.2} />
                  <Text
                    variant="caption"
                    weight="semibold"
                    className="text-[11px]"
                    style={{ color: onCourierSlab.accent }}
                  >
                    {t('courier.profile.approved')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </CourierSlabSurface>

        {/* Lifted onto the seam. The shadow is what makes the overlap read as
            one card in front of the header rather than as a header that ends
            in the wrong place. */}
        <View className="px-5 gap-4" style={{ marginTop: -34 }}>
          <Reveal>
            <View className="rounded-[20px] bg-card px-4 py-4 flex-row" style={shadows.floating}>
              <Stat
                // The count in the orders table, not the file's own
                // `deliveryCount`. The two disagree by design — a seeded courier
                // carries months of tenure and only the last few weeks of
                // orders — and the Courses tab one swipe away prints the table's
                // figure. A profile claiming 686 over a history holding 99 is
                // the app contradicting itself in front of the user.
                value={String(runs.length > 0 ? allTime.runCount : courier.deliveryCount)}
                label="courses"
              />
              <Stat
                value={rated ? formatRating(courier.rating) : '—'}
                label={rated ? 'note' : 'nouveau'}
                icon={rated ? Star : undefined}
                divided
              />
              <Stat
                value={formatDistance(allTime.distanceKm)}
                label="parcourus"
                divided
              />
            </View>
          </Reveal>

          <Reveal index={1}>
            <View className="rounded-[20px] bg-card p-4 gap-3.5">
              <Text variant="label" tone="muted" className="text-[10px]">
                {t('courier.profile.yourFile')}
              </Text>
              <Row icon={Phone} label={t('courier.profile.phone')} value={courier.phone} colors={colors} />
              <Row icon={Route} label="Secteur" value={courier.city} colors={colors} />
              {/* Absent on the eight seeded couriers, who predate in-app
                  registration — the rows are not drawn empty. */}
              {courier.insurance ? (
                <Row
                  icon={ShieldCheck}
                  label="Assurance"
                  value={t('courier.insuranceLine', {
                    insurer: courier.insurance.insurerName,
                    expiry: courier.insurance.expiry,
                  })}
                  colors={colors}
                />
              ) : null}
              {/* Stripe's status, not a bank number: the account lives with
                  Stripe and this app never holds it. Tappable while there is
                  something left to do there. */}
              <PayoutRow
                label="Versements"
                value={t(`courier.payouts.row.${payouts.state}`)}
                actionable={payouts.state === 'setup' || payouts.state === 'review'}
                busy={payouts.settingUp}
                onPress={payouts.setUp}
                colors={colors}
              />
              {payouts.error ? (
                <Text variant="caption" tone="destructive" className="text-[12px] leading-[18px]">
                  {payouts.error}
                </Text>
              ) : null}
              <Row
                icon={Star}
                label="Membre depuis"
                value={capitalise(formatMonthYear(courier.joinedAt))}
                colors={colors}
              />
            </View>
          </Reveal>

          <Reveal index={2}>
            <View className="rounded-[20px] bg-card p-4 gap-3">
              <Text variant="label" tone="muted" className="text-[10px]">
                {t('courier.profile.yourPay')}
              </Text>
              <Rate label="Prise en charge" value={t('courier.baseFarePerRun', { amount: formatCad(BASE_FARE_CAD) })} />
              <Rate label="Distance" value={t('courier.perKm', { amount: formatCad(PER_KM_CAD) })} />
              <Rate label="Pourboires" value={t('courier.allYours')} />
              <View className="h-px bg-border mt-0.5" />
              <View className="flex-row items-baseline justify-between">
                <Text variant="caption" weight="bold" className="text-[14px]">
                  {t('courier.profile.lifetimeEarnings')}
                </Text>
                <Text
                  weight="bold"
                  className="text-[19px]"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatCad(allTime.earningsCad)}
                </Text>
              </View>
            </View>
          </Reveal>

          <Reveal index={3}>
            <View className="rounded-[20px] bg-card overflow-hidden">
              <View className="flex-row items-center gap-3 p-4">
                <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
                  {isDark ? (
                    <Moon size={17} color={colors.mutedForeground} strokeWidth={2} />
                  ) : (
                    <Sun size={17} color={colors.mutedForeground} strokeWidth={2} />
                  )}
                </View>
                <Text variant="caption" weight="bold" className="flex-1 text-[14px]">
                  {t('common.preferences.darkMode')}
                </Text>
                <Switch
                  value={isDark}
                  onValueChange={(on) => setPreference(on ? 'dark' : 'light')}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View className="h-px bg-border ml-16" />
              <LanguageToggle />
            </View>
          </Reveal>

          {/* Separated from the card above by a full section gap, not a
              hairline: signing out is not another setting in the same list, and
              the space is what stops a thumb reaching for the theme switch from
              finding it. */}
          <Reveal index={4}>
            <Pressable
              accessibilityRole="button"
              onPress={signOut}
              className="flex-row items-center gap-3 rounded-[20px] bg-card p-4 active:opacity-80"
            >
              <View className="w-9 h-9 items-center justify-center rounded-full bg-destructive/10">
                <LogOut size={17} color={colors.destructive} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="caption" weight="bold" tone="destructive" className="text-[14px]">
                  {t('courier.profile.signOut')}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1} className="text-[12px]">
                  {user?.email}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
            </Pressable>
          </Reveal>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({
  value,
  label,
  icon: Icon,
  divided = false,
}: {
  value: string;
  label: string;
  icon?: typeof Star;
  divided?: boolean;
}) {
  return (
    <View className="flex-1 flex-row">
      {divided ? <View className="w-px bg-border my-0.5" /> : null}
      <View className={`flex-1 items-center gap-1 ${divided ? 'pl-2' : 'pr-2'}`}>
        <View className="flex-row items-center gap-1">
          {Icon ? <Icon size={14} color={mustard[500]} fill={mustard[500]} strokeWidth={0} /> : null}
          <Text
            variant="title"
            weight="bold"
            numberOfLines={1}
            className="text-[20px] leading-[24px]"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {value}
          </Text>
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
          {label}
        </Text>
      </View>
    </View>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  colors,
}: {
  icon: typeof Bike;
  label: string;
  value: string;
  colors: { mutedForeground: string };
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Icon size={16} color={colors.mutedForeground} strokeWidth={2} />
      <Text variant="caption" tone="muted" className="flex-1 text-[13px]">
        {label}
      </Text>
      <Text variant="caption" weight="bold" numberOfLines={1} className="text-[13px]">
        {value}
      </Text>
    </View>
  );
}

function PayoutRow({
  label,
  value,
  actionable,
  busy,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  actionable: boolean;
  busy: boolean;
  onPress: () => void;
  colors: { mutedForeground: string; primary: string };
}) {
  const content = (
    <>
      <Landmark size={16} color={colors.mutedForeground} strokeWidth={2} />
      <Text variant="caption" tone="muted" className="flex-1 text-[13px]">
        {label}
      </Text>
      <Text
        variant="caption"
        weight="bold"
        numberOfLines={1}
        className="text-[13px]"
        style={actionable ? { color: colors.primary } : undefined}
      >
        {value}
      </Text>
      {actionable ? (
        busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <ChevronRight size={15} color={colors.primary} strokeWidth={2.2} />
        )
      ) : null}
    </>
  );

  if (!actionable) return <View className="flex-row items-center gap-3">{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={onPress}
      // Taller than the rows around it: this one is a control, and 44 pt is the
      // floor for something a thumb has to hit.
      hitSlop={{ top: 10, bottom: 10 }}
      className="flex-row items-center gap-3 active:opacity-70"
    >
      {content}
    </Pressable>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text variant="caption" tone="muted" className="text-[13px]">
        {label}
      </Text>
      <Text variant="caption" weight="bold" className="text-[13px]">
        {value}
      </Text>
    </View>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
