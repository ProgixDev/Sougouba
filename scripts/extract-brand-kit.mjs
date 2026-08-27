#!/usr/bin/env node
/**
 * Builds the web brand kit from `docs/logo.pdf`.
 *
 * The logo is pure Illustrator vector — no embedded rasters, no live fonts — so
 * `pdftocairo -svg` yields 270 discrete paths. That is what makes the landing
 * page's ornament real vector: every triangle, arc and letterform is separately
 * addressable and therefore separately animatable.
 *
 * Outputs to web/public/brand/:
 *   wordmark.svg      13 paths — "Sougouba" + leaf + gold dot + the two rules
 *   mark.svg          basket, contents and signal arcs (the full mark)
 *   basket.svg        basket + contents, arcs removed
 *   basket-vessel.svg the empty bowl and its woven band — the hero's fill target
 *   basket-item-N.svg the contents, in four x-clusters, so they drop in one by one
 *   arcs.svg          3 arcs + dot, each its own path, ids arc-1..3 + arc-dot
 *   logo-full.svg     everything, for OG images and print
 *   band.svg          AUTHORED, not extracted — see the note on the generator
 *   band-dark.svg     the same weave, retoned for the forest and graphite slabs
 *
 * Run: node scripts/extract-brand-kit.mjs
 * Needs poppler (`brew install poppler`) for pdftocairo.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBand, BAND_TILE, BAND_H } from '../web/lib/band.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/public/brand');

/**
 * Path indices, read off the extracted geometry once and asserted below. They
 * are hard-coded on purpose: deriving them heuristically every run would be a
 * silent-corruption risk, whereas a stale index set fails the guard loudly.
 */
const WORDMARK = [1, 2, 3, 5, 7, 8, 9, 10, 15, 23, 27, 35, 40];
const ARCS = [19, 22, 26, 37]; // outer -> inner, then the dot
const EXPECTED_PATHS = 270;

function pct2hex(r, g, b) {
  const c = (v) => Math.round(parseFloat(v) * 2.55).toString(16).toUpperCase().padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function parse(svg) {
  const tags = svg.match(/<path\b[^>]*?\/>/gs) ?? [];
  return tags.map((tag) => {
    const m = tag.match(/fill="rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)"/);
    const d = tag.match(/d="([^"]+)"/)[1];
    const nums = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    return {
      d,
      fill: m ? pct2hex(m[1], m[2], m[3]) : '#000000',
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    };
  });
}

/** Tight viewBox around the chosen paths; document order is preserved so overlaps stay correct. */
function emit(paths, idxs, { pad = 4, ids = null } = {}) {
  const sorted = [...idxs].sort((a, b) => a - b);
  const boxes = sorted.map((i) => paths[i].box);
  const x0 = Math.min(...boxes.map((b) => b[0])) - pad;
  const y0 = Math.min(...boxes.map((b) => b[1])) - pad;
  const x1 = Math.max(...boxes.map((b) => b[2])) + pad;
  const y1 = Math.max(...boxes.map((b) => b[3])) + pad;
  const body = sorted.map((i, n) => {
    const id = ids?.[n] ? ` id="${ids[n]}"` : '';
    return `  <path${id} fill="${paths[i].fill}" fill-rule="nonzero" d="${paths[i].d}"/>`;
  });
  const vb = [x0, y0, x1 - x0, y1 - y0].map((v) => +v.toFixed(2)).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none">\n${body.join('\n')}\n</svg>\n`;
}

/**
 * Renders the shared band geometry to a standalone, tileable SVG.
 *
 * The geometry itself lives in web/lib/band.ts — the same module the React
 * component imports — so the CSS-background version and the animated inline
 * version can never disagree. Node imports the .ts directly.
 */
function renderBand(shapes, variant) {
  const body = shapes.map((s) =>
    s.kind === 'triangle'
      ? `  <path data-i="${s.i}" fill="${s.fill}" d="${s.d}"/>`
      : `  <ellipse data-i="${s.i}" cx="${s.cx.toFixed(2)}" cy="${s.cy.toFixed(2)}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"/>`
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BAND_TILE} ${BAND_H}" width="${BAND_TILE}" height="${BAND_H}" preserveAspectRatio="none">\n` +
    `  <!-- ${variant} · tileable at ${BAND_TILE}x${BAND_H} (8:1). Geometry: web/lib/band.ts -->\n` +
    body.join('\n') +
    `\n</svg>\n`
  );
}

// ---------------------------------------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'sougouba-brand-'));
const svgPath = join(tmp, 'logo.svg');
try {
  execFileSync('pdftocairo', ['-svg', join(ROOT, 'docs/logo.pdf'), svgPath]);
} catch {
  console.error('pdftocairo not found. Install poppler:  brew install poppler');
  process.exit(1);
}

const paths = parse(readFileSync(svgPath, 'utf8'));

// Guards: a changed logo.pdf must fail here, not silently emit a mangled kit.
if (paths.length !== EXPECTED_PATHS) {
  console.error(`Expected ${EXPECTED_PATHS} paths, got ${paths.length}. logo.pdf changed — re-derive the index sets.`);
  process.exit(1);
}
const check = [[2, '#1C4425'], [1, '#C44C13'], [7, '#EB9E0A'], [19, '#D06311'], [15, '#4E7E23']];
for (const [i, hex] of check) {
  if (paths[i].fill !== hex) {
    console.error(`Path ${i} expected ${hex}, got ${paths[i].fill}. Index sets are stale.`);
    process.exit(1);
  }
}

const all = paths.map((_, i) => i);
const markAndArcs = all.filter((i) => !WORDMARK.includes(i));
const basket = markAndArcs.filter((i) => !ARCS.includes(i));

/*
 * The hero's spine is the brand film: an empty basket that fills. That needs the
 * bowl separable from what is in it, which the vector allows — the woven band sits
 * at the rim, so everything whose top edge is below it is vessel and everything
 * above is produce.
 *
 * The produce is then cut into four x-clusters so the items can drop in one at a
 * time rather than as a single blob. Clustering by horizontal centre can put a
 * stray path from one vegetable in its neighbour's group; at 55ms apart that is
 * invisible, and it buys four separately animatable files instead of 170KB of
 * inline path data in the document.
 */
const RIM_Y = 244;
const vessel = basket.filter((i) => paths[i].box[1] >= RIM_Y);
const contents = basket.filter((i) => paths[i].box[1] < RIM_Y);
const centres = contents.map((i) => (paths[i].box[0] + paths[i].box[2]) / 2);
const xMin = Math.min(...centres);
const xMax = Math.max(...centres);
const CLUSTERS = 4;
const clusterOf = (i) => {
  const c = (paths[i].box[0] + paths[i].box[2]) / 2;
  return Math.min(CLUSTERS - 1, Math.floor(((c - xMin) / (xMax - xMin + 0.001)) * CLUSTERS));
};
const items = Array.from({ length: CLUSTERS }, (_, k) => contents.filter((i) => clusterOf(i) === k));

mkdirSync(OUT, { recursive: true });
const files = {
  'wordmark.svg': emit(paths, WORDMARK),
  /*
   * The wordmark is set in deep forest green, which disappears on a dark ground.
   * A CSS brightness filter "works" but shifts every other hue in the lockup —
   * the terracotta g, the mustard o and the leaf all drift. Recolouring only the
   * forest paths keeps the accent colours exactly as drawn.
   */
  'wordmark-dark.svg': emit(paths, WORDMARK).replaceAll('#1C4425', '#F3EFE6'),
  'mark.svg': emit(paths, markAndArcs),
  'basket.svg': emit(paths, basket),
  'basket-vessel.svg': emit(paths, vessel),
  'arcs.svg': emit(paths, ARCS, { ids: ['arc-1', 'arc-2', 'arc-3', 'arc-dot'] }),
  'logo-full.svg': emit(paths, all, { pad: 8 }),
  'band.svg': renderBand(buildBand(undefined, 'light'), 'light'),
  'band-dark.svg': renderBand(buildBand(undefined, 'dark'), 'dark'),
};
/*
 * Every hero layer shares ONE viewBox — the mark's, arcs included — so the five
 * images can be stacked absolutely at the same size and each lands exactly where
 * it sits in the finished logo. Tight per-layer boxes would need per-layer offsets
 * to reassemble, which is five more numbers to get wrong; and positioning the arcs
 * by hand against a separately-boxed basket is precisely the fudge factor that
 * left them sitting on top of the produce instead of above it.
 */
const markBox = (() => {
  const b = markAndArcs.map((i) => paths[i].box);
  const pad = 4;
  const x0 = Math.min(...b.map((v) => v[0])) - pad;
  const y0 = Math.min(...b.map((v) => v[1])) - pad;
  const x1 = Math.max(...b.map((v) => v[2])) + pad;
  const y1 = Math.max(...b.map((v) => v[3])) + pad;
  return [x0, y0, x1 - x0, y1 - y0].map((v) => +v.toFixed(2)).join(' ');
})();
function emitInMarkBox(idxs) {
  const body = [...idxs].sort((a, b) => a - b)
    .map((i) => `  <path fill="${paths[i].fill}" fill-rule="nonzero" d="${paths[i].d}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markBox}" fill="none">\n${body.join('\n')}\n</svg>\n`;
}
files['basket-vessel.svg'] = emitInMarkBox(vessel);
items.forEach((idxs, k) => {
  files[`basket-item-${k + 1}.svg`] = emitInMarkBox(idxs);
});
// The arcs in the same box, with ids, so SignalArcs can be generated from a file
// that already agrees with the basket layers about where everything is.
files['arcs-layer.svg'] = emitInMarkBox(ARCS).replace(
  /<path fill=/g,
  () => '<path data-arc fill='
);
console.log(`\nhero layer viewBox: ${markBox}`);

for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  console.log(`${name.padEnd(16)} ${String(svg.length).padStart(7)} bytes`);
}
console.log(`\nWrote ${Object.keys(files).length} files to web/public/brand/`);
