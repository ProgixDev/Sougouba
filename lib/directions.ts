import { legDurationMin } from '@/data/delivery';
import type { LatLng, VehicleType } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';
import type { RouteLeg } from '@/lib/courierRoute';
import { MAPBOX_TOKEN, mapboxReady } from '@/lib/mapbox';

/**
 * Road routes from the Mapbox Directions API.
 *
 * This replaced a zig-zag generated from the order id: the line on the map is
 * now the streets a courier would actually take, and the ETA is Mapbox's,
 * traffic included for motor vehicles.
 *
 * When Directions cannot answer (offline, no token) the leg is the straight
 * line between the two points, timed with `legDurationMin`. A straight line
 * is plainly an approximation; an invented street path looked like a real one.
 */

const PROFILES: Record<VehicleType, string> = {
  bike: 'mapbox/cycling',
  scooter: 'mapbox/driving-traffic',
  car: 'mapbox/driving-traffic',
};

const TIMEOUT_MS = 8_000;
/** Enough for both legs of a run on a few screens; the oldest entry goes first. */
const CACHE_SIZE = 24;
const cache = new Map<string, Promise<RouteLeg>>();

/** ~11 m: two requests from the same street corner share an answer. */
function key(from: LatLng, to: LatLng, vehicle: VehicleType): string {
  const r = (n: number) => n.toFixed(4);
  return `${vehicle}:${r(from.lat)},${r(from.lng)}>${r(to.lat)},${r(to.lng)}`;
}

export function straightLeg(from: LatLng, to: LatLng, vehicle: VehicleType): RouteLeg {
  const km = distanceKm(from, to);
  return { points: [from, to], distanceKm: km, durationMin: legDurationMin(km, vehicle) };
}

async function fetchLeg(from: LatLng, to: LatLng, vehicle: VehicleType): Promise<RouteLeg> {
  if (!mapboxReady) return straightLeg(from, to, vehicle);
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url =
    `https://api.mapbox.com/directions/v5/${PROFILES[vehicle]}/${coords}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Directions ${response.status}`);
    const body = (await response.json()) as {
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };
    const route = body.routes?.[0];
    if (!route || route.geometry.coordinates.length < 2) throw new Error('No route');
    return {
      points: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceKm: route.distance / 1000,
      durationMin: Math.max(1, Math.round(route.duration / 60)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** The road route from `from` to `to`, or the straight line when Directions is unreachable. */
export function routeBetween(from: LatLng, to: LatLng, vehicle: VehicleType): Promise<RouteLeg> {
  const k = key(from, to, vehicle);
  const hit = cache.get(k);
  if (hit) return hit;

  const pending = fetchLeg(from, to, vehicle).catch(() => {
    // Not cached as a failure: the next request may be back on the network.
    cache.delete(k);
    return straightLeg(from, to, vehicle);
  });
  cache.set(k, pending);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return pending;
}
