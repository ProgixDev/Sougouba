import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import * as pushApi from '@/data/api/push';
import { exchangeApnsToken, fcmExchangeAvailable } from '@/modules/fcm-token';
import { useLanguageStore } from '@/store/useLanguageStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';

/**
 * Remote push notifications — the device half.
 *
 * The server decides what to send and when (`api/src/notifications/`); this
 * module only gets a token, tells the API where this device is and what it
 * wants, and gets out of the way. Every function here swallows its own
 * failures: a phone that refuses notifications, a simulator without APNs, or
 * Firebase being slow is a phone without pushes, never a crash or a blocked
 * sign-in.
 *
 * The token is a **Firebase Cloud Messaging** one on both platforms — the
 * server sends through Firebase. `expo-notifications` still does everything
 * else: the permission prompt, the Android channels, showing a notification,
 * and knowing it was tapped.
 */

/**
 * A push that arrives while the app is open still shows as a banner. The order
 * screens refresh themselves anyway, but a merchant on the catalogue tab should
 * still hear that an order came in.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** The token this device registered under, so sign-out can withdraw exactly it. */
let registeredToken: string | null = null;

/**
 * Android channels, under the ids the API sends (`PushChannel`). Must exist
 * before the permission prompt: on Android 13+ the prompt does not appear
 * until at least one channel does.
 */
async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Commandes',
    importance: Notifications.AndroidImportance.HIGH,
  });
  // A courier offer lapses in seconds — the loudest channel the app owns.
  await Notifications.setNotificationChannelAsync('offers', {
    name: 'Offres de livraison',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
  });
}

/** True once the OS lets this app notify. Asks only if it never has. */
async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Whether the OS currently blocks notifications for this app — for the settings screen's hint. */
export async function notificationsBlocked(): Promise<boolean> {
  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    return !granted && !canAskAgain;
  } catch {
    return false;
  }
}

/**
 * Register (or refresh) this device for the signed-in account.
 *
 * Safe to call as often as anything changes — sign-in, a flipped switch, a new
 * language: the API upserts the whole state on the token.
 */
export async function syncPushRegistration(): Promise<void> {
  try {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    await ensureChannels();
    if (!(await ensurePermission())) return;

    await registerWith(await pushToken());
  } catch (error) {
    if (__DEV__) console.warn('[push] registration skipped:', error);
  }
}

/**
 * The system replaced this device's token — re-register under the new one.
 *
 * Takes the token the system just handed over rather than asking for it again:
 * asking from inside the listener that reports a new token would loop.
 */
export function watchPushToken(): { remove: () => void } {
  return Notifications.addPushTokenListener((device) => {
    void (async () => {
      try {
        const token = await firebaseTokenFrom(device);
        // Only a device that was registered re-registers: this fires at launch
        // too, before anyone has signed in.
        if (token && registeredToken && token !== registeredToken) await registerWith(token);
      } catch (error) {
        if (__DEV__) console.warn('[push] re-registration skipped:', error);
      }
    })();
  });
}

async function registerWith(token: string): Promise<void> {
  await pushApi.register({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    locale: useLanguageStore.getState().locale,
    preferences: usePreferencesStore.getState().notifications,
  });
  registeredToken = token;
  if (!isExpoToken(token)) void retireExpoToken();
}

// ── the token ───────────────────────────────────────────────────────────────

const isExpoToken = (token: string) => /^Expo(nent)?PushToken\[/.test(token);

/**
 * The token to register: Firebase's, or — only in a build made before Firebase
 * was added — the one Expo's service issues.
 *
 * That fallback is why an app update can still reach an old build: the server
 * keeps sending to Expo tokens through Expo, and to Firebase tokens through
 * Firebase, until the old builds are gone.
 */
async function pushToken(): Promise<string> {
  // An iOS build without Firebase's library registers exactly as it always did.
  if (Platform.OS === 'ios' && !fcmExchangeAvailable) return expoToken();
  const fromFirebase = await firebaseTokenFrom(await Notifications.getDevicePushTokenAsync());
  return fromFirebase ?? expoToken();
}

/**
 * The Firebase token behind the system's own. On Android the system's token
 * already is one. On iOS it is Apple's, and Firebase's library trades it for
 * a Firebase token (`modules/fcm-token`). Null in an iOS build without that
 * library.
 */
async function firebaseTokenFrom(device: Notifications.DevicePushToken): Promise<string | null> {
  const value = typeof device.data === 'string' ? device.data : null;
  if (!value) return null;
  if (device.type === 'android') return value;
  if (device.type === 'ios' && fcmExchangeAvailable) return exchangeApnsToken(value);
  return null;
}

async function expoToken(): Promise<string> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

const EXPO_TOKEN_RETIRED = 'push.expoTokenRetired';

/**
 * Once, after this iPhone first registers a Firebase token: withdraw the Expo
 * token an earlier build registered for it. Both lead to the same phone, and
 * the server would send every notification twice — once down each road.
 * Android never had one.
 */
async function retireExpoToken(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    if (await AsyncStorage.getItem(EXPO_TOKEN_RETIRED)) return;
    await pushApi.unregister(await expoToken());
    await AsyncStorage.setItem(EXPO_TOKEN_RETIRED, '1');
  } catch {
    // Tried again at the next registration. Until it works the cost is a
    // doubled notification, not a missing one.
  }
}

/**
 * Withdraw this device from the account that is signing out. Awaited by
 * sign-out *before* the session ends — the API needs the session to know whose
 * token it is deleting.
 */
export async function withdrawPushRegistration(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await pushApi.unregister(token);
  } catch {
    // The server prunes a token Firebase reports dead; a stale row costs one
    // wasted send at worst, and sign-out must not wait on it.
  }
}

/** The in-app path a notification asks to open, if it carries one. */
export function urlOf(response: Notifications.NotificationResponse | null | undefined): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
