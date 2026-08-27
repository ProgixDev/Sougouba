/**
 * The delivery route, and how it is cut.
 *
 * This mirrors the app's own model rather than illustrating it. Two rules from
 * lib/courierRoute.ts and components/map/DeliveryMap.tsx carry over because they
 * are the difference between a picture of a delivery and the real mechanism:
 *
 * 1. Position is a pure function of (route, progress). Nothing is stored, so the
 *    puck and the ETA can never disagree — they read the same number.
 * 2. The path is drawn in three layers: a white casing underneath, the road
 *    already driven in neutral, the road ahead at full weight. Both halves
 *    include the cut point, so they meet exactly under the puck at any zoom.
 */

export type Pt = readonly [number, number];

/**
 * A deterministic dog-leg over a Montréal-style grid, in viewBox units.
 *
 * The whole run is kept above y=250 so the floating courier card at the bottom of
 * the frame never covers the pickup pin. This is the app's own lesson, in two
 * dimensions instead of three: a map-first layout must reserve padding matching
 * its floating UI, or the camera frames the route behind the header and the sheet.
 */
export const ROUTE: Pt[] = [
  [64, 250], [64, 206], [128, 206], [128, 160], [196, 160],
  [196, 118], [268, 118], [268, 80], [338, 80], [338, 48], [402, 48],
];

export const PICKUP: Pt = ROUTE[0];
export const DROPOFF: Pt = ROUTE[ROUTE.length - 1];

function segLengths(pts: Pt[]) {
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    out.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return out;
}

const LENS = segLengths(ROUTE);
export const TOTAL_LEN = LENS.reduce((a, b) => a + b, 0);

/** Where the courier is at `t` in [0,1]. */
export function positionAlong(t: number): Pt {
  const target = Math.max(0, Math.min(1, t)) * TOTAL_LEN;
  let run = 0;
  for (let i = 0; i < LENS.length; i++) {
    if (run + LENS[i] >= target) {
      const f = LENS[i] === 0 ? 0 : (target - run) / LENS[i];
      const a = ROUTE[i];
      const b = ROUTE[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    run += LENS[i];
  }
  return DROPOFF;
}

/**
 * Cut the route at the courier. Both halves include the cut point so they meet
 * exactly under the puck — a gap there is the single most visible way to get this
 * wrong, and it appears only at certain zooms if the halves are built separately.
 */
export function splitPath(t: number): { driven: Pt[]; ahead: Pt[] } {
  const cut = positionAlong(t);
  const target = Math.max(0, Math.min(1, t)) * TOTAL_LEN;
  let run = 0;
  let idx = 0;
  for (let i = 0; i < LENS.length; i++) {
    if (run + LENS[i] >= target) { idx = i; break; }
    run += LENS[i];
    idx = i + 1;
  }
  return {
    driven: [...ROUTE.slice(0, idx + 1), cut],
    ahead: [cut, ...ROUTE.slice(idx + 1)],
  };
}

export const toPath = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');

/** ETA derived from the same progress value the puck uses. */
export function etaMinutes(t: number, totalMinutes = 18) {
  return Math.max(1, Math.round((1 - Math.max(0, Math.min(1, t))) * totalMinutes));
}

/** A stylised street grid. Decorative, so it carries no data. */
export const STREETS = {
  h: [30, 48, 80, 118, 160, 206, 250, 296],
  v: [64, 128, 196, 268, 338, 402],
};
