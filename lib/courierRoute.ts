import type { LatLng } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';

/**
 * Geometry over a route the courier is driving.
 *
 * The route itself comes from Mapbox Directions (`lib/directions.ts`) and the
 * position from the courier's GPS; this module only relates the two — how far
 * along the line a fix sits, which half to dim, how long is left. Pure, so it
 * can be checked without a map or a phone.
 */

export interface RouteLeg {
  /** Ordered points from origin to destination, origin and destination included. */
  points: LatLng[];
  distanceKm: number;
  durationMin: number;
}

export interface RouteFix {
  /** Share of the route's length behind the courier, 0 to 1. */
  progress: number;
  /** How far the fix is from the line — past a threshold the route is stale. */
  offRouteKm: number;
  /** Compass degrees of the segment the courier is on, for when GPS has no heading. */
  bearing: number;
}

/**
 * Where a GPS fix falls on the route.
 *
 * Projects onto each segment and keeps the nearest, measuring along the line up
 * to that point. Flat-earth maths over a segment: at delivery scale the error is
 * centimetres, far below GPS noise.
 */
export function locateOnRoute(points: LatLng[], at: LatLng): RouteFix {
  if (points.length < 2) return { progress: 0, offRouteKm: points[0] ? distanceKm(points[0], at) : 0, bearing: 0 };

  const kx = Math.cos((at.lat * Math.PI) / 180);
  let best = { distKm: Infinity, alongKm: 0, bearing: 0 };
  let walked = 0;
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const step = distanceKm(a, b);
    const dx = (b.lng - a.lng) * kx;
    const dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (((at.lng - a.lng) * kx) * dx + (at.lat - a.lat) * dy) / len2)) : 0;
    const foot = { lat: a.lat + dy * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = distanceKm(foot, at);
    if (d < best.distKm) best = { distKm: d, alongKm: walked + step * t, bearing: bearingBetween(a, b) };
    walked += step;
    total += step;
  }

  return {
    progress: total > 0 ? Math.min(1, best.alongKm / total) : 1,
    offRouteKm: best.distKm,
    bearing: best.bearing,
  };
}

export interface SplitPath {
  /** Origin to the courier's current position. */
  travelled: LatLng[];
  /** The courier's current position to the destination. */
  remaining: LatLng[];
}

/**
 * The route cut at the courier's position.
 *
 * A single line drawn end to end says where the trip goes; it does not say how
 * much of it is left, which is the question a moving marker raises and never
 * answers. Splitting it lets the map dim the road already driven and keep the
 * road ahead at full weight, so progress is legible from the shape of the line
 * alone — without reading a number, which is the point on a screen glanced at
 * from behind a handlebar.
 *
 * Both halves include the cut point, so the two polylines meet exactly under the
 * courier marker with no gap at any zoom.
 */
export function splitPath(points: LatLng[], progress: number): SplitPath {
  if (points.length < 2) return { travelled: [], remaining: points };

  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped <= 0) return { travelled: [], remaining: points };
  if (clamped >= 1) return { travelled: points, remaining: [] };

  let total = 0;
  const steps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const step = distanceKm(points[i - 1], points[i]);
    steps.push(step);
    total += step;
  }
  if (total <= 0) return { travelled: [], remaining: points };

  const target = clamped * total;
  let walked = 0;

  for (let i = 1; i < points.length; i++) {
    const step = steps[i - 1];
    if (walked + step >= target) {
      const within = step > 0 ? (target - walked) / step : 1;
      const cut: LatLng = {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * within,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * within,
      };
      return {
        travelled: [...points.slice(0, i), cut],
        remaining: [cut, ...points.slice(i)],
      };
    }
    walked += step;
  }

  return { travelled: points, remaining: [] };
}

/** Minutes still to run. Rounded up — "0 min" while still moving reads as broken. */
export function etaMinutes(leg: RouteLeg, progress: number): number {
  return Math.max(0, Math.ceil(leg.durationMin * (1 - Math.min(1, Math.max(0, progress)))));
}

function bearingBetween(from: LatLng, to: LatLng): number {
  const y = to.lng - from.lng;
  const x = to.lat - from.lat;
  if (x === 0 && y === 0) return 0;
  return (Math.atan2(y, x) * 180) / Math.PI;
}
