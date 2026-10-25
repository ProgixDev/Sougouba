import { z } from 'zod';

/** What `getExpoPushTokenAsync` returns — `ExponentPushToken[…]`. Mirrors the column's check constraint. */
const expoToken = z
  .string()
  .trim()
  .max(255)
  .regex(/^Expo(nent)?PushToken\[.+\]$/, 'Jeton de notification invalide');

export const registerPushTokenSchema = z.object({
  token: expoToken,
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

export const unregisterPushTokenSchema = z.object({ token: expoToken });

export type UnregisterPushTokenInput = z.infer<
  typeof unregisterPushTokenSchema
>;
