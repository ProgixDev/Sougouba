import { useFocusEffect } from 'expo-router';
import { Bell, BellOff, PackageCheck, Tag, Truck, Store } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Reveal, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useThemeColors } from '@/hooks/useColorScheme';
import { notificationsBlocked } from '@/lib/push';
import {
  usePreferencesStore,
  type NotificationPreferences,
} from '@/store/usePreferencesStore';

/**
 * Each row says what arrives, not what the system sends: "Confirmation,
 * préparation, livraison" is checkable against your own phone in a way that
 * "mises à jour transactionnelles" is not.
 */
const rows: { key: keyof NotificationPreferences; icon: LucideIcon }[] = [
  { key: 'orderUpdates', icon: PackageCheck },
  { key: 'deliveryAlerts', icon: Truck },
  { key: 'promotions', icon: Tag },
  { key: 'newVendors', icon: Store },
];

export default function NotificationsScreen() {
  const t = useT();
  const colors = useThemeColors();
  const notifications = usePreferencesStore((s) => s.notifications);
  const setNotification = usePreferencesStore((s) => s.setNotification);

  const activeCount = Object.values(notifications).filter(Boolean).length;

  // The switches below are only half the story: if the phone itself blocks
  // Sougouba, nothing arrives whatever they say. Re-checked on focus, so coming
  // back from the system settings updates it.
  const [blocked, setBlocked] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void notificationsBlocked().then(setBlocked);
    }, [])
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.account.notifications.title')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-2 pb-8 gap-3">
        <Reveal>
          <View className="flex-row items-center gap-3 rounded-[20px] bg-muted p-4">
            <View className="w-10 h-10 items-center justify-center rounded-full bg-card">
              <Bell size={18} color={colors.primary} strokeWidth={2} />
            </View>
            <Text variant="caption" tone="muted" className="flex-1 text-[13px] leading-[18px]">
              {t('customer.notifications.activeCount', { count: activeCount })}
            </Text>
          </View>
        </Reveal>

        {blocked ? (
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-[20px] bg-card p-4 border border-border active:opacity-80"
          >
            <View className="w-10 h-10 items-center justify-center rounded-full bg-muted">
              <BellOff size={18} color={colors.destructive} strokeWidth={2} />
            </View>
            <View className="flex-1 gap-1">
              <Text variant="caption" className="text-[13px] leading-[18px]">
                {t('customer.account.notifications.blocked')}
              </Text>
              <Text variant="caption" weight="semibold" className="text-[13px]" style={{ color: colors.primary }}>
                {t('customer.account.notifications.openSettings')}
              </Text>
            </View>
          </Pressable>
        ) : null}

        <View className="rounded-[20px] bg-card overflow-hidden">
          {rows.map((row, index) => (
            <View key={row.key}>
              {index > 0 ? <View className="h-px bg-border ml-16" /> : null}
              <View className="flex-row items-start gap-3 p-4">
                <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
                  <row.icon size={17} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <View className="flex-1 gap-0.5 pr-2">
                  <Text variant="caption" weight="semibold">
                    {t(`customer.notificationRows.${row.key}.label`)}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[12px] leading-[17px]">
                    {t(`customer.notificationRows.${row.key}.body`)}
                  </Text>
                </View>
                <Switch
                  value={notifications[row.key]}
                  onValueChange={(next) => setNotification(row.key, next)}
                  accessibilityLabel={t(`customer.notificationRows.${row.key}.label`)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
            </View>
          ))}
        </View>

        <Text variant="caption" tone="muted" className="px-1 text-[12px] leading-[17px]">
              {t('customer.account.notifications.footnote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
