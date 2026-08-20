import type { LatLng } from '@/data/types';

// Both the coordinate type and the haversine now live under `data/`, where the
// seed builder and the dispatcher can reach them without importing from `lib/`.
// Re-exported here so `@/lib/geo` stays the one import site for geometry, and
// because this is where the `Intl`-bound formatting belongs.
export { distanceKm } from '@/data/utils/geo';
export type { LatLng };

const kmFormatter = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 1 });

/**
 * Distance as a shopper reads it: metres under a kilometre, one decimal above,
 * and no decimal at all past ten — "12,4 km" claims a precision that a
 * straight-line measure over that range does not have.
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km >= 10) return `${Math.round(km)} km`;
  return `${kmFormatter.format(km)} km`;
}
