// Must precede every other import — see the module's own note on why.
import '@/lib/devLogs';
// Binds `i18n.locale` to the language store before anything renders. A
// side-effect import rather than a hook because a hook is one frame too late —
// see the module's own note.
import '@/lib/i18n/sync';

import '../global.css';

import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import { StripeProvider } from '@stripe/stripe-react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme, useSyncColorScheme, useThemeColors } from '@/hooks/useColorScheme';
import { queryClient, watchAppFocus } from '@/lib/queryClient';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useStoreHydration } from '@/hooks/useStoreHydration';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });
  const storeHydrated = useStoreHydration();
  useSyncColorScheme();

  // Without a navigation theme, every Stack and Tabs scene paints React
  // Navigation's default white behind itself — visible on every push, on every
  // tab switch, and for as long as a screen is still loading, and glaring in dark
  // mode. One theme from the app's own palette covers all eight navigators.
  const { colorScheme } = useColorScheme();
  const colors = useThemeColors();
  const navigationTheme = useMemo<Theme>(() => {
    const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.card,
        text: colors.foreground,
        border: colors.border,
        primary: colors.primary,
      },
    };
  }, [colorScheme, colors]);

  // And the native root view under React Native, which shows during launch and
  // behind modal presentations.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  // React Query's own focus detection is a browser API that never fires here,
  // so `refetchOnWindowFocus` only works once AppState is wired to it.
  useEffect(watchAppFocus, []);

  // Registers this device for push once signed in, and opens whatever a
  // tapped notification is about.
  usePushNotifications();

  // Render on a font failure too, with system fallbacks — an unstyled app beats
  // an app permanently stuck behind the native splash.
  const ready = (fontsLoaded || !!fontError) && storeHydrated;

  useEffect(() => {
    if (fontError) {
      console.warn('[sougouba] Font loading failed, falling back to system fonts:', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme}>
        {/* Stripe's payment sheet collects the card; Sougouba never sees it.
            `urlScheme` brings the shopper back after a bank's 3-D Secure page. */}
        <StripeProvider
          publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
          urlScheme="sougouba"
        >
        {/* Moving between the top-level groups is a change of context, not a step
            forward in a flow, so those transitions cross-fade rather than slide.
            Everything inside a group keeps the platform push. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(customer)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(business)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(courier)" options={{ animation: 'fade' }} />
        </Stack>
        </StripeProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
