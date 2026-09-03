import { z } from 'zod';

/** `admin` is deliberately not a valid value here — see `UserRole` in the mobile app's `data/types.ts`. */
export const setRoleSchema = z.object({
  role: z.enum(['customer', 'business', 'courier']),
});

export type SetRoleInput = z.infer<typeof setRoleSchema>;
