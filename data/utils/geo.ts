import type { LatLng } from '../types';

/** Mean Earth radius, in kilometres. */
const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance between two points, in kilometres.
 *
 * The maths lives here rather than in `lib/geo.ts` because the seed builder and
 * the dispatcher both need it and `data/` must not import from `lib/`. The
 * *formatting* stays in `lib/geo.ts`, which is where `Intl` belongs — `data/` is
 * deliberately Intl-free (see the note in `data/utils/time.ts`).
 *
 * As the crow flies, not as the courier drives — on the island of Montréal the
 * two differ by roughly a third.
 */
export function distanceKm(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
