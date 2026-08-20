import { legDurationMin } from '@/data/delivery';
import type { LatLng, VehicleType } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';
import { hashString, mulberry32 } from '@/data/utils/random';

/**
 * Where a courier is, without ever storing where a courier is.
 *
 * The whole module is pure: a route is regenerated from an order id, and a
 * position is a function of (route, elapsed time). Nothing here holds state,
 * which is the point — see `progressAt`.
 */

export interface RouteLeg {
  /** Ordered points from origin to destination, origin and destination included. */
  points: LatLng[];
  distanceKm: number;
  durationMin: number;
}

/** How many corners a generated route turns. Montréal blocks, roughly. */
const SEGMENTS = 6;
/**
 * Sideways wander, as a fraction of the straight-line distance.
 *
 * Tuned, not picked. Right-angle routing over a grid already costs
 * (|dx|+|dy|)/hypot(dx,dy) before any wander is added — 1.0x due north, 1.41x
 * on a diagonal — which is a real property of grid cities, not an artefact, and
 * `lib/geo.ts` puts the Montréal driving detour at roughly a third. The drift is
 * only there to stop every route looking like the same staircase. At 0.22 it was
 * pushing runs past 1.9x, inflating every ETA and every fare derived from one;
 * at 0.10 it moves the ratio by a few points either side of what the bearing
 * already implies.
 */
const DRIFT = 0.1;

/**
 * A plausible driving route between two points, generated offline.
 *
 * Not a call to the Directions API, and deliberately so: this app is a mock with
 * no backend, every other figure in it is derived rather than fetched, and a
 * demo that needs a network round trip per delivery is a demo that breaks in the
 * room it is being shown in. What matters visually is that the line looks like
 * streets rather than a laser — so the path zig-zags in near-right angles with a
 * little jitter, which on Montréal's grid reads as a route.
 *
 * Seeded by `seed` (the order id at every call site), so the same delivery draws
 * the same line on every launch, on both the courier's screen and the shopper's.
 * If real geometry is ever wanted, this signature is what a Directions call
 * would fill in behind — nothing above it knows the difference.
 */
export function buildLeg(from: LatLng, to: LatLng, seed: string, vehicle: VehicleType): RouteLeg {
  const rng = mulberry32(hashString(`route:${seed}`));
  const straight = distanceKm(from, to);

  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  // Unit normal to the straight line, in degrees. Longitude is compressed by
  // latitude, but over a delivery-sized span the error is smaller than the
  // jitter this offsets by, so it is not worth the cosine.
  const length = Math.hypot(dLat, dLng) || 1;
  const nLat = -dLng / length;
  const nLng = dLat / length;

  const points: LatLng[] = [{ ...from }];
  for (let i = 1; i < SEGMENTS; i++) {
    const t = i / SEGMENTS;
    // Offsets taper to zero at both ends: a route that starts beside the shop
    // instead of at it looks like a bug, not like a road.
    const taper = Math.sin(t * Math.PI);
    const offset = (rng() - 0.5) * 2 * DRIFT * taper;

    const midLat = from.lat + dLat * t + nLat * offset * length;
    const midLng = from.lng + dLng * t + nLng * offset * length;

    // Two points per waypoint, sharing one coordinate each — that is what makes
    // the corner square rather than a smooth curve.
    const prev = points[points.length - 1];
    points.push({ lat: prev.lat, lng: midLng });
    points.push({ lat: midLat, lng: midLng });
  }
  points.push({ lat: points[points.length - 1].lat, lng: to.lng });
  points.push({ ...to });

  // Measured along the generated path, not as the crow flies: the courier is
  // paid and timed on the road they actually drive.
  let travelled = 0;
  for (let i = 1; i < points.length; i++) travelled += distanceKm(points[i - 1], points[i]);

  return {
    points,
    distanceKm: travelled,
    durationMin: legDurationMin(travelled, vehicle),
  };
}

/**
 * How much faster than real time a run plays out. **Set this to 1 for production.**
 *
 * A delivery leg is ten to twenty minutes of real driving, and at 1x the courier
 * marker advances about five metres a second — which, on a camera framing a
 * five-kilometre route, is less than a pixel. The map is then indistinguishable
 * from a static picture for the entire length of a demo, and the one thing the
 * courier screen exists to show is the one thing nobody can see.
 *
 * Scaling the *clock* rather than nudging the position keeps every guarantee in
 * this module intact: position is still a pure function of (route, elapsed), a
 * killed app still resumes where it should, and the courier's screen and the
 * shopper's still agree, because both read the same scaled clock. The ETA is
 * derived from the same progress value, so the countdown falls in step with the
 * marker instead of contradicting it — the run simply happens on a fast clock.
 *
 * At 10x a twelve-minute leg is watchable in about seventy seconds, which is
 * roughly how long someone spends looking at a demo before tapping the next
 * thing.
 */
export const DEMO_TIME_SCALE = 10;

/**
 * How far along a leg the courier is, from 0 to 1.
 *
 * **Derived from the clock, never accumulated.** A `setInterval` that nudges a
 * stored position forward is wrong in three ways that all show up in a demo:
 * it stops advancing when no screen is mounted, it double-advances if two
 * screens mount at once, and it loses everything on a cold start. Anchoring to
 * `startedAt` means a courier who was eight minutes into a twenty-minute run is
 * still eight minutes in after the app is killed, backgrounded, or opened on the
 * shopper's phone instead.
 */
export function progressAt(startedAtIso: string, durationMin: number, nowMs: number): number {
  if (durationMin <= 0) return 1;
  const elapsedMin = ((nowMs - Date.parse(startedAtIso)) / 60000) * DEMO_TIME_SCALE;
  if (!Number.isFinite(elapsedMin)) return 0;
  return Math.min(1, Math.max(0, elapsedMin / durationMin));
}

export interface RoutePosition {
  at: LatLng;
  /** Compass degrees, 0 = north. Rotates the courier marker. */
  bearing: number;
}

/** Point on the path at `progress`, interpolated between the two waypoints around it. */
export function positionAlong(leg: RouteLeg, progress: number): RoutePosition {
  const points = leg.points;
  if (points.length < 2) return { at: points[0] ?? { lat: 0, lng: 0 }, bearing: 0 };

  const target = Math.min(1, Math.max(0, progress)) * leg.distanceKm;
  let travelled = 0;

  for (let i = 1; i < points.length; i++) {
    const step = distanceKm(points[i - 1], points[i]);
    if (travelled + step >= target || i === points.length - 1) {
      // Zero-length steps happen where two waypoints share a coordinate; fall
      // back to the far end rather than dividing by zero.
      const within = step > 0 ? (target - travelled) / step : 1;
      const at = {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * within,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * within,
      };
      return { at, bearing: bearingBetween(points[i - 1], points[i]) };
    }
    travelled += step;
  }

  return { at: points[points.length - 1], bearing: 0 };
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
