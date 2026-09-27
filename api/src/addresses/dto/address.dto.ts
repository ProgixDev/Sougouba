import { z } from 'zod';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from '../../geo/address-validation.js';

/** Direct port of `addressSchema` in the mobile repo's `lib/validation/profile.ts`. */
export const createAddressSchema = z
  .object({
    label: z.string().trim().min(1, 'Nom requis (ex. Domicile)'),
    street: z.string().trim().min(4, 'Adresse requise'),
    city: citySchema,
    postalCode: postalCodeSchema,
  })
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
  .superRefine((values, ctx) => {
    if (values.city !== undefined && values.postalCode !== undefined) {
      refinePostalCodeCity({ city: values.city, postalCode: values.postalCode }, ctx);
    }
  });

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
