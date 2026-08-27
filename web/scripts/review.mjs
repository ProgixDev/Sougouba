#!/usr/bin/env node
/**
 * Section-by-section review captures.
 *
 * Full-page screenshots are misleading on this page: sticky sections render at
 * their initial position, lazy images below the fold never load, and anything
 * driven by an IntersectionObserver or by scroll progress is frozen at its
 * starting state. This scrolls to each section and shoots the viewport, which is
 * what a reviewer actually sees.
 *
 * Usage: node scripts/review.mjs <outDir> [light|dark] [baseUrl]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './cdp.mjs';

const [, , outDir = '/tmp/review', scheme = 'light', base = 'http://localhost:4319'] = process.argv;

/** id, plus how far into the section to sit (0 = its top aligned near the top). */
const STOPS = [
  ['hero', 0],
  ['commerces', 0],
  ['verticales', 0],
  ['rayon', 0.15],
  ['comment', 0],
  ['suivi', 0.5],
  ['applications', 0.15],
  ['applications', 0.5],
  ['applications', 0.85],
  ['partenaire', 0],
  ['livreurs', 0],
  ['note', 0],
  ['prevenir', 0],
  ['footer', 0],
];

mkdirSync(outDir, { recursive: true });
const b = await launch();
const p = await b.newPage();
await p.setColorScheme(scheme);
await p.setViewport(1280, 880);
await p.goto(base, 1800);

for (const [i, [id, frac]] of STOPS.entries()) {
  const y = await p.evaluate(`(() => {
    const el = ${id === 'hero' ? 'document.querySelector("main > section")' : id === 'footer' ? 'document.querySelector("footer")' : `document.getElementById(${JSON.stringify(id)})`};
    if (!el) return null;
    const top = el.getBoundingClientRect().top + window.scrollY;
    return Math.max(0, Math.round(top + el.offsetHeight * ${frac} - (${frac} === 0 ? 0 : 0)));
  })()`);
  if (y === null) { console.log(`  ?  #${id} not found`); continue; }
  await p.evaluate(`window.scrollTo(0, ${y})`);
  await new Promise((r) => setTimeout(r, 1100));
  const name = `${String(i).padStart(2, '0')}-${id}${frac ? `-${frac}` : ''}-${scheme}.png`;
  writeFileSync(join(outDir, name), await p.screenshot({ fullPage: false }));
  console.log(name);
}
await p.close();
b.close();
