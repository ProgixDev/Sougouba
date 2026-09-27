import { z } from 'zod';

import { cityForPostalCode, cityNames, isPostalCodeInCity, normalizePostalCode, POSTAL_CODE_PATTERN } from './cities.js';

/**
 * Direct port of `lib/validation/address.ts` in the mobile repo — same
 * rules, same messages (the API's errors are what the app will eventually
 * show verbatim once it's wired to real endpoints, so drifting the copy here
 * would drift what a shopper sees).
 */
export const citySchema = z
  .string()
  .trim()
  .min(1, 'Ville requise')
  .refine((city) => cityNames.includes(city), 'Sougouba ne dessert pas encore cette ville');

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(POSTAL_CODE_PATTERN, 'Code postal invalide (ex. H2S 3K9)')
  .transform(normalizePostalCode);

/** Attach to any object schema holding both `city` and `postalCode`, via `.superRefine`. */
export function refinePostalCodeCity<T extends { city: string; postalCode: string }>(
  values: T,
  ctx: z.RefinementCtx
): void {
  if (!cityNames.includes(values.city)) return;
  if (isPostalCodeInCity(values.postalCode, values.city)) return;
  const actual = cityForPostalCode(values.postalCode);
  ctx.addIssue({
    code: 'custom',
    path: ['postalCode'],
    message: actual ? `Ce code postal est à ${actual}, pas à ${values.city}` : 'Ce code postal n’est pas dans une ville desservie',
  });
}
