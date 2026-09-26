import type { LatLng } from '@/data/types';

// Both the coordinate type and the haversine now live under `data/`, where the
// seed builder and the dispatcher can reach them without importing from `lib/`.
// Re-exported here so `@/lib/geo` stays the one import site for geometry, and
// because this is where the `Intl`-bound formatting belongs.
export { distanceKm } from '@/data/utils/geo';
export type { LatLng };

import { currentLocale } from '@/lib/i18n';
import { localeFormatter } from '@/lib/i18n/icu';

const kmFormatter = localeFormatter<number>(
  (tag) => new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }),
  12.4
);

/**
 * Distance as a shopper reads it: metres under a kilometre, one decimal above,
 * and no decimal at all past ten — "12,4 km" claims a precision that a
 * straight-line measure over that range does not have.
 *
 * Only the decimal mark is localised — "12,4 km" in French, "12.4 km" in
 * English. `m` and `km` are the same symbols in both, so there is nothing here
 * for the catalogue.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km >= 10) return `${Math.round(km)} km`;

  const formatter = kmFormatter();
  const value = formatter
    ? formatter.format(km)
    : currentLocale() === 'en'
      ? km.toFixed(1)
      : km.toFixed(1).replace('.', ',');
  return `${value} km`;
}
