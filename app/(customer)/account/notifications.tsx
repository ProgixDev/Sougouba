import { Bell, PackageCheck, Tag, Truck, Store } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Reveal, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import {
  usePreferencesStore,
  type NotificationPreferences,
} from '@/store/usePreferencesStore';

/**
 * Each row says what arrives, not what the system sends: "Confirmation,
 * préparation, livraison" is checkable against your own phone in a way that
 * "mises à jour transactionnelles" is not.
 */
const rows: {
  key: keyof NotificationPreferences;
  icon: LucideIcon;
  label: string;
  description: string;
}[] = [
  {
    key: 'orderUpdates',
    icon: PackageCheck,
    label: 'Suivi de commande',
    description: 'Confirmation, préparation et commande prête à partir.',
  },
  {
    key: 'deliveryAlerts',
    icon: Truck,
    label: 'Livraison en approche',
    description: 'Un avis quand le livreur part et quand il arrive chez vous.',
  },
  {
    key: 'promotions',
    icon: Tag,
    label: 'Promotions',
    description: 'Rabais et offres des commerces où vous avez déjà commandé.',
  },
  {
    key: 'newVendors',
    icon: Store,
    label: 'Nouveaux commerces',
    description: 'Quand une épicerie ouvre la livraison dans votre quartier.',
  },
];

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const notifications = usePreferencesStore((s) => s.notifications);
  const setNotification = usePreferencesStore((s) => s.setNotification);

  const activeCount = Object.values(notifications).filter(Boolean).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Notifications" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-2 pb-8 gap-3">
        <Reveal>
          <View className="flex-row items-center gap-3 rounded-[20px] bg-muted p-4">
            <View className="w-10 h-10 items-center justify-center rounded-full bg-card">
              <Bell size={18} color={colors.primary} strokeWidth={2} />
            </View>
            <Text variant="caption" tone="muted" className="flex-1 text-[13px] leading-[18px]">
              {activeCount === 0
                ? 'Toutes les notifications sont désactivées. Vous ne recevrez aucun avis de livraison.'
                : `${activeCount} type${activeCount > 1 ? 's' : ''} d’avis activé${activeCount > 1 ? 's' : ''}.`}
            </Text>
          </View>
        </Reveal>

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
                    {row.label}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[12px] leading-[17px]">
                    {row.description}
                  </Text>
                </View>
                <Switch
                  value={notifications[row.key]}
                  onValueChange={(next) => setNotification(row.key, next)}
                  accessibilityLabel={row.label}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
            </View>
          ))}
        </View>

        <Text variant="caption" tone="muted" className="px-1 text-[12px] leading-[17px]">
          Ces préférences sont enregistrées sur cet appareil. Le prototype n’envoie pas de
          notifications réelles.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
