import { Clock, LogOut, MapPin, Moon, Star, Store, Sun, Truck } from 'lucide-react-native';
import { Pressable, ScrollView, Switch, View } from 'react-native';

import { CounterHeader } from '@/components/business';
import { Badge, CatalogImage, Reveal, Skeleton, Text } from '@/components/ui';
import type { VendorHours } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { formatCad } from '@/lib/format';
import { shopDay, shopStatusLine } from '@/lib/shopHours';
import { useSessionStore } from '@/store/useSessionStore';
import { useThemeStore } from '@/store/useThemeStore';
import { mustard } from '@/theme/tokens';

/** `VendorHours.day` is 0 = Sunday, matching `Date.getDay()`. */
const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default function BusinessProfileScreen() {
  const tabBarInset = useTabBarInset();
  const user = useSessionStore((s) => s.user);
  const signOut = useSessionStore((s) => s.signOut);
  const { vendor, loading } = useOwnerVendor();

  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const colors = useThemeColors();
  const isDark = preference === 'dark';

  const today = new Date().getDay();
  const day = vendor ? shopDay(vendor) : null;

  return (
    <View className="flex-1 bg-background">
      <CounterHeader
        title={vendor?.name ?? 'Boutique'}
        eyebrow={day ? shopStatusLine(day) : undefined}
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
        ) : vendor ? (
          <>
            <Reveal className="mx-5 rounded-[20px] bg-card overflow-hidden">
              <CatalogImage id={vendor.id} kind="vendor" radius={0} height={130} />
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
                      {formatCad(vendor.deliveryFeeCad)}
                    </Text>
                  </View>
                </View>
              </View>
            </Reveal>

            <Reveal delay={60} className="mt-4 mx-5 rounded-[20px] bg-card p-4 gap-3">
              <Text variant="label" tone="muted" className="text-[10px]">
                Heures d’ouverture
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
          </>
        ) : (
          <View className="mx-5 rounded-[20px] bg-card p-6 items-center gap-3">
            <View className="w-14 h-14 items-center justify-center rounded-full bg-muted">
              <Store size={24} color={colors.mutedForeground} strokeWidth={1.75} />
            </View>
            <Text variant="caption" weight="bold">
              Aucune boutique associée
            </Text>
            <Text variant="caption" tone="muted" className="text-center">
              Ce compte n’est pas encore rattaché à une boutique Sougouba.
            </Text>
          </View>
        )}

        <Reveal delay={120} className="mt-4 mx-5 rounded-[20px] bg-card p-4 gap-3">
          <Text variant="label" tone="muted" className="text-[10px]">
            Compte
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
              Mode sombre
            </Text>
            <Switch
              value={isDark}
              onValueChange={(next) => setPreference(next ? 'dark' : 'light')}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel="Activer le mode sombre"
            />
          </View>
        </Reveal>

        <Reveal delay={200} className="mt-4 mx-5 rounded-[20px] bg-card overflow-hidden">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Se déconnecter"
            onPress={signOut}
            className="flex-row items-center gap-3 p-4 active:bg-muted"
          >
            <View className="w-9 h-9 items-center justify-center rounded-full bg-destructive/10">
              <LogOut size={17} color={colors.destructive} strokeWidth={2} />
            </View>
            <Text variant="caption" weight="semibold" tone="destructive" className="flex-1">
              Se déconnecter
            </Text>
          </Pressable>
        </Reveal>
      </ScrollView>
    </View>
  );
}

function HoursRow({ entry, isToday }: { entry: VendorHours; isToday: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        variant="caption"
        weight={isToday ? 'bold' : 'regular'}
        tone={isToday ? 'default' : 'muted'}
      >
        {DAY_NAMES[entry.day]}
        {isToday ? " · aujourd'hui" : ''}
      </Text>
      <Text
        variant="caption"
        weight={isToday ? 'semibold' : 'regular'}
        tone={entry.closed ? 'destructive' : isToday ? 'default' : 'muted'}
      >
        {entry.closed ? 'Fermé' : `${entry.open} – ${entry.close}`}
      </Text>
    </View>
  );
}
