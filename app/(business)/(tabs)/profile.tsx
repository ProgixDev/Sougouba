import { router } from 'expo-router';
import {
  ChevronRight,
  Clock,
  Clock3,
  FileText,
  LogOut,
  MapPin,
  Moon,
  PencilLine,
  Receipt,
  Star,
  Store,
  Sun,
  TicketPercent,
  Trash2,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';

import { CounterHeader, DeliveryGrid } from '@/components/business';
import {
  Badge,
  Button,
  CatalogImage,
  LanguageToggle,
  Reveal,
  Skeleton,
  Text,
} from '@/components/ui';
import { MIN_DELIVERY_FEE_CAD } from '@/data/deliveryPricing';
import type { MerchantSubscription } from '@/data/api/vendors';
import { usePlatformPlan } from '@/data/queries';
import type { VendorHours } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useDeleteAccount } from '@/hooks/useDeleteAccount';
import { useMerchantSubscription } from '@/hooks/useMerchantSubscription';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { formatCad, formatDate, formatPercent } from '@/lib/format';
import type { TFunction } from '@/lib/i18n';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';
import { shopDay, shopStatusLine, shopWeekday } from '@/lib/shopHours';
import { weekdayLongKey } from '@/lib/weekdays';
import { useSessionStore } from '@/store/useSessionStore';
import { useThemeStore } from '@/store/useThemeStore';
import { mustard } from '@/theme/tokens';

export default function BusinessProfileScreen() {
  // Prices on this screen are locale-formatted — see the note in the customer profile.
  const t = useT();
  const tabBarInset = useTabBarInset();
  const user = useSessionStore((s) => s.user);
  const signOut = useSessionStore((s) => s.signOut);
  const { confirmDeleteAccount } = useDeleteAccount();
  const { vendor, loading, missing, approved, accepted, reload: reloadVendor } = useOwnerVendor();
  const plan = usePlatformPlan();
  // `accepted`: a shop offline for its subscription keeps this screen, which is where it pays.
  const billing = useMerchantSubscription(accepted);

  // Reading the subscription is when the server puts the shop where it belongs
  // — online again right after a payment. When that is no longer where this
  // screen has it, read the shop again.
  const offline = billing.subscription?.offline;
  const shopOnHold = vendor?.status === 'subscription_hold';
  useEffect(() => {
    if (offline !== undefined && offline !== shopOnHold) void reloadVendor();
  }, [offline, shopOnHold, reloadVendor]);

  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const colors = useThemeColors();
  const isDark = preference === 'dark';

  const today = shopWeekday();
  const day = vendor ? shopDay(vendor) : null;

  return (
    <View className="flex-1 bg-background">
      <CounterHeader
        title={vendor?.name ?? t('business.metrics.shop')}
        eyebrow={day ? t(shopStatusLine(day)) : undefined}
        tradingState={day ? (day.isOpen ? 'open' : 'closed') : undefined}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: tabBarInset + 28 }}
      >
        {loading ? (
          <View className="px-5 gap-3">
            <Skeleton height={150} radius={20} />
            <Skeleton height={200} radius={20} />
          </View>
        ) : accepted && vendor ? (
          <>
            <Reveal className="mx-5 rounded-[20px] bg-card overflow-hidden">
              <CatalogImage id={vendor.id} kind="vendor" path={vendor.coverUrl} radius={0} height={130} />
              <View className="p-4 gap-2.5">
                <View className="flex-row items-start justify-between gap-3">
                  <Text variant="subtitle" weight="bold" className="flex-1" numberOfLines={1}>
                    {vendor.name}
                  </Text>
                  {vendor.isHalalCertified ? <Badge label="Halal" tone="success" size="sm" /> : null}
                </View>
                <View className="flex-row items-center gap-1.5">
                  <MapPin size={14} color={colors.mutedForeground} strokeWidth={2} />
                  <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
                    {vendor.address.street}, {vendor.city}
                  </Text>
                </View>
                <View className="flex-row items-center gap-4 mt-1">
                  <View className="flex-row items-center gap-1.5">
                    <Star size={14} color={mustard[500]} fill={mustard[500]} strokeWidth={0} />
                    <Text variant="caption" weight="semibold">
                      {vendor.rating.toFixed(1)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      ({vendor.reviewCount})
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={14} color={colors.mutedForeground} strokeWidth={2} />
                    <Text variant="caption" tone="muted">
                      {vendor.deliveryEtaMin} min
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Truck size={14} color={colors.mutedForeground} strokeWidth={2} />
                    <Text variant="caption" tone="muted">
                      {t('business.shopProfile.feeFrom', { amount: formatCad(MIN_DELIVERY_FEE_CAD) })}
                    </Text>
                  </View>
                </View>
              </View>
            </Reveal>

            <Reveal delay={60} className="mt-4 mx-5 rounded-[20px] bg-card p-4 gap-3">
              <Text variant="label" tone="muted" className="text-[10px]">
                {t('business.shopProfile.openingHours')}
              </Text>
              <View className="gap-2">
                {[...vendor.hours]
                  // Seeded Sunday-first; show Monday-first, which is how Quebec
                  // shops list their hours.
                  .sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7))
                  .map((entry) => (
                    <HoursRow key={entry.day} entry={entry} isToday={entry.day === today} />
                  ))}
              </View>
            </Reveal>

            <Reveal delay={80} className="mt-4 mx-5">
              <DeliveryGrid />
            </Reveal>
          </>
        ) : (
          /* The profile tab keeps its own version of this state rather than
             handing over to `PendingApproval`: the account and theme rows below
             still belong to a merchant whose shop is not live yet. */
          <View className="mx-5 rounded-[20px] bg-card p-6 items-center gap-3">
            <View className="w-14 h-14 items-center justify-center rounded-full bg-muted">
              {missing ? (
                <Store size={24} color={colors.mutedForeground} strokeWidth={1.75} />
              ) : (
                <Clock3 size={24} color={colors.mutedForeground} strokeWidth={1.75} />
              )}
            </View>
            <Text variant="caption" weight="bold">
              {missing ? t('business.shopProfile.noShopTitle') : t('business.shopProfile.pendingTitle')}
            </Text>
            <Text variant="caption" tone="muted" className="text-center">
              {missing
                ? t('business.shopProfile.noShopBody')
                : t('business.shopProfile.pendingBody')}
            </Text>
            {missing ? (
              <Button
                label={t('business.shopProfile.registerShop')}
                variant="outline"
                size="sm"
                onPress={() => router.push(routes.businessSignup)}
              />
            ) : null}
          </View>
        )}

        {/* Editing is open to a pending shop too — hours and a cover are what a
            merchant sets up while waiting. Promo codes are not: there is
            nothing to apply them to yet. */}
        {vendor ? (
          <Reveal delay={90} className="mt-4 mx-5 rounded-[20px] bg-card overflow-hidden">
            <MenuRow
              icon={PencilLine}
              title={t('business.shopEdit.title')}
              hint={t('business.shopEdit.rowHint')}
              onPress={() => router.push(routes.businessShopEdit)}
            />
            {/* Promo codes are for a shop that is selling; the server refuses one otherwise. */}
            {approved ? (
              <>
                <View className="h-px bg-border ml-16" />
                <MenuRow
                  icon={TicketPercent}
                  title={t('business.coupons.title')}
                  hint={t('business.coupons.rowHint')}
                  onPress={() => router.push(routes.businessCoupons)}
                />
              </>
            ) : null}
            {/* Statements and payouts stay: a shop offline for its subscription is still owed what it sold. */}
            {accepted ? (
              <>
                <View className="h-px bg-border ml-16" />
                <MenuRow
                  icon={FileText}
                  title={t('business.statements.title')}
                  hint={t('business.statements.rowHint')}
                  onPress={() => router.push(routes.businessStatements)}
                />
              </>
            ) : null}
          </Reveal>
        ) : null}

        {/* What selling here costs, stated once where a merchant would look for
            it (CDC addendum v1.1, §05). Both charges apply — the subscription is
            not an alternative to the commission. */}
        {accepted && vendor ? (
          <Reveal delay={100} className="mt-4 mx-5 rounded-[20px] bg-card p-4 gap-3">
            <Text variant="label" tone="muted" className="text-[10px]">
              {t('business.shopProfile.yourPlan')}
            </Text>
            <View className="flex-row items-center gap-3">
              <View className="w-9 h-9 items-center justify-center rounded-full bg-primary/10">
                <Receipt size={17} color={colors.primary} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="caption" weight="semibold">
                  {/* A subscribed shop is shown the price it is billed, which can be an older one than today's. */}
                  {t('business.shopProfile.monthlyFee', {
                    amount: formatCad(billing.subscription?.priceCad ?? plan.monthlySubscriptionCad),
                  })}
                </Text>
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {t('business.shopProfile.commissionLine', { rate: formatPercent(plan.commissionRate) })}
                </Text>
              </View>
            </View>
            {/* Where the subscription stands, and the one thing to do about it. Absent
                while it is unread or the server has no Stripe: the price above still holds. */}
            {billing.subscription?.available ? (
              <View className="gap-2.5 pt-1">
                <Text
                  variant="caption"
                  tone={billing.subscription.status === 'past_due' ? 'destructive' : 'muted'}
                  weight={billing.subscription.status === 'past_due' ? 'semibold' : undefined}
                  className="text-[12px]"
                >
                  {subscriptionLine(t, billing.subscription)}
                </Text>
                {/* What the subscription means for the shop being online — only while it is required to sell. */}
                {subscriptionNotice(t, billing.subscription) ? (
                  <Text
                    variant="caption"
                    tone={billing.subscription.offline || billing.subscription.offlineAt ? 'destructive' : 'muted'}
                    weight="semibold"
                    className="text-[12px] leading-[18px]"
                  >
                    {subscriptionNotice(t, billing.subscription)}
                  </Text>
                ) : null}
                {billing.subscription.status === 'active' ? (
                  <Button
                    label={t('business.subscription.manage')}
                    variant="outline"
                    size="sm"
                    fullWidth
                    loading={billing.busy}
                    onPress={() => void billing.manage()}
                  />
                ) : billing.subscription.status === 'past_due' ? (
                  <Button
                    label={t('business.subscription.updateCard')}
                    variant="primary"
                    size="sm"
                    fullWidth
                    loading={billing.busy}
                    onPress={() => void billing.manage()}
                  />
                ) : (
                  <Button
                    label={t('business.subscription.subscribe')}
                    variant="primary"
                    size="sm"
                    fullWidth
                    loading={billing.busy}
                    onPress={() => void billing.subscribe()}
                  />
                )}
                {billing.error ? (
                  <Text variant="caption" tone="destructive" className="text-[12px]">
                    {billing.error}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Reveal>
        ) : null}

        <Reveal delay={120} className="mt-4 mx-5 rounded-[20px] bg-card p-4 gap-3">
          <Text variant="label" tone="muted" className="text-[10px]">
            {t('business.shopProfile.account')}
          </Text>
          <View className="gap-0.5">
            <Text variant="caption" weight="semibold">
              {user?.fullName}
            </Text>
            <Text variant="caption" tone="muted">
              {user?.email}
            </Text>
          </View>
        </Reveal>

        <Reveal delay={160} className="mt-4 mx-5 rounded-[20px] bg-card p-4">
          <View className="flex-row items-center gap-3">
            <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
              {isDark ? (
                <Moon size={17} color={colors.foreground} strokeWidth={2} />
              ) : (
                <Sun size={17} color={colors.primary} strokeWidth={2} />
              )}
            </View>
            <Text variant="caption" weight="semibold" className="flex-1">
              {t('common.preferences.darkMode')}
            </Text>
            <Switch
              value={isDark}
              onValueChange={(next) => setPreference(next ? 'dark' : 'light')}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel={t('common.preferences.darkModeA11y')}
            />
          </View>
          <View className="h-px bg-border my-3" />
          <LanguageToggle className="flex-row items-center gap-3" />
        </Reveal>

        <Reveal delay={200} className="mt-4 mx-5 rounded-[20px] bg-card overflow-hidden">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('business.shopProfile.signOut')}
            onPress={signOut}
            className="flex-row items-center gap-3 p-4 active:bg-muted"
          >
            <View className="w-9 h-9 items-center justify-center rounded-full bg-destructive/10">
              <LogOut size={17} color={colors.destructive} strokeWidth={2} />
            </View>
            <Text variant="caption" weight="semibold" tone="destructive" className="flex-1">
              {t('business.shopProfile.signOut')}
            </Text>
          </Pressable>
          <View className="h-px bg-border ml-16" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.deleteAccount.action')}
            onPress={confirmDeleteAccount}
            className="flex-row items-center gap-3 p-4 active:bg-muted"
          >
            <View className="w-9 h-9 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 size={17} color={colors.destructive} strokeWidth={2} />
            </View>
            <Text variant="caption" weight="semibold" tone="destructive" className="flex-1">
              {t('common.deleteAccount.action')}
            </Text>
          </Pressable>
        </Reveal>
      </ScrollView>
    </View>
  );
}

function MenuRow({
  icon: Icon,
  title,
  hint,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center gap-3 p-4 active:bg-muted"
    >
      <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
        <Icon size={17} color={colors.mutedForeground} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="caption" weight="semibold">
          {title}
        </Text>
        <Text variant="caption" tone="muted" className="text-[12px]">
          {hint}
        </Text>
      </View>
      <ChevronRight size={17} color={colors.mutedForeground} strokeWidth={2} />
    </Pressable>
  );
}

function HoursRow({ entry, isToday }: { entry: VendorHours; isToday: boolean }) {
  const t = useT();
  return (
    <View className="flex-row items-center justify-between">
      <Text
        variant="caption"
        weight={isToday ? 'bold' : 'regular'}
        tone={isToday ? 'default' : 'muted'}
      >
        {isToday
          ? t('business.shopProfile.hoursToday', { day: t(weekdayLongKey(entry.day)) })
          : t(weekdayLongKey(entry.day))}
      </Text>
      <Text
        variant="caption"
        weight={isToday ? 'semibold' : 'regular'}
        tone={entry.closed ? 'destructive' : isToday ? 'default' : 'muted'}
      >
        {entry.closed ? t('business.closed') : `${entry.open} – ${entry.close}`}
      </Text>
    </View>
  );
}

/**
 * One sentence for where the subscription stands. A cancelled subscription is
 * still "active" at Stripe until the month already paid for runs out, so the
 * end date is what is said — not a status the merchant would read as a mistake.
 */
/** Offline, about to be, or simply required — null while the subscription has no bearing on the shop being online. */
function subscriptionNotice(t: TFunction, subscription: MerchantSubscription): string | null {
  if (subscription.offline) return t('business.subscription.offline');
  if (subscription.offlineAt) return t('business.subscription.offlineOn', { date: formatDate(subscription.offlineAt) });
  const subscribed = subscription.status === 'active' || subscription.status === 'past_due';
  return subscription.required && !subscribed ? t('business.subscription.required') : null;
}

function subscriptionLine(t: TFunction, subscription: MerchantSubscription): string {
  switch (subscription.status) {
    case 'active':
      if (subscription.cancelAt) return t('business.subscription.endsOn', { date: formatDate(subscription.cancelAt) });
      return subscription.currentPeriodEnd
        ? t('business.subscription.renewsOn', { date: formatDate(subscription.currentPeriodEnd) })
        : t('business.subscription.active');
    case 'past_due':
      return t('business.subscription.pastDue');
    case 'canceled':
      return t('business.subscription.ended');
    default:
      return t('business.subscription.notSubscribed');
  }
}
