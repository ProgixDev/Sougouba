import { z } from 'zod';

import { citySchema, postalCodeSchema, refinePostalCodeCity } from './address';

/**
 * A shop's registration file, in three steps.
 *
 * Split like the courier's (`lib/validation/courier.ts`) so each step validates
 * as it is left rather than dropping every error at once on the last screen.
 *
 * Numeric fields are strings and coerced here — RN text inputs have no number
 * type, and holding them as numbers means fighting `NaN` on every keystroke
 * while the field is mid-edit. Same call `lib/validation/product.ts` makes.
 *
 * There is deliberately no delivery-fee field: the shop does not price the run.
 * See `data/deliveryPricing.ts`.
 */

export const shopIdentitySchema = z.object({
  name: z.string().trim().min(2, 'Nom de la boutique requis'),
  vendorType: z.enum(['grocery', 'restaurant'], { message: 'Choisissez une catégorie' }),
  specialtyFr: z
    .string()
    .trim()
    .min(3, 'Spécialité requise')
    .max(40, 'Trop long — une ligne sous le nom de la boutique'),
  isHalalCertified: z.boolean(),
});
export type ShopIdentityValues = z.infer<typeof shopIdentitySchema>;

export const shopAddressSchema = z
  .object({
    street: z.string().trim().min(4, 'Adresse requise'),
    city: citySchema,
    postalCode: postalCodeSchema,
    deliveryEtaMin: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, 'Délai en minutes')
      .refine((v) => Number(v) >= 10 && Number(v) <= 180, 'Entre 10 et 180 minutes'),
  })
  .superRefine(refinePostalCodeCity);
export type ShopAddressInput = z.input<typeof shopAddressSchema>;
export type ShopAddressValues = z.infer<typeof shopAddressSchema>;

export const shopDocumentsSchema = z
  .object({
    // The registraire prints it as 10 digits; people paste it with spaces.
    neq: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s/g, ''))
      .refine((v) => /^\d{10}$/.test(v), 'NEQ à 10 chiffres'),
    contactName: z.string().trim().min(2, 'Nom du responsable requis'),
    contactPhone: z
      .string()
      .trim()
      .min(10, 'Téléphone requis')
      .regex(/^[\d\s()+.-]+$/, 'Numéro de téléphone invalide'),
    mapaqNumber: z.string().trim().optional(),
    /** Carried from step one so the MAPAQ rule can see it. */
    vendorType: z.enum(['grocery', 'restaurant']),
  })
  .superRefine((values, ctx) => {
    // A restaurant without a MAPAQ permit is a file an administrator would send
    // straight back, so the form asks here rather than letting it sit in the
    // queue for a day first.
    if (values.vendorType !== 'restaurant') return;
    if (!values.mapaqNumber || values.mapaqNumber.length < 4) {
      ctx.addIssue({
        code: 'custom',
        path: ['mapaqNumber'],
        message: 'Permis MAPAQ requis pour un restaurant',
      });
    }
  });
export type ShopDocumentsInput = z.input<typeof shopDocumentsSchema>;
export type ShopDocumentsValues = z.infer<typeof shopDocumentsSchema>;

export const VENDOR_TYPE_LABELS: Record<ShopIdentityValues['vendorType'], string> = {
  grocery: 'Épicerie',
  restaurant: 'Restaurant',
};
