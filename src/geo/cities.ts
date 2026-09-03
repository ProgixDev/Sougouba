/**
 * Where Sougouba delivers, and which postal codes belong to each.
 *
 * Direct port of `data/cities.ts` in the mobile repo — same FSA lists, same
 * functions, same behaviour. Ported rather than re-derived so the two can
 * never quietly disagree about which city a postal code belongs to; if this
 * list changes, change it there too (or, once an admin settings surface
 * exists, promote it to a real table — not needed for Phase 1).
 *
 * FSA — *forward sortation area* — is the first three characters of a
 * Canadian postal code, and the finest unit checkable without a real
 * geocoder: "H2S" is a real neighbourhood, "H2S 3K9" is a side of one street.
 */

export interface ServedCity {
  /** Canonical spelling. This is what gets written onto an address. */
  name: string;
  /** Forward sortation areas that belong to this city. */
  fsas: string[];
}

/** `fsaRange('H1', 'A', 'Z')` → H1A, H1B, … H1Z. */
function fsaRange(prefix: string, from: string, to: string): string[] {
  const out: string[] = [];
  for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code++) {
    out.push(prefix + String.fromCharCode(code));
  }
  return out;
}

/** Montréal-Nord, a borough of Montréal — listed separately, as Canada Post does. */
const MONTREAL_NORD_FSAS = ['H1G', 'H1H'];

/**
 * The island of Montréal. Includes the Montréal-Nord codes on purpose: the
 * borough *is* Montréal, and rejecting someone who wrote the city they live
 * in would be a validator being wrong on principle.
 */
const MONTREAL_FSAS = [
  ...fsaRange('H1', 'A', 'Z'),
  ...fsaRange('H2', 'A', 'Z'),
  ...fsaRange('H3', 'A', 'Z'),
  ...fsaRange('H4', 'A', 'Z'),
  ...fsaRange('H8', 'N', 'Z'),
  ...fsaRange('H9', 'A', 'X'),
];

export const servedCities: ServedCity[] = [
  { name: 'Montréal', fsas: MONTREAL_FSAS },
  { name: 'Montréal-Nord', fsas: MONTREAL_NORD_FSAS },
  { name: 'Laval', fsas: fsaRange('H7', 'A', 'Y') },
  { name: 'Longueuil', fsas: [...fsaRange('J3', 'Y', 'Z'), ...fsaRange('J4', 'G', 'Z')] },
];

export const cityNames: string[] = servedCities.map((c) => c.name);

/**
 * "h2s3k9", "H2S-3K9" and "h2s 3k9" are the same address written by three
 * people. Stored one way — upper case, one space — so a lookup, a comparison
 * and a receipt all see the same string.
 */
export function normalizePostalCode(raw: string): string {
  const bare = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return bare.length > 3 ? `${bare.slice(0, 3)} ${bare.slice(3)}` : bare;
}

/** The first three characters, however the code was typed. */
export function fsaOf(postalCode: string): string {
  return postalCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

export const POSTAL_CODE_PATTERN = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export function isServedCity(city: string): boolean {
  return servedCities.some((c) => c.name === city.trim());
}

/** Which served city a postal code falls in, if any. Montréal wins over its borough. */
export function cityForPostalCode(postalCode: string): string | undefined {
  const fsa = fsaOf(postalCode);
  return servedCities.find((c) => c.fsas.includes(fsa))?.name;
}

export function isPostalCodeInCity(postalCode: string, city: string): boolean {
  const served = servedCities.find((c) => c.name === city.trim());
  return served ? served.fsas.includes(fsaOf(postalCode)) : false;
}
