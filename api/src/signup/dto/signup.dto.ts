import { z } from 'zod';

/** Lower-cased once here, so the codes table (keyed by address) never sees two spellings of one inbox. */
const email = z.string().trim().toLowerCase().email('Adresse courriel invalide');

export const startEmailSchema = z.object({ email });
export type StartEmailInput = z.infer<typeof startEmailSchema>;

export const verifyEmailSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, 'Le code contient 6 chiffres'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
