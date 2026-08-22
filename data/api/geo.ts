import {
  cityForPostalCode,
  cityNames,
  isPostalCodeInCity,
  isServedCity,
  normalizePostalCode,
  POSTAL_CODE_PATTERN,
  type ServedCity,
  servedCities,
} from '../cities';
import { delay } from '../utils/delay';

/**
 * Address checks, on the same side of the line as every other rule the app does
 * not let the screen decide.
 *
 * The client asked for the city to be "validée en back". There is no server in
 * this prototype — `data/api/` is what stands in for one, and it is where the
 * rules that must not be re-implemented per screen already live (taxes, order
 * totals, the delivery grid). This is the address rule, in the same place.
 *
 * The form schemas call the pure helpers in `data/cities.ts` directly, because a
 * zod resolver is synchronous; this module is what a screen calls when it wants
 * the round trip — the city selector reads its options here rather than hard
 * coding four names.
 */

export async function getServedCities(): Promise<ServedCity[]> {
  await delay(80, 180);
  return servedCities.map((c) => ({ name: c.name, fsas: [...c.fsas] }));
}

export async function getCityNames(): Promise<string[]> {
  await delay(80, 180);
  return [...cityNames];
}

export interface AddressCheck {
  ok: boolean;
  /** Normalised on the way through, so the caller can write back what it got. */
  postalCode: string;
  /** Which served city the postal code actually belongs to, when it belongs to one. */
  cityForPostalCode?: string;
  /** In French, ready to show under the offending field. */
  error?: string;
}

/**
 * Is this a place Sougouba can deliver to, and do the two halves agree?
 *
 * Three distinct failures, three distinct sentences: an unserved city, a
 * malformed code, and a code that is real but belongs to a different city. The
 * third is the one that used to pass silently, and the only one where the app
 * can say what the right answer probably is.
 */
export async function validateAddress(input: {
  city: string;
  postalCode: string;
}): Promise<AddressCheck> {
  await delay(120, 260);
  const postalCode = normalizePostalCode(input.postalCode);
  const city = input.city.trim();

  if (!isServedCity(city)) {
    return { ok: false, postalCode, error: `Sougouba ne dessert pas encore ${city || 'cette ville'}.` };
  }
  if (!POSTAL_CODE_PATTERN.test(postalCode)) {
    return { ok: false, postalCode, error: 'Code postal invalide (ex. H2S 3K9).' };
  }
  if (!isPostalCodeInCity(postalCode, city)) {
    const actual = cityForPostalCode(postalCode);
    return {
      ok: false,
      postalCode,
      ...(actual ? { cityForPostalCode: actual } : {}),
      error: actual
        ? `Ce code postal est à ${actual}, pas à ${city}.`
        : `Ce code postal n’est pas dans une ville desservie.`,
    };
  }
  return { ok: true, postalCode, cityForPostalCode: city };
}
