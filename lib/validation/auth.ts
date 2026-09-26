import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'validation.email.required').email('validation.email.invalid'),
  password: z.string().min(1, 'validation.password.required'),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'validation.fullName.required'),
  email: z.string().trim().min(1, 'validation.email.required').email('validation.email.invalid'),
  password: z.string().min(6, 'validation.password.tooShort'),
  /** Optional — an unknown or mistyped code is ignored rather than blocking sign-up. */
  referralCode: z.string().trim().optional(),
});
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'validation.email.required').email('validation.email.invalid'),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
