import { Tabs } from 'expo-router';
import { History, Navigation, User, Wallet } from 'lucide-react-native';

import { TabBarBackground, TabBarIcon } from '@/components/ui';
import { useColorScheme } from '@/hooks/useColorScheme';
import { darkColors, lightColors } from '@/theme/colors';

export const unstable_settings = { anchor: 'missions' };

/**
 * Four tabs rather than the five the other two roles carry: the courier's home
 * is a full-bleed map, and a bar that reaches for a fifth label starts eating
 * into the only screen that matters while someone is driving.
 */
export default function CourierTabsLayout() {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Tab switching defaults to `none` in expo-router 57.
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
        name="missions"
        options={{ title: 'Missions', tabBarIcon: (props) => <TabBarIcon icon={Navigation} {...props} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Courses', tabBarIcon: (props) => <TabBarIcon icon={History} {...props} /> }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Gains', tabBarIcon: (props) => <TabBarIcon icon={Wallet} {...props} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: (props) => <TabBarIcon icon={User} {...props} /> }}
      />
    </Tabs>
  );
}
