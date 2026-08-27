#!/usr/bin/env node
/**
 * WCAG 2.1 AA audit over the site's semantic tokens, in BOTH themes.
 *
 * The app ships the same check for a reason: dark mode contrast cannot be
 * inferred from light mode, and "it looks fine" is not a measurement. Two of the
 * app's own token choices — terracotta-600 over 500, neutral-600 over 500 —
 * exist only because this kind of audit caught them.
 *
 * Values are read out of app/globals.css so the audit cannot drift from what
 * actually ships.
 *
 * Run: npm run verify:contrast
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const AA_TEXT = 4.5;
const AA_LARGE = 3;      // >=24px, or >=18.66px bold
const UI_GLYPH = 3;      // icons and data marks
const SEPARATOR_MIN = 1.2;   // `border` is decoration, never the sole indicator
const FIELD_EDGE_MIN = 2.4;  // `border-strong`; the field also has a label + ring

function parseTheme(css, selector) {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
  const out = {};
  for (const line of body.split('\n')) {
    const m = line.match(/--color-([a-z-]+):\s*([\d]+)\s+([\d]+)\s+([\d]+)/);
    if (m) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

const srgb = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Composite a translucent colour over a ground, the way the browser will. */
const over = (fg, bg, alpha) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
const themes = { light: parseTheme(css, ':root'), dark: parseTheme(css, '.dark') };

/** [label, foreground token, background token, threshold] */
const CHECKS = (t) => [
  ['body text on background', t.foreground, t.background, AA_TEXT],
  ['body text on card', t['card-foreground'], t.card, AA_TEXT],
  ['muted text on background', t['muted-foreground'], t.background, AA_TEXT],
  ['muted text on card', t['muted-foreground'], t.card, AA_TEXT],
  ['muted text on muted', t['muted-foreground'], t.muted, AA_TEXT],
  ['primary label on background', t.primary, t.background, AA_TEXT],
  ['primary label on card', t.primary, t.card, AA_TEXT],
  ['secondary label on card', t.secondary, t.card, AA_TEXT],
  ['CTA text on secondary fill', t['secondary-foreground'], t.secondary, AA_TEXT],
  ['button text on primary fill', t['primary-foreground'], t.primary, AA_TEXT],
  ['ink on accent fill', t['accent-foreground'], t.accent, AA_TEXT],
  ['destructive text on card', t.destructive, t.card, AA_TEXT],
  ['destructive text on background', t.destructive, t.background, AA_TEXT],
  ['success TEXT on card (uses -strong)', t['success-strong'], t.card, AA_TEXT],
  ['success TEXT on background (uses -strong)', t['success-strong'], t.background, AA_TEXT],
  ['focus ring on background', t.ring, t.background, UI_GLYPH],
  ['focus ring on card', t.ring, t.card, UI_GLYPH],
  ['accent TEXT on card (uses -strong)', t['accent-strong'], t.card, AA_TEXT],
  ['accent glyph on card (uses -strong)', t['accent-strong'], t.card, UI_GLYPH],
  ['field edge on card', t['border-strong'], t.card, FIELD_EDGE_MIN],
  ['divider on background', t.border, t.background, SEPARATOR_MIN],
  ['divider on card', t.border, t.card, SEPARATOR_MIN],
];

/**
 * The role slabs are dark in BOTH themes, so they are audited against their own
 * fixed inks rather than the theme's. The mustard corner glow on the courier slab
 * is composited in first — it is drawn under the text, and against it
 * neutral-400 fell below AA in the app, which is why the ink is neutral-300.
 */
const FOREST_SLAB = [23, 66, 46];     // #17422E
const GRAPHITE_SLAB = [41, 37, 32];   // #292520
const MUSTARD_GLOW = [228, 178, 51];  // #E4B233 at the corner
const GLOW_ALPHA = 0.18;
const SLAB_CHECKS = [
  ['slab ink on forest slab', [243, 239, 230], FOREST_SLAB, AA_TEXT],
  ['slab muted (forest-200) on forest slab', [175, 215, 192], FOREST_SLAB, AA_TEXT],
  ['courier ink on graphite', [246, 242, 233], GRAPHITE_SLAB, AA_TEXT],
  ['courier muted (neutral-300) on graphite', [201, 195, 184], GRAPHITE_SLAB, AA_TEXT],
  ['courier muted (neutral-300) over mustard glow', [201, 195, 184], over(MUSTARD_GLOW, GRAPHITE_SLAB, GLOW_ALPHA), AA_TEXT],
  ['courier accent (mustard-300) over mustard glow', [237, 201, 87], over(MUSTARD_GLOW, GRAPHITE_SLAB, GLOW_ALPHA), UI_GLYPH],
  ['band forest triangle on forest slab', [130, 190, 156], FOREST_SLAB, UI_GLYPH],
  ['band terracotta triangle on forest slab', [230, 125, 72], FOREST_SLAB, UI_GLYPH],
  ['band forest triangle on ivory', [36, 107, 71], [250, 249, 247], UI_GLYPH],
];

let failures = 0;
let checked = 0;
for (const [name, tokens] of Object.entries(themes)) {
  console.log(`\n${name.toUpperCase()}`);
  for (const [label, fg, bg, min] of CHECKS(tokens)) {
    if (!fg || !bg) { console.log(`  ?  ${label} — token missing`); failures++; continue; }
    const r = ratio(fg, bg);
    const ok = r >= min;
    checked++;
    if (!ok) failures++;
    console.log(`  ${ok ? '.' : 'X'}  ${label.padEnd(38)} ${r.toFixed(2).padStart(6)}:1  (min ${min})  ${hex(fg)} on ${hex(bg)}`);
  }
}

console.log('\nROLE SLABS (fixed in both themes)');
for (const [label, fg, bg, min] of SLAB_CHECKS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  checked++;
  if (!ok) failures++;
  console.log(`  ${ok ? '.' : 'X'}  ${label.padEnd(46)} ${r.toFixed(2).padStart(6)}:1  (min ${min})`);
}

console.log(`\n${checked} checks, ${failures} failing.`);
process.exit(failures ? 1 : 0);
