import { z } from 'zod';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from './address';

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'validation.fullName.required'),
  email: z.string().trim().min(1, 'validation.email.required').email('validation.email.invalid'),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const addressSchema = z
  .object({
    label: z.string().trim().min(1, 'validation.address.labelRequired'),
    street: z.string().trim().min(4, 'validation.address.streetRequired'),
    city: citySchema,
    postalCode: postalCodeSchema,
  })
  .superRefine(refinePostalCodeCity);
export type AddressInput = z.input<typeof addressSchema>;
export type AddressValues = z.output<typeof addressSchema>;

export const paymentSchema = z.object({
  holder: z.string().trim().min(2, 'validation.payment.holderRequired'),
  // Digits only after spaces are stripped. The prototype keeps the last four and
  // discards the rest, so this validates shape, not a real card.
  cardNumber: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((value) => /^\d{15,16}$/.test(value), 'validation.payment.cardFormat'),
  expiry: z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'validation.payment.expiryFormat'),
});
export type PaymentValues = z.infer<typeof paymentSchema>;
