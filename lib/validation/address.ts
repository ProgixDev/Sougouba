import { z } from 'zod';

import {
  cityNames,
  cityForPostalCode,
  isPostalCodeInCity,
  normalizePostalCode,
  POSTAL_CODE_PATTERN,
} from '@/data/cities';

/**
 * The city and postal code rules, written once.
 *
 * They used to be three near-copies — courier, merchant and customer address
 * book each had their own `min(2, 'Ville requise')` and their own postal-code
 * regex, and the three regexes had already drifted (one accepted a hyphen, two
 * did not). Three copies of a rule is three chances for one of them to be the
 * lenient one.
 *
 * The check itself lives in `data/cities.ts` so the mock API (`data/api/geo.ts`)
 * enforces the same thing on the way in — a resolver is synchronous, so the
 * schema reads the table directly rather than awaiting the round trip.
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
  // Stored one way, whatever was typed — `lib/postalGeo.ts` looks the address up
  // by its FSA, and " h2s3k9" and "H2S 3K9" must not be two different places.
  .transform(normalizePostalCode);

/**
 * Attach to any object holding both fields.
 *
 * The cross-check is the one the client actually asked for: a real code under
 * the wrong city used to pass, and the coordinate lookup quietly answered with
 * the centre of the region.
 */
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
    message: actual
      ? `Ce code postal est à ${actual}, pas à ${values.city}`
      : 'Ce code postal n’est pas dans une ville desservie',
  });
}
