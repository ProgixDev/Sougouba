import { z } from 'zod';

export const emailSchema = z.object({
  email: z.string().trim().min(1, 'validation.email.required').email('validation.email.invalid'),
});
export type EmailValues = z.infer<typeof emailSchema>;

export const nameSchema = z.object({
  fullName: z.string().trim().min(2, 'validation.fullName.required'),
  /** Optional — an unknown or mistyped code is ignored rather than blocking sign-up. */
  referralCode: z.string().trim().optional(),
});
export type NameValues = z.infer<typeof nameSchema>;
