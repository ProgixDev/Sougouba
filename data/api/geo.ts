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
/**
 * Address checks.
 *
 * ⚠️ **This module deliberately does not call the API, and that is not a gap.**
 *
 * The client asked for the city to be "validée en back", and it is: every write
 * that carries an address — `POST /me/addresses`, `vendor_apply`,
 * `courier_apply` — is re-validated server-side against the same rule before
 * anything is stored, and `POST /geo/coordinates` refuses an unserved city
 * outright. What is here is the *affordance*: telling someone their postal code
 * belongs to Laval while they are still typing, without a round trip per
 * keystroke.
 *
 * The served-city list is static reference data (`data/cities.ts`), the same
 * source the API's own schemas were ported from, so a fetch would buy a network
 * dependency and no additional truth. If the two ever diverge the server wins,
 * because it is the one that refuses the write.
 */

export async function getServedCities(): Promise<ServedCity[]> {
  return servedCities.map((c) => ({ name: c.name, fsas: [...c.fsas] }));
}

export async function getCityNames(): Promise<string[]> {
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
