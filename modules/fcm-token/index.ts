import { requireOptionalNativeModule } from 'expo';

/**
 * Firebase's library, as far as this app uses it on iOS: one call that trades
 * the iPhone's Apple push token for a Firebase Cloud Messaging token
 * (`ios/FcmTokenModule.swift`).
 *
 * Optional on purpose. An app update can reach a build made before Firebase
 * was added, where this module does not exist; and Android never has it — the
 * token Android hands out is already a Firebase one. Both are "not available",
 * never a crash: the caller decides what to do without it (`lib/push.ts`).
 */
interface FcmTokenModule {
  exchange(apnsToken: string): Promise<string>;
}

const native = requireOptionalNativeModule<FcmTokenModule>('FcmToken');

/** True in a build that carries Firebase's library — an iOS build made after it was added. */
export const fcmExchangeAvailable = native !== null;

/**
 * The Firebase token for this iPhone, given its Apple token as hexadecimal
 * (what `Notifications.getDevicePushTokenAsync()` returns on iOS). Rejects when
 * the build has no Firebase, or Firebase could not be reached.
 */
export function exchangeApnsToken(apnsToken: string): Promise<string> {
  if (!native) return Promise.reject(new Error('Firebase is not part of this build'));
  return native.exchange(apnsToken);
}
