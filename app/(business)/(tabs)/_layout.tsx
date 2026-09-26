import { Tabs } from 'expo-router';
import { Boxes, ChartColumn, ClipboardList, Gauge, Store } from 'lucide-react-native';

import { TabBarBackground, TabBarIcon } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useColorScheme } from '@/hooks/useColorScheme';
import { darkColors, lightColors } from '@/theme/colors';

export const unstable_settings = { anchor: 'dashboard' };

export default function BusinessTabsLayout() {
  const t = useT();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Tab switching defaults to `none` in expo-router 57 — see the note in
        // the customer tab layout.
        animation: 'shift',
        // Absolute + transparent so content scrolls under the frosted background.
        // Every screen inside (tabs) reserves useTabBarInset() at its bottom.
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: colors.border,
        },
        tabBarBackground: () => <TabBarBackground />,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        // "Tableau de bord" overflows a 5-tab bar and renders as "Tableau de…".
        // "Aperçu" is the idiomatic short form French merchant tools use.
        options={{ title: t('business.tabs.dashboard'), tabBarIcon: (props) => <TabBarIcon icon={Gauge} {...props} /> }}
      />
      <Tabs.Screen
        name="catalog"
        options={{ title: t('business.tabs.catalog'), tabBarIcon: (props) => <TabBarIcon icon={Boxes} {...props} /> }}
      />
      {/* The icons used to be Store for Commandes and User for Boutique — the
          shop glyph on the order queue and a person on the shop's own page. */}
      <Tabs.Screen
        name="orders"
        options={{ title: t('business.tabs.orders'), tabBarIcon: (props) => <TabBarIcon icon={ClipboardList} {...props} /> }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ title: t('business.tabs.analytics'), tabBarIcon: (props) => <TabBarIcon icon={ChartColumn} {...props} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('business.tabs.profile'), tabBarIcon: (props) => <TabBarIcon icon={Store} {...props} /> }}
      />
    </Tabs>
  );
}
