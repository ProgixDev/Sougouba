import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import {
  Bell,
  ChevronRight,
  Gift,
  Heart,
  Info,
  LogOut,
  MapPin,
  MessageCircleQuestion,
  Moon,
  Pencil,
  ReceiptText,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { ProfileHeader } from '@/components/customer';
import { LanguageToggle, Reveal, Text } from '@/components/ui';
import { loyaltyApi } from '@/data/api';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { useCustomerStats } from '@/hooks/useCustomerStats';
import { useDeleteAccount } from '@/hooks/useDeleteAccount';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { formatCad, formatMonthYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useThemeStore } from '@/store/useThemeStore';

export default function CustomerProfileScreen() {
  // `useT` also subscribes to the language, which the locale-formatted money
  // and dates on this screen need.
  const t = useT();
  const tabBarInset = useTabBarInset();
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const updateUser = useSessionStore((s) => s.updateUser);
  const signOut = useSessionStore((s) => s.signOut);
  const { confirmDeleteAccount } = useDeleteAccount();

  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const { colorScheme } = useColorScheme();

  const notifications = usePreferencesStore((s) => s.notifications);

  const { orderCount, favoriteCount, spentCad } = useCustomerStats();
  const isDark = preference === 'dark';

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const addressCount = user?.addresses.length ?? 0;
  const activeNotifications = Object.values(notifications).filter(Boolean).length;

  const [pointsBalance, setPointsBalance] = useState(0);
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

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        t('customer.profile.photoDeniedTitle'),
        t('customer.profile.photoDeniedBody')
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    updateUser({ avatarUrl: result.assets[0].uri });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // No imperative navigation on sign-out — clearing the session makes the
  // (customer) guard redirect to the auth landing on the next render.
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarInset + 28 }}
      >
        <ProfileHeader
          fullName={user?.fullName ?? ''}
          email={user?.email ?? ''}
          avatarUrl={user?.avatarUrl}
          memberSinceLabel={
            user?.memberSince
              ? t('customer.profile.memberSince', { date: formatMonthYear(user.memberSince) })
              : undefined
          }
          onChangePhoto={pickPhoto}
        />

        <Reveal delay={60}>
          <View className="mx-5 mt-5 flex-row rounded-[20px] bg-card px-2 py-4">
            <Stat label={t('customer.profile.statOrders')} value={String(orderCount)} />
            <StatDivider />
            <Stat label={t('customer.profile.statFavorites')} value={String(favoriteCount)} />
            <StatDivider />
            <Stat label={t('customer.profile.statSpent')} value={formatCad(spentCad)} />
          </View>
        </Reveal>

        <Reveal delay={110}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(routes.accountEdit)}
            className="mx-5 mt-3 h-12 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-border"
          >
            <Pencil size={16} color={colors.foreground} strokeWidth={2} />
            <Text variant="caption" weight="bold">
              {t('customer.profile.editProfile')}
            </Text>
          </Pressable>
        </Reveal>

        <Reveal delay={130}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('customer.profile.pointsA11y', { count: pointsBalance })}
            onPress={() => router.push(routes.accountPoints)}
            className="mx-5 mt-3 flex-row items-center gap-3 rounded-[20px] bg-primary/10 p-4 active:opacity-80"
          >
            <View className="w-10 h-10 items-center justify-center rounded-full bg-card">
              <Sparkles size={18} color={colors.primary} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text variant="caption" weight="bold" tone="primary">
                {t('customer.profile.pointsBalance', { count: pointsBalance })}
              </Text>
              <Text variant="caption" tone="muted" className="text-[12px]">
                {t('customer.profile.pointsDetail')}
              </Text>
            </View>
            <ChevronRight size={17} color={colors.primary} strokeWidth={2} />
          </Pressable>
        </Reveal>

        <Section title={t('customer.profile.rewards')} delay={145}>
          <NavRow icon={Gift} label={t('customer.account.refer.title')} onPress={() => router.push(routes.accountRefer)} />
        </Section>

        <Section title={t('customer.profile.purchases')} delay={160}>
          <NavRow
            icon={ReceiptText}
            label={t('customer.profile.myOrders')}
            value={orderCount > 0 ? String(orderCount) : undefined}
            onPress={() => router.push(routes.customerOrders)}
          />
          <Divider />
          <NavRow
            icon={Heart}
            label={t('customer.favorites.title')}
            value={favoriteCount > 0 ? String(favoriteCount) : undefined}
            onPress={() => router.push(routes.favorites)}
          />
        </Section>

        <Section title={t('customer.profile.deliveryAndPayment')} delay={200}>
          <NavRow
            icon={MapPin}
            label={t('customer.account.addresses.title')}
            value={addressCount > 0 ? String(addressCount) : t('customer.profile.noAddress')}
            onPress={() => router.push(routes.accountAddresses)}
          />
        </Section>

        <Section title={t('common.preferences.title')} delay={240}>
          <NavRow
            icon={Bell}
            label={t('customer.account.notifications.title')}
            value={t('customer.profile.notificationsValue', { count: activeNotifications })}
            onPress={() => router.push(routes.accountNotifications)}
          />
          <Divider />
          <View className="flex-row items-center gap-3 p-4">
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
          <Divider />
          <LanguageToggle />
        </Section>

        <Section title={t('customer.profile.about')} delay={280}>
          <NavRow
            icon={MessageCircleQuestion}
            label={t('customer.account.support.rowLabel')}
            onPress={() => router.push(routes.accountSupport)}
          />
          <Divider />
          <NavRow icon={Info} label={t('customer.account.about.title')} onPress={() => router.push(routes.accountAbout)} />
        </Section>

        <Reveal delay={320}>
          <View className="mt-6 mx-5 rounded-[20px] bg-card overflow-hidden">
            <NavRow icon={LogOut} label={t('customer.profile.signOut')} destructive onPress={signOut} />
            <Divider />
            <NavRow icon={Trash2} label={t('common.deleteAccount.action')} destructive onPress={confirmDeleteAccount} />
          </View>

          <Text variant="caption" tone="muted" className="text-center mt-6 text-[11px]">
            {t('common.appName')} — {t('customer.account.about.version', { version })} ·{' '}
            {colorScheme === 'dark' ? t('customer.themeDark') : t('customer.themeLight')}
          </Text>
        </Reveal>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay}>
      <View className="mt-7">
        <Text variant="label" tone="muted" className="px-5 pb-2.5">
          {title}
        </Text>
        <View className="mx-5 rounded-[20px] bg-card overflow-hidden">{children}</View>
      </View>
    </Reveal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text variant="subtitle" weight="bold" numberOfLines={1} className="text-[18px]">
        {value}
      </Text>
      <Text variant="caption" tone="muted" className="text-[12px]">
        {label}
      </Text>
    </View>
  );
}

function StatDivider() {
  return <View className="w-px bg-border my-1" />;
}

function NavRow({
  icon: Icon,
  label,
  value,
  destructive = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-3 p-4 active:opacity-70"
    >
      <View
        className={`w-9 h-9 items-center justify-center rounded-full ${
          destructive ? 'bg-destructive/10' : 'bg-muted'
        }`}
      >
        <Icon
          size={17}
          color={destructive ? colors.destructive : colors.mutedForeground}
          strokeWidth={2}
        />
      </View>
      <Text
        variant="caption"
        weight="semibold"
        tone={destructive ? 'destructive' : 'default'}
        className="flex-1"
      >
        {label}
      </Text>
      {value ? (
        <Text variant="caption" tone="muted">
          {value}
        </Text>
      ) : null}
      {!destructive ? <ChevronRight size={17} color={colors.mutedForeground} strokeWidth={2} /> : null}
    </Pressable>
  );
}

function Divider() {
  return <View className="h-px bg-border ml-16" />;
}
