import { z } from 'zod';

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis'),
  email: z.string().trim().min(1, 'Adresse courriel requise').email('Adresse courriel invalide'),
});
export type ProfileValues = z.infer<typeof profileSchema>;

/** Canada Post format, with or without the conventional space: H1X 1G8 / H1X1G8. */
const postalCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Code postal invalide (ex. H1X 1G8)');

export const addressSchema = z.object({
  label: z.string().trim().min(1, 'Nom requis (ex. Domicile)'),
  street: z.string().trim().min(4, 'Adresse requise'),
  city: z.string().trim().min(2, 'Ville requise'),
  postalCode,
});
export type AddressValues = z.infer<typeof addressSchema>;

export const paymentSchema = z.object({
  holder: z.string().trim().min(2, 'Nom du titulaire requis'),
  // Digits only after spaces are stripped. The prototype keeps the last four and
  // discards the rest, so this validates shape, not a real card.
  cardNumber: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((value) => /^\d{15,16}$/.test(value), 'Numéro à 15 ou 16 chiffres'),
  expiry: z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Format MM/AA'),
});
export type PaymentValues = z.infer<typeof paymentSchema>;
