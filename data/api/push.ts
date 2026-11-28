import { api } from '../http';

/**
 * This device's push registration — its Firebase Cloud Messaging token (or,
 * from a build that predates Firebase, the one Expo issued), plus what the
 * server needs to write the notification without the app running: the
 * language to write it in, and which of the shopper's switches are on.
 */
export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android';
  locale: 'fr' | 'en';
  preferences: {
    orderUpdates: boolean;
    deliveryAlerts: boolean;
    promotions: boolean;
    newVendors: boolean;
  };
}

/** Idempotent: the whole state each time, so a retry or a duplicate is harmless. */
export async function register(registration: PushRegistration): Promise<void> {
  await api('/me/push-token', { method: 'PUT', body: registration });
}

/** Sign-out. Must run while the session is still valid — the API scopes it to the caller. */
export async function unregister(token: string): Promise<void> {
  await api('/me/push-token', { method: 'DELETE', body: { token } });
}
