import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Adresse courriel requise').email('Adresse courriel invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis'),
  email: z.string().trim().min(1, 'Adresse courriel requise').email('Adresse courriel invalide'),
  password: z.string().min(6, 'Minimum 6 caractères'),
  /** Optional — an unknown or mistyped code is ignored rather than blocking sign-up. */
  referralCode: z.string().trim().optional(),
});
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Adresse courriel requise').email('Adresse courriel invalide'),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
