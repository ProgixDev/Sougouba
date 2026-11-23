import { z } from 'zod';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from '../../geo/address-validation.js';

/**
 * How to reach the door — kept on the address, copied onto each order. An
 * empty string clears a field (null in the table); the bounds are the
 * columns' check constraints (`drizzle/0050_delivery_instructions.sql`).
 */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const deliveryDetailsSchema = z.object({
  unit: optionalText(60, 'Appartement ou étage : 60 caractères au plus'),
  doorCode: optionalText(30, 'Code de porte : 30 caractères au plus'),
  deliveryNotes: optionalText(300, 'Instructions : 300 caractères au plus'),
  dropoff: z.enum(['hand', 'door'], { message: 'Choix de remise invalide' }).optional(),
});

export type DeliveryDetailsInput = z.infer<typeof deliveryDetailsSchema>;

/** Direct port of `addressSchema` in the mobile repo's `lib/validation/profile.ts`. */
export const createAddressSchema = z
  .object({
    label: z.string().trim().min(1, 'Nom requis (ex. Domicile)'),
    street: z.string().trim().min(4, 'Adresse requise'),
    city: citySchema,
    postalCode: postalCodeSchema,
  })
  .extend(deliveryDetailsSchema.shape)
  .superRefine(refinePostalCodeCity);

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

/**
 * Every field optional (a patch), plus `isDefault` — which doesn't belong on
 * `createAddressSchema` at all: whether a *new* address becomes the default
 * is a server decision (first address ever ⇒ default, matching the mock),
 * never something the client asks for at creation time.
 */
export const updateAddressSchema = z
  .object({
    label: z.string().trim().min(1, 'Nom requis (ex. Domicile)').optional(),
    street: z.string().trim().min(4, 'Adresse requise').optional(),
    city: citySchema.optional(),
    postalCode: postalCodeSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .extend(deliveryDetailsSchema.shape)
  .superRefine((values, ctx) => {
    if (values.city !== undefined && values.postalCode !== undefined) {
      refinePostalCodeCity({ city: values.city, postalCode: values.postalCode }, ctx);
    }
  });

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
