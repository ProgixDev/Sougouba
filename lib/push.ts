import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import * as pushApi from '@/data/api/push';
import { useLanguageStore } from '@/store/useLanguageStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';

/**
 * Remote push notifications — the device half.
 *
 * The server decides what to send and when (`api/src/notifications/`); this
 * module only gets a token, tells the API where this device is and what it
 * wants, and gets out of the way. Every function here swallows its own
 * failures: a phone that refuses notifications, a simulator without APNs, or
 * Expo's token service being slow is a phone without pushes, never a crash or
 * a blocked sign-in.
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

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await pushApi.register({
      token,
      platform: Platform.OS,
      locale: useLanguageStore.getState().locale,
      preferences: usePreferencesStore.getState().notifications,
    });
    registeredToken = token;
  } catch (error) {
    if (__DEV__) console.warn('[push] registration skipped:', error);
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
    // The server prunes a token Expo reports dead; a stale row costs one
    // wasted send at worst, and sign-out must not wait on it.
  }
}

/** The in-app path a notification asks to open, if it carries one. */
export function urlOf(response: Notifications.NotificationResponse | null | undefined): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
