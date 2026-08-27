/**
 * The woven band — geometry, in one place.
 *
 * This module is the single source of truth for the motif. It is imported by the
 * React component (which renders it inline so each triangle can be staggered) and
 * by scripts/extract-brand-kit.mjs (which renders it to band.svg for CSS-background
 * use). Node imports this .ts file directly, so the two can never drift.
 *
 * The band is AUTHORED, not extracted from the logo. In the logo it wraps a
 * three-dimensional basket, so its triangles are perspective-warped and its
 * baseline curves; lifted straight out it cannot tile and cannot sit flat between
 * two sections. What carries the brand is the motif — interlocking triangles,
 * point-down forest with an inset dot alternating with point-up terracotta, an
 * occasional mustard — so the motif is what is rebuilt, flat and seamlessly
 * tileable, in the app's token palette rather than the logo's literal olive and
 * orange. The palette is the system; the logo is where the shape came from.
 */

export const BAND_H = 24;
/** Half-base. Triangles tessellate at this pitch, so the pattern period is 2x. */
export const BAND_HALF = 16;
/** Triangles per tile — 6 down, 6 up. */
export const BAND_COUNT = 12;
/**
 * 192 x 24, an exact 8:1 tile, deliberately. Browsers tile a CSS background at
 * subpixel widths when the ratio is awkward and the rounding shows up as a
 * hairline seam at every repeat; at 8:1 any integer height gives an integer width.
 */
export const BAND_TILE = BAND_COUNT * BAND_HALF;

/** The raffia gap the logo shows between neighbouring triangles. */
const INSET = 1.1;

export type BandVariant = 'light' | 'dark';

export interface BandShape {
  /** Triangle index. Negative and >= COUNT are the deliberate edge overdraw. */
  i: number;
  kind: 'triangle' | 'dot';
  fill: string;
  d?: string;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
}

function palette(variant: BandVariant) {
  /*
   * On ivory, forest-600 is the darkest of the three and anchors the weave. On the
   * forest slab that same green sinks into the ground and leaves the dots floating
   * on nothing, so the dark variant lifts the triangle to forest-300 and darkens
   * the dots — the tonal derivation the app uses for dark mode, not an inversion.
   */
  const dark = variant === 'dark';
  return {
    forest: dark ? '#82BE9C' : '#246B47',
    terracotta: dark ? '#E67D48' : '#BF5122',
    mustard: dark ? '#E4B233' : '#D89A1E',
    dots: dark
      ? ['#123626', '#0A2018', '#17422E', '#123626', '#0A2018', '#17422E']
      : ['#EDC957', '#FAEEC4', '#F4DD8C', '#EDC957', '#FAEEC4', '#F4DD8C'],
  };
}

/** Floored modulo. JS gives -1 % 2 === -1, which flips the left edge triangle. */
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Shrink a triangle toward its centroid so neighbours don't touch. */
function shrink(pts: Array<[number, number]>): Array<[number, number]> {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
  return pts.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, len - INSET * 1.9) / len;
    return [cx + dx * k, cy + dy * k];
  });
}

/**
 * Build the band's shapes.
 *
 * `count` triangles are drawn, plus one overdrawn at each edge. The overdraw is
 * what closes the tile seam: the down-triangle straddling the join gets its left
 * half from one tile and its right half from the next. There are exactly as many
 * dot colours as down-triangles per tile, so the two halves land on the same
 * colour and read as one dot across the join.
 */
export function buildBand(count = BAND_COUNT, variant: BandVariant = 'light'): BandShape[] {
  const p = palette(variant);
  const out: BandShape[] = [];
  let dotN = 0;

  for (let i = -1; i <= count; i++) {
    const x = i * BAND_HALF;
    const down = mod(i, 2) === 1;
    const pts: Array<[number, number]> = down
      ? [[x, 0], [x + BAND_HALF * 2, 0], [x + BAND_HALF, BAND_H]]
      : [[x, BAND_H], [x + BAND_HALF * 2, BAND_H], [x + BAND_HALF, 0]];
    const s = shrink(pts);
    out.push({
      i,
      kind: 'triangle',
      fill: down ? p.forest : mod(i, 12) === 6 ? p.mustard : p.terracotta,
      d: `M ${s.map(([a, b]) => `${a.toFixed(2)} ${b.toFixed(2)}`).join(' L ')} Z`,
    });
    if (down) {
      out.push({
        i,
        kind: 'dot',
        fill: p.dots[dotN % p.dots.length],
        cx: x + BAND_HALF,
        cy: BAND_H * 0.42,
        rx: 3.2,
        ry: 3.9,
      });
      dotN++;
    }
  }
  return out;
}

/** How many triangles are needed to span `width` px at `height` px tall. */
export function bandCountFor(width: number, height: number) {
  const unit = (BAND_HALF * height) / BAND_H;
  return Math.ceil(width / unit) + 1;
}
