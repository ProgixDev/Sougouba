import { Tabs } from 'expo-router';
import { House, ReceiptText, Search, ShoppingCart, User } from 'lucide-react-native';

import { TabBarBackground, TabBarIcon } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useCartStore } from '@/store/useCartStore';
import { darkColors, lightColors } from '@/theme/colors';

export const unstable_settings = { anchor: 'home' };

export default function CustomerTabsLayout() {
  const t = useT();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  // Total units, not line count — adding a second jar of the same harissa should
  // move the badge.
  const cartCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.qty, 0));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Tab switching defaults to `none` in expo-router 57, which is why moving
        // between tabs read as a hard cut. 'shift' slides the outgoing and
        // incoming screens by a few points in the direction of travel.
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
        name="home"
        options={{
          title: t('customer.tabs.home'),
          tabBarIcon: (props) => <TabBarIcon icon={House} {...props} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('customer.tabs.search'),
          tabBarIcon: (props) => <TabBarIcon icon={Search} {...props} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('customer.tabs.cart'),
          tabBarIcon: (props) => <TabBarIcon icon={ShoppingCart} {...props} />,
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.secondary, fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('customer.tabs.orders'),
          tabBarIcon: (props) => <TabBarIcon icon={ReceiptText} {...props} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('customer.tabs.profile'),
          tabBarIcon: (props) => <TabBarIcon icon={User} {...props} />,
        }}
      />
    </Tabs>
  );
}
