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
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSyncColorScheme } from '@/hooks/useColorScheme';
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
      <SafeAreaProvider>
        {/* Moving between the top-level groups is a change of context, not a step
            forward in a flow, so those transitions cross-fade rather than slide.
            Everything inside a group keeps the platform push. */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(customer)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(business)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(courier)" options={{ animation: 'fade' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
