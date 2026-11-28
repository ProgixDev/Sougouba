import { z } from 'zod';

/**
 * A device's token: a Firebase Cloud Messaging registration token, or — from a
 * build made before Firebase was added — the `ExponentPushToken[…]` Expo
 * issues. Firebase documents no format and no length for its tokens, only that
 * they are opaque, so the rule is loose on purpose: a single run of characters
 * of a plausible size. Mirrors the column's check constraint (migration 0060).
 */
const pushToken = z
  .string()
  .trim()
  .min(20, 'Jeton de notification invalide')
  .max(4096, 'Jeton de notification invalide')
  .regex(/^\S+$/, 'Jeton de notification invalide');

export const registerPushTokenSchema = z.object({
  token: pushToken,
  platform: z.enum(['ios', 'android']),
  locale: z.enum(['fr', 'en']).default('fr'),
  /**
   * The device's switches, from the notification settings screen. Optional so
   * a bare re-registration (a refreshed token) does not reset them.
   */
  preferences: z
    .object({
      orderUpdates: z.boolean(),
      deliveryAlerts: z.boolean(),
      promotions: z.boolean(),
      newVendors: z.boolean(),
    })
    .optional(),
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z.object({ token: pushToken });

export type UnregisterPushTokenInput = z.infer<
  typeof unregisterPushTokenSchema
>;
