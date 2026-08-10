/**
 * WCAG contrast audit over the semantic palette, in both themes.
 *
 * Dark mode was derived tonally and never reviewed on a screen, so this checks
 * it arithmetically instead of by eye. It also guards the light theme against
 * regressions, and re-checks `global.css` against `theme/colors.ts` — those two
 * are hand-mirrored, so they can silently disagree.
 *
 * Thresholds are WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text (≥18.66px
 * bold or ≥24px) and for non-text UI boundaries such as borders and icons.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { darkColors, lightColors, type ThemeColors } from '../theme/colors';
import { forest, mustard, semantic } from '../theme/tokens';

const AA_TEXT = 4.5;
const AA_LARGE = 3;
/**
 * `border` draws dividers and card edges — decoration, not the sole indicator of
 * any control — so WCAG 1.4.11's 3:1 does not apply and forcing it would make
 * every list look ruled. It still has to be *visible*, hence a floor.
 */
const SEPARATOR_MIN = 1.2;
/**
 * `borderStrong` is the resting edge of a text field. The field is also
 * identified by a persistent floating label and a leading icon, so this targets
 * clear visibility rather than the strict 3:1 that would make forms read heavy.
 */
const FIELD_EDGE_MIN = 2.4;

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

interface Pair {
  name: string;
  fg: keyof ThemeColors;
  bg: keyof ThemeColors;
  min: number;
}

const PAIRS: Pair[] = [
  { name: 'body text on background', fg: 'foreground', bg: 'background', min: AA_TEXT },
  { name: 'body text on card', fg: 'cardForeground', bg: 'card', min: AA_TEXT },
  { name: 'muted text on background', fg: 'mutedForeground', bg: 'background', min: AA_TEXT },
  { name: 'muted text on card', fg: 'mutedForeground', bg: 'card', min: AA_TEXT },
  { name: 'muted text on muted surface', fg: 'mutedForeground', bg: 'muted', min: AA_TEXT },
  { name: 'primary text on background', fg: 'primary', bg: 'background', min: AA_TEXT },
  { name: 'primary text on card', fg: 'primary', bg: 'card', min: AA_TEXT },
  { name: 'primary button label', fg: 'primaryForeground', bg: 'primary', min: AA_TEXT },
  { name: 'secondary button label', fg: 'secondaryForeground', bg: 'secondary', min: AA_TEXT },
  { name: 'accent surface label', fg: 'accentForeground', bg: 'accent', min: AA_TEXT },
  { name: 'destructive text on card', fg: 'destructive', bg: 'card', min: AA_TEXT },
  { name: 'destructive button label', fg: 'destructiveForeground', bg: 'destructive', min: AA_TEXT },
  { name: 'success text on card', fg: 'success', bg: 'card', min: AA_LARGE },
  { name: 'border against background', fg: 'border', bg: 'background', min: SEPARATOR_MIN },
  { name: 'border against card', fg: 'border', bg: 'card', min: SEPARATOR_MIN },
  { name: 'field edge against card', fg: 'borderStrong', bg: 'card', min: FIELD_EDGE_MIN },
  { name: 'field edge against background', fg: 'borderStrong', bg: 'background', min: FIELD_EDGE_MIN },
  { name: 'card against background', fg: 'card', bg: 'background', min: 1.05 },
];

let failures = 0;

function audit(themeName: string, colors: ThemeColors) {
  console.log(`\n${themeName}`);
  for (const pair of PAIRS) {
    const value = ratio(colors[pair.fg], colors[pair.bg]);
    const pass = value >= pair.min;
    if (!pass) failures++;
    const mark = pass ? 'ok  ' : 'FAIL';
    console.log(
      `  ${mark} ${value.toFixed(2).padStart(5)}:1  (min ${pair.min})  ${pair.name}` +
        `  [${colors[pair.fg]} on ${colors[pair.bg]}]`
    );
  }
}

audit('LIGHT', lightColors);
audit('DARK', darkColors);

// ── The merchant slab ────────────────────────────────────────────────────────
//
// `components/business/CounterHeader.tsx` paints a deep forest header that is
// dark in *both* themes, so its foreground colours are fixed rather than drawn
// from ThemeColors — which means the audit above cannot see them. They are the
// only text in the app outside the semantic palette, and they carry the shop's
// headline figures, so they get checked here against the lighter end of the
// gradient (the worst case for a light-on-dark pair).
const SLAB_LIGHTEST = forest[700];
const SLAB_PAIRS: { name: string; fg: string; min: number }[] = [
  { name: 'slab headline figures', fg: '#F3EFE6', min: AA_TEXT },
  { name: 'slab labels and captions', fg: forest[200], min: AA_TEXT },
  { name: 'day strip spikes', fg: mustard[300], min: AA_LARGE },
  { name: 'day strip elapsed track', fg: forest[300], min: AA_LARGE },
  { name: 'open indicator', fg: semantic.success.dark, min: AA_LARGE },
];

console.log('\nMERCHANT SLAB (dark in both themes)');
for (const pair of SLAB_PAIRS) {
  const value = ratio(pair.fg, SLAB_LIGHTEST);
  const pass = value >= pair.min;
  if (!pass) failures++;
  console.log(
    `  ${pass ? 'ok  ' : 'FAIL'} ${value.toFixed(2).padStart(5)}:1  (min ${pair.min})  ${pair.name}` +
      `  [${pair.fg} on ${SLAB_LIGHTEST}]`
  );
}

// ── global.css must mirror theme/colors.ts ───────────────────────────────────
const css = readFileSync(resolve(import.meta.dirname, '../global.css'), 'utf8');

function cssVars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z-]+):\s*([\d]+)\s+([\d]+)\s+([\d]+)/g)) {
    const hex =
      '#' + [m[2], m[3], m[4]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    out[m[1]] = hex.toUpperCase();
  }
  return out;
}

/** `:root { … }` is the light block; `.dark:root { … }` is the dark one. */
function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  return css.slice(open, css.indexOf('}', open));
}

const CAMEL_TO_VAR: Partial<Record<keyof ThemeColors, string>> = {
  background: 'background',
  foreground: 'foreground',
  card: 'card',
  cardForeground: 'card-foreground',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  secondary: 'secondary',
  secondaryForeground: 'secondary-foreground',
  accent: 'accent',
  accentForeground: 'accent-foreground',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  border: 'border',
  destructive: 'destructive',
  destructiveForeground: 'destructive-foreground',
  success: 'success',
  ring: 'ring',
};

function compare(label: string, selector: string, colors: ThemeColors) {
  const vars = cssVars(block(selector));
  if (Object.keys(vars).length === 0) {
    failures++;
    console.log(`\n  FAIL could not parse ${selector} in global.css`);
    return;
  }
  const mismatches: string[] = [];
  for (const [key, varName] of Object.entries(CAMEL_TO_VAR) as [keyof ThemeColors, string][]) {
    const fromCss = vars[varName];
    const fromTs = colors[key].toUpperCase();
    if (fromCss && fromCss !== fromTs) mismatches.push(`${varName}: css ${fromCss} vs ts ${fromTs}`);
    if (!fromCss) mismatches.push(`${varName}: missing from global.css`);
  }
  if (mismatches.length) {
    failures += mismatches.length;
    console.log(`\n${label} — global.css out of sync with theme/colors.ts`);
    mismatches.forEach((m) => console.log('  FAIL ' + m));
  } else {
    console.log(`\n${label} — global.css matches theme/colors.ts`);
  }
}

compare('LIGHT vars', ':root', lightColors);
compare('DARK vars', '.dark:root', darkColors);

console.log(failures === 0 ? '\nCONTRAST + TOKEN SYNC OK' : `\n${failures} PROBLEM(S)`);
process.exit(failures === 0 ? 0 : 1);
